# Portfolio — Cloudflare Pages setup (Bangla guide)

Ei folder e ache:
- `public/`   → website (index.html + seed/hero.jpg)
- `functions/api/[[route]].js` → backend (login, save, image upload, contact form, meeting booking)

Free tools lagbe: GitHub, Cloudflare, Resend (email pathanor jonno).

## Step 1 — GitHub e upload
1. github.com e notun repo banan (jemon `portfolio`). Private rakhleo hobe.
2. Ei folder er **public** ar **functions** folder duto repo te upload korun (Add file → Upload files).

## Step 2 — Cloudflare Pages deploy
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → repo select korun.
2. Framework preset: **None**. Build command: **khali rakhun**. Build output directory: **public**.
3. **Save and Deploy**. Kichukkhon por `https://<apnar-project>.pages.dev` link pabo.

## Step 3 — KV (data ar image save howar jayga)
1. Cloudflare → **Storage & Databases** → **KV** → **Create namespace** → nam din `portfolio-site`.
2. Pages project → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - Variable name: `SITE`   (hubohu eita, boro hater)
   - Namespace: `portfolio-site`

## Step 4 — Email (Resend, free)
1. resend.com e **apnar Gmail diye** sign up korun (je mail e message pete chan).
2. **API Keys** → Create API Key → key copy korun (`re_...`).
3. Free plan e `onboarding@resend.dev` theke shudhu **apnar nijer signup email** e mail jay. Apnar dorkar thik eita, tai kono domain lagbe na.

## Step 5 — Variables
Pages project → **Settings** → **Variables and Secrets** → Add:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | ekta shokto password (Secret) |
| `OWNER_EMAIL` | apnar Gmail (Resend e jeta diye sign up korechen) |
| `RESEND_API_KEY` | Resend er `re_...` key (Secret) |
| `OWNER_TZ` | `Asia/Dhaka` (optional) |

## Step 6 — Redeploy
Binding ar variable add korar por **Deployments** → latest deployment → **Retry deployment** (ba repo te ekta chhoto commit korun).

## Admin kibhabe use korben
1. Browser e jan: `https://apnar-site.pages.dev/#admin`
2. Password din → login hole **Edit site** button ashbe (shudhu apnar browser e).
3. Edit kore **Save & publish** chaple site e sathe sathe live hoy. Notun deploy lagbe na.
4. Visitor-ra kokhono Edit button dekhbe na. Login 7 din thake. Sidebar er **Log out** diye logout kora jay.

## Contact form ar Meeting booking
- Contact form submit korle apnar mail e ashe. **Reply** chaple sorasori visitor ke reply jay.
- Meeting request e apnar mail e nam, email, somoy (Dhaka time + visitor er time), ar ek click e **Google Calendar e add** korar link thake.
- Spam theke bachte: hidden honeypot + ghonta e 8-ta request limit ache.
- Backup: protita message/booking KV te 60 din rakha hoy.

## Custom domain
Pages project → **Custom domains** → apnar domain add korun.

## Somossha hole
- Form e "Could not send": `RESEND_API_KEY`, `OWNER_EMAIL` thik ache kina dekhun, ar `OWNER_EMAIL` ta Resend signup email-er sathe mile kina.
- Login hoy na: `ADMIN_PASSWORD` set kore redeploy korechen kina dekhun.
- Save hoy na: KV binding er nam thik `SITE` kina dekhun.
