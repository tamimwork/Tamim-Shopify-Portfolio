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
async function sendMail(env, { subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) throw new Error("Email is not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Portfolio <onboarding@resend.dev>", to: [env.OWNER_EMAIL], reply_to: replyTo, subject, text, html }),
  });
  if (!r.ok) throw new Error("Mail provider error: " + (await r.text()));
}
async function backup(env, kind, obj) {
  try { if (env.SITE) await env.SITE.put("msg:" + Date.now(), JSON.stringify({ kind, ...obj }), { expirationTtl: 60 * 864e2 }); } catch (e) {}
}

// ---------- Email templates (match the site theme) ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (s) => esc(s).replace(/\n/g, "<br>");
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
const C = { bg: "#080d0b", card: "#111a16", box: "#0c1210", bd: "#22302a", tx: "#eef5f1", mu: "#93a49b", ac: "#3ee0a5", on: "#04110b", tint: "#10291f", tintBd: "#1f4a39" };
const btn = (href, label, primary) => `<a href="${esc(href)}" target="_blank" style="display:inline-block;margin:0 8px 8px 0;padding:14px 22px;border-radius:12px;font:600 15px ${FONT};text-decoration:none;${primary ? `background:${C.ac};color:${C.on};border:1px solid ${C.ac};` : `background:${C.card};color:${C.tx};border:1px solid ${C.bd};`}">${label}</a>`;
const row = (html, pad = "0 24px 18px") => `<tr><td style="padding:${pad};">${html}</td></tr>`;
const person = (name, email) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="48" valign="middle"><div style="width:48px;height:48px;line-height:48px;border-radius:50%;background:${C.ac};color:${C.on};text-align:center;font:700 20px/48px ${FONT};">${esc((name || "?").trim().charAt(0).toUpperCase())}</div></td>
<td valign="middle" style="padding-left:14px;"><div style="font:700 17px ${FONT};color:${C.tx};">${esc(name)}</div><a href="mailto:${esc(email)}" style="font:400 14px ${FONT};color:${C.ac};text-decoration:none;">${esc(email)}</a></td></tr></table>`;
const detail = (k, v) => `<tr><td style="padding:10px 0;border-top:1px solid ${C.bd};font:500 13px ${FONT};color:${C.mu};" width="38%">${k}</td><td style="padding:10px 0;border-top:1px solid ${C.bd};font:600 14px ${FONT};color:${C.tx};">${v}</td></tr>`;
function shell(env, req, { pre, tag, title, rows }) {
  const brand = env.SITE_NAME ? esc(env.SITE_NAME) : `Tamim<span style="color:${C.ac};">.</span>dev`, site = new URL(req.url).origin;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding:0 6px 16px;font:700 18px ${FONT};color:${C.tx};">${brand}</td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.bd};border-radius:20px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${C.ac};">&nbsp;</td></tr>
${row(`<span style="display:inline-block;padding:6px 12px;border-radius:99px;background:${C.tint};border:1px solid ${C.tintBd};font:700 11px ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${C.ac};">${tag}</span><h1 style="margin:14px 0 0;font:700 26px/1.2 ${FONT};color:${C.tx};">${title}</h1>`, "28px 24px 18px")}
${rows}
</table></td></tr>
<tr><td style="padding:18px 6px 0;font:400 12px/1.6 ${FONT};color:${C.mu};text-align:center;">Sent from <a href="${esc(site)}" style="color:${C.ac};text-decoration:none;">${esc(site.replace(/^https?:\/\//, ""))}</a><br>Just hit reply to answer directly.</td></tr>
</table></td></tr></table></body></html>`;
}
function mailContact(env, req, { name, email, message }) {
  return shell(env, req, {
    pre: `${name}: ${message.slice(0, 90)}`, tag: "📩 New message", title: "You have a new message",
    rows: row(person(name, email)) +
      row(`<div style="background:${C.box};border-left:3px solid ${C.ac};border-radius:12px;padding:16px 18px;font:400 15px/1.7 ${FONT};color:${C.tx};">${nl(message)}</div>`) +
      row(btn("mailto:" + email + "?subject=" + encodeURIComponent("Re: your message"), "Reply to " + esc(name.split(" ")[0]), true), "0 24px 22px"),
  });
}
function mailBook(env, req, { name, email, note, start, dur, tz, mine, title, gcal }) {
  const fd = (z) => { try { return new Date(start).toLocaleDateString("en-GB", { timeZone: z, weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
  const ft = (z) => { try { return new Date(start).toLocaleTimeString("en-US", { timeZone: z, hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
  const theirs = tz && tz !== mine ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid ${C.tintBd};font:400 13px/1.5 ${FONT};color:${C.mu};">Their time (${esc(tz)}): <b style="color:${C.tx};">${esc(fd(tz))} · ${esc(ft(tz))}</b></div>` : "";
  return shell(env, req, {
    pre: `${name} wants to meet on ${fd(mine)} at ${ft(mine)}`, tag: "📅 Meeting request", title: esc(title) + " with " + esc(name.split(" ")[0]),
    rows: row(person(name, email)) +
      row(`<div style="background:${C.tint};border:1px solid ${C.tintBd};border-radius:16px;padding:20px;"><div style="font:700 11px ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${C.ac};">When · your time (${esc(mine)})</div><div style="margin-top:8px;font:700 19px/1.3 ${FONT};color:${C.tx};">${esc(fd(mine))}</div><div style="font:700 30px/1.2 ${FONT};color:${C.ac};">${esc(ft(mine))}</div>${theirs}</div>`) +
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detail("Length", dur + " minutes")}${detail("Email", `<a href="mailto:${esc(email)}" style="color:${C.ac};text-decoration:none;">${esc(email)}</a>`)}${tz ? detail("Their timezone", esc(tz)) : ""}</table>`, "0 24px 12px") +
      (note ? row(`<div style="font:700 11px ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${C.mu};margin-bottom:8px;">Note</div><div style="background:${C.box};border-left:3px solid ${C.ac};border-radius:12px;padding:14px 16px;font:400 15px/1.7 ${FONT};color:${C.tx};">${nl(note)}</div>`) : "") +
      row(btn(gcal, "📅 Add to Google Calendar", true) + btn("mailto:" + email + "?subject=" + encodeURIComponent("Confirmed: " + title), "Reply to confirm", false), "6px 24px 22px"),
  });
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
      await sendMail(env, { subject: "📩 New message from " + name, replyTo: email, text: `Name: ${name}\nEmail: ${email}\n\n${message}`, html: mailContact(env, req, { name, email, message }) });
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
        subject: `📅 Meeting request: ${name} · ${new Date(start).toLocaleString("en-GB", { timeZone: mine, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}`, replyTo: email,
        text: `New meeting request\n\nName: ${name}\nEmail: ${email}\nWhen (${mine}): ${when(mine)}\nWhen (visitor ${tz || "local"}): ${when(tz || "UTC")}\nLength: ${dur} min\n\nNote:\n${note || "-"}\n\nAdd to Google Calendar and invite them in one click:\n${gcal}\n\nReply to this email to confirm.`,
        html: mailBook(env, req, { name, email, note, start, dur, tz, mine, title, gcal }),
      });
      return J({ ok: true });
    }
    return J({ error: "Not found" }, 404);
  } catch (e) {
    return J({ error: String((e && e.message) || e) }, 500);
  }
}