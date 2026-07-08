# PriyaGold_UP_DA_DA

Priya Gold TA/DA (Travel/Dearness Allowance) claim form — static frontend + Google Sheets backend.

## Structure

- [`index.html`](index.html) — the TA/DA claim form users fill and submit. Loads the employee
  dropdown data (State/Designation/HQ/User) and does password verification via the Cloudflare
  Worker described below — nothing is hardcoded or committed as a static JSON file anymore.
- [`google1.js`](google1.js) — Google Apps Script `doPost` handler; receives submitted form
  entries and appends them as rows into a "Form Data" Google Sheet (with optional bill file
  upload to Drive).
- [`cloudflare-worker/`](cloudflare-worker/README.md) — Cloudflare Worker that auto-syncs the
  employee master list from a Google Sheet ("master" tab) three times a day (12 PM, 5 PM & 7 PM IST)
  and serves it to `index.html`. See its README for full setup steps.

## Hosting

Static site (`index.html`) is deployed on **Cloudflare Pages** directly from this GitHub repo.
Employee master data lives in a Google Sheet and is kept in sync automatically by the
Cloudflare Worker — no manual `git commit` needed when employee data changes.