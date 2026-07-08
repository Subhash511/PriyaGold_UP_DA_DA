const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Refresh-Secret",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Minimal CSV parser (handles quoted fields with commas/newlines)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

async function fetchMasterData(env) {
  const url = `https://docs.google.com/spreadsheets/d/${env.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(env.SHEET_NAME)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Sheet (status ${res.status}). Is it published/shared as "Anyone with link can view"?`);
  }
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 1) throw new Error("Sheet returned no rows");

  const header = rows[0].map((h) => h.trim());
  const idx = {
    state: header.indexOf("State"),
    designation: header.indexOf("User Designation"),
    hq: header.indexOf("HQ"),
    user: header.indexOf("User"),
    password: header.indexOf("Password"),
  };
  for (const [key, pos] of Object.entries(idx)) {
    if (pos === -1) throw new Error(`Missing required column in sheet: "${key}"`);
  }

  const full = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const state = (r[idx.state] || "").trim();
    const designation = (r[idx.designation] || "").trim();
    const hq = (r[idx.hq] || "").trim();
    const user = (r[idx.user] || "").trim();
    const password = (r[idx.password] ?? "").toString().trim();
    if (!state || !designation || !hq || !user) continue;

    full[state] ??= {};
    full[state][designation] ??= {};
    full[state][designation][hq] ??= {};
    full[state][designation][hq][user] = { password };
  }
  return full;
}

// Public dropdown data must never carry passwords to the client.
function stripPasswords(full) {
  const publicData = {};
  for (const state in full) {
    publicData[state] = {};
    for (const designation in full[state]) {
      publicData[state][designation] = {};
      for (const hq in full[state][designation]) {
        publicData[state][designation][hq] = {};
        for (const user in full[state][designation][hq]) {
          publicData[state][designation][hq][user] = {};
        }
      }
    }
  }
  return publicData;
}

async function refreshData(env) {
  const full = await fetchMasterData(env);
  const publicData = stripPasswords(full);
  await env.DROPDOWN_KV.put("full", JSON.stringify(full));
  await env.DROPDOWN_KV.put("public", JSON.stringify(publicData));
  await env.DROPDOWN_KV.put("updatedAt", new Date().toISOString());
  return { stateCount: Object.keys(full).length };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/dropdown" && request.method === "GET") {
      let data = await env.DROPDOWN_KV.get("public");
      if (!data) {
        // First run / cold KV — fetch on demand so the site never sees an empty form.
        await refreshData(env);
        data = await env.DROPDOWN_KV.get("public");
      }
      return json(JSON.parse(data || "{}"));
    }

    if (url.pathname === "/api/verify" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ valid: false, error: "Invalid JSON body" }, 400);
      }
      const { state, designation, hq, user, password } = body || {};
      if (!state || !designation || !hq || !user || password === undefined) {
        return json({ valid: false, error: "Missing fields" }, 400);
      }
      const raw = await env.DROPDOWN_KV.get("full");
      const full = raw ? JSON.parse(raw) : {};
      const record = full?.[state]?.[designation]?.[hq]?.[user];
      const valid = !!record && record.password === String(password);
      return json({ valid });
    }

    if (url.pathname === "/api/refresh" && (request.method === "POST" || request.method === "GET")) {
      // Accept the secret via header (curl/Postman) or query string (paste URL in a browser).
      const secret = request.headers.get("X-Refresh-Secret") || url.searchParams.get("secret");
      if (!env.REFRESH_SECRET || secret !== env.REFRESH_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
      try {
        const result = await refreshData(env);
        return json({ success: true, ...result });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const updatedAt = await env.DROPDOWN_KV.get("updatedAt");
      return json({ updatedAt: updatedAt || null });
    }

    return json({ error: "Not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshData(env));
  },
};
