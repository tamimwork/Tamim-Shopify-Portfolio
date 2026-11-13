// Cloudflare Pages Function: handles everything under /api/*
// Needs: KV binding "SITE"; env vars ADMIN_PASSWORD, OWNER_EMAIL, RESEND_API_KEY (optional: MAIL_FROM, OWNER_TZ)
const enc = new TextEncoder();
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const clip = (s, n) => String(s || "").trim().slice(0, n);
const okMail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(req.headers.get("cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Date.now() > +exp) return false;
  return same(sig, await hmac(env.ADMIN_PASSWORD, "adm." + exp));
}
async function limit(env, req) {
  if (!env.SITE) return true;
  const ip = req.headers.get("CF-Connecting-IP") || "x";
  const k = "rl:" + ip + ":" + ((Date.now() / 36e5) | 0);
  const n = +(await env.SITE.get(k) || 0);
  if (n >= 8) return false;
  await env.SITE.put(k, String(n + 1), { expirationTtl: 3700 });
  return true;
}
async function sendMail(env, { subject, text, replyTo }) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) throw new Error("Email is not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Portfolio <onboarding@resend.dev>", to: [env.OWNER_EMAIL], reply_to: replyTo, subject, text }),
  });
  if (!r.ok) throw new Error("Mail provider error: " + (await r.text()));
}
async function backup(env, kind, obj) {
  try { if (env.SITE) await env.SITE.put("msg:" + Date.now(), JSON.stringify({ kind, ...obj }), { expirationTtl: 60 * 864e2 }); } catch (e) {}
}

export async function onRequest({ request: req, env, params }) {
  const r = (params.route || []).join("/"), m = req.method;
  try {
    if (r === "content" && m === "GET") {
      const v = env.SITE ? await env.SITE.get("content") : null;
      return new Response(v || "null", { headers: { "content-type": "application/json", "cache-control": "no-cache" } });
    }
    if (r.startsWith("img/") && m === "GET") {
      const { value, metadata } = await env.SITE.getWithMetadata("img:" + r.slice(4), "arrayBuffer");
      if (!value) return new Response("Not found", { status: 404 });
      return new Response(value, { headers: { "content-type": (metadata && metadata.type) || "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
    }
    if (r === "me") return J({ admin: await isAdmin(req, env) });
    if (r === "login" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD) return J({ error: "ADMIN_PASSWORD is not set" }, 500);
      if (!same(await hmac("x", String(b.password || "")), await hmac("x", env.ADMIN_PASSWORD))) {
        await new Promise((ok) => setTimeout(ok, 600));
        return J({ error: "Wrong password" }, 401);
      }
      const exp = Date.now() + 7 * 864e5;
      const tok = exp + "." + (await hmac(env.ADMIN_PASSWORD, "adm." + exp));
      return J({ ok: true }, 200, { "set-cookie": `adm=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` });
    }
    if (r === "logout") return J({ ok: true }, 200, { "set-cookie": "adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    if (r === "content" && m === "PUT") {
      if (!(await isAdmin(req, env))) return J({ error: "Unauthorized" }, 401);
      const t = await req.text();
      if (t.length > 900000) return J({ error: "Content too large" }, 413);
      JSON.parse(t);
      await env.SITE.put("content", t);
      return J({ ok: true });
    }
    if (r === "upload" && m === "POST") {
      if (!(await isAdmin(req, env))) return J({ error: "Unauthorized" }, 401);
      const type = req.headers.get("content-type") || "";
      if (!/^image\//.test(type)) return J({ error: "Images only" }, 400);
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 2.5 * 1024 * 1024) return J({ error: "Image too large" }, 413);
      const id = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await env.SITE.put("img:" + id, buf, { metadata: { type } });
      return J({ id });
    }
    if (r === "contact" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.hp) return J({ ok: true });
      const name = clip(b.name, 120), email = clip(b.email, 200), message = clip(b.message, 4000);
      if (!name || !okMail(email) || !message) return J({ error: "Please fill all fields" }, 400);
      if (!(await limit(env, req))) return J({ error: "Too many requests" }, 429);
      await backup(env, "contact", { name, email, message });
      await sendMail(env, { subject: "New message from " + name, replyTo: email, text: `Name: ${name}\nEmail: ${email}\n\n${message}` });
      return J({ ok: true });
    }
    if (r === "book" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      const name = clip(b.name, 120), email = clip(b.email, 200), note = clip(b.note, 2000), title = clip(b.title, 120) || "Meeting";
      const start = +b.start, dur = Math.min(Math.max(+b.dur || 30, 5), 240), tz = clip(b.tz, 60);
      if (!name || !okMail(email) || !(start > Date.now())) return J({ error: "Invalid booking" }, 400);
      if (!(await limit(env, req))) return J({ error: "Too many requests" }, 429);
      const mine = env.OWNER_TZ || "Asia/Dhaka";
      const when = (z) => { try { return new Date(start).toLocaleString("en-GB", { timeZone: z, dateStyle: "full", timeStyle: "short" }); } catch (e) { return ""; } };
      const f = (x) => new Date(x).toISOString().replace(/[-:]|\.\d{3}/g, "");
      const gcal = "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: `${title} with ${name}`, dates: `${f(start)}/${f(start + dur * 6e4)}`, details: `Booked via portfolio.\n${email}\n${note}`, add: email });
      await backup(env, "book", { name, email, note, start, dur });
      await sendMail(env, {
        subject: `Meeting request: ${name} · ${when(mine)}`, replyTo: email,
        text: `New meeting request\n\nName: ${name}\nEmail: ${email}\nWhen (${mine}): ${when(mine)}\nWhen (visitor ${tz || "local"}): ${when(tz || "UTC")}\nLength: ${dur} min\n\nNote:\n${note || "-"}\n\nAdd to Google Calendar and invite them in one click:\n${gcal}\n\nReply to this email to confirm.`,
      });
      return J({ ok: true });
    }
    return J({ error: "Not found" }, 404);
  } catch (e) {
    return J({ error: String((e && e.message) || e) }, 500);
  }
}
