# PriyaGold TA/DA — Cloudflare Worker (auto-sync from Google Sheet)

Ye Worker Google Sheet ki "master" tab se employee data (State/Designation/HQ/User/Password)
fetch karke Cloudflare KV mein cache karta hai, aur endpoints deta hai:

- `GET /api/dropdown` — dropdown structure (State → Designation → HQ → User), **password nahi hota isme**.
- `POST /api/verify` — `{state, designation, hq, user, password}` bhejo, `{valid: true/false}` milega.
  Password check hamesha server-side hota hai, client ko kabhi bhi real password nahi bheja jata.
- `GET`/`POST` `/api/refresh?secret=...` — turant (cron ka wait kiye bina) Sheet se refresh karo.
- `GET /api/status` — last refresh ka timestamp.

Data automatically **12:00 PM, 5:00 PM aur 7:00 PM IST** har din refresh hota hai (Cron Trigger). Manual
`git commit` ki zaroorat khatam ho gayi hai.

> Is machine par Node.js install nahi hai, isliye neeche **Option A: Dashboard se (bina CLI ke)**
> guide di gayi hai — sirf browser se sab kaam ho jayega. Agar aap Node.js install karte ho to
> Option B (Wrangler CLI) bhi diya hai, wo thoda fast hai future updates ke liye.

---

## 1. Google Sheet taiyar karo

1. Ek Google Sheet banao (ya existing use karo), usme ek tab ka naam rakho: **`master`**.
2. Columns exactly ye rakho (pehli row header): `State`, `User Designation`, `HQ`, `User`, `Password`.
3. Sheet ko share karo: **Share → General access → "Anyone with the link" → Viewer**.
   (Public CSV export ke liye ye zaroori hai — koi Google login/credential store nahi karna padega.)
4. Sheet URL se **Sheet ID** copy karo:
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

---

## Option A — Cloudflare Dashboard se deploy (Node.js/CLI ki zaroorat nahi)

### A1. Worker banao
1. [dash.cloudflare.com](https://dash.cloudflare.com) pe login/signup karo (free plan kaafi hai).
2. Left sidebar → **Workers & Pages → Create → Create Worker**.
3. Naam do: `priyagold-tada-worker` → **Deploy** (default "Hello World" code deploy ho jayega, koi baat nahi).
4. Deploy hone ke baad → **Edit code** (ya "Quick Edit") button dabao.
5. Editor mein jo default code hai use pura delete karo, aur [`src/index.js`](src/index.js) ka **pura content** copy-paste karo.
6. **Save and deploy**.

### A2. KV namespace banao aur bind karo
1. Sidebar → **Workers & Pages → KV** → **Create a namespace** → naam do: `DROPDOWN_KV` → Add.
2. Apne Worker (`priyagold-tada-worker`) pe wapas jao → **Settings → Variables** (ya "Bindings").
3. **KV Namespace Bindings → Add binding**:
   - Variable name: `DROPDOWN_KV`
   - KV namespace: (jo abhi banaya, `DROPDOWN_KV` select karo)
4. Save.

### A3. Environment variables aur secret set karo
Wahi **Settings → Variables** page pe:

1. **Environment Variables** mein add karo (plaintext, "Encrypt" tick mat karo):
   - `SHEET_ID` = aapka Google Sheet ID
   - `SHEET_NAME` = `master`
2. Ek aur variable add karo, but is baar **"Encrypt"** ON karo (ye secret hai):
   - `REFRESH_SECRET` = koi bhi strong random string (jaise `pg-refresh-8x2k9m`) — ye aap khud yaad rakhna, isse manual refresh trigger hoga.
3. Save and deploy.

### A4. Cron Trigger set karo (12 PM, 5 PM & 7 PM IST auto-refresh)
1. Worker → **Settings → Triggers → Cron Triggers → Add Cron Trigger**.
2. Pehla: `30 6 * * *`  (= 12:00 PM IST)
3. Doosra: `30 11 * * *`  (= 5:00 PM IST)
4. Teesra: `30 13 * * *`  (= 7:00 PM IST)
5. Save.

### A5. Test karo
Browser mein apna Worker URL kholo (Worker ke overview page pe URL milega, kuch aisa):
```
https://priyagold-tada-worker.<your-subdomain>.workers.dev/api/dropdown
```
Pehli baar khulne mein 1-2 second lag sakte hain (Worker khud Sheet se fetch karke cache bharta hai). JSON dikhna chahiye jisme aapke States/Designations/HQ/Users hon (password nahi hoga).

---

## Option B — Wrangler CLI se deploy (agar Node.js install karna chahte ho)

```bash
npm install -g wrangler
wrangler login
cd cloudflare-worker
wrangler kv namespace create DROPDOWN_KV
```
Output se mila `id` copy karke `wrangler.toml` mein `id = "..."` line update karo, aur
`SHEET_ID`/`SHEET_NAME` bhi update karo. Fir:
```bash
wrangler secret put REFRESH_SECRET
wrangler deploy
```

---

## 2. index.html ko Worker se connect karo

[`../index.html`](../index.html) mein `WORKER_BASE_URL` constant ko apne deployed Worker URL se update karo:

```js
const WORKER_BASE_URL = 'https://priyagold-tada-worker.<your-subdomain>.workers.dev';
```

Ye change karke GitHub pe push karo.

## 3. Cloudflare Pages pe static site host karo

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. GitHub authorize karo, apna repo (`PriyaGold_UP_DA_DA`) select karo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(khali chhod do)*
   - Build output directory: `/`
4. **Save and Deploy**.

Kuch second mein ek URL milega jaisa `https://priyagold-up-da-da.pages.dev` — yahi aapki live site hai.

---

## Turant (instant) JSON update kaise karein?

Do tareeke hain:

**1. Automatic** — kuch nahi karna, Worker khud **12:00 PM, 5:00 PM aur 7:00 PM IST** roz Sheet se fetch kar lega.

**2. Turant/manual** — Sheet update karne ke turant baad agar aapko turant reflect karana hai
(cron ka wait nahi karna), to bas ye URL browser mein khol do:

```
https://priyagold-tada-worker.<your-subdomain>.workers.dev/api/refresh?secret=<aapka REFRESH_SECRET>
```

Response `{"success":true,"stateCount":N}` dikhega — matlab dropdown data turant refresh ho gaya.
Isi tarah `curl` se bhi kar sakte ho:

```bash
curl -X POST "https://priyagold-tada-worker.<your-subdomain>.workers.dev/api/refresh" \
  -H "X-Refresh-Secret: <aapka REFRESH_SECRET>"
```

Last refresh kab hua check karne ke liye:
```
https://priyagold-tada-worker.<your-subdomain>.workers.dev/api/status
```

---

## Notes

- `test.ipynb` (Excel → JSON) hata diya gaya hai — ab zaroorat nahi, master data seedha Google
  Sheet ki `master` tab mein maintain hota hai.
- `google1.js` (Apps Script `doPost`) is Worker se unrelated hai — wo form-submission entries
  ko "Form Data" sheet mein likhne ka kaam karta hai, usme koi change nahi kiya gaya hai.
- `/api/refresh` ka secret URL mein browser se dalna thoda kam secure hai (browser history mein
  reh sakta hai) — internal/admin use ke liye theek hai, par isse kisi ke saath share mat karo.
