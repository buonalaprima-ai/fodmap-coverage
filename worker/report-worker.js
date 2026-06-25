// Ponte serverless per le segnalazioni del FODMAP Scanner.
//
// Riceve via POST una segnalazione (JSON) dalla pagina e la APPENDE a
// reports/segnalazioni.json nel repo, facendo un commit tramite la GitHub API.
// Il token GitHub NON sta nella pagina: vive qui come "secret" (env.GITHUB_TOKEN),
// lato server. Deploy consigliato: Cloudflare Workers (vedi worker/SETUP.md).
//
// Compatibile con l'editor web di Cloudflare Workers (module syntax).

const OWNER = "buonalaprima-ai";
const REPO = "fodmap-coverage";
const FILE = "reports/segnalazioni.json";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://buonalaprima-ai.github.io";
const GH = "https://api.github.com";

function corsHeaders(origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin))
  });
}

function ghHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "User-Agent": "fodmap-report-worker",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

// Legge il file segnalazioni: ritorna { list, sha } (list=[] e sha=null se non esiste).
async function readFile(token) {
  const url = GH + "/repos/" + OWNER + "/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 404) {
    return { list: [], sha: null };
  }
  if (!r.ok) {
    throw new Error("GET contents " + r.status);
  }
  const j = await r.json();
  let list = [];
  try {
    list = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))));
  } catch (e) {
    list = [];
  }
  if (!Array.isArray(list)) {
    list = [];
  }
  return { list: list, sha: j.sha };
}

// Scrive il file segnalazioni (commit). Ritorna la Response della PUT.
async function writeFile(token, list, sha) {
  const body = {
    message: "Segnalazione utente (" + list.length + ")",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2)))),
    branch: BRANCH
  };
  if (sha) {
    body.sha = sha;
  }
  return fetch(GH + "/repos/" + OWNER + "/" + REPO + "/contents/" + FILE, {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(token)),
    body: JSON.stringify(body)
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Metodo non consentito" }, 405, origin);
    }
    const token = env.GITHUB_TOKEN;
    if (!token) {
      return json({ ok: false, error: "GITHUB_TOKEN non configurato" }, 500, origin);
    }

    let report;
    try {
      report = await request.json();
    } catch (e) {
      return json({ ok: false, error: "JSON non valido" }, 400, origin);
    }
    if (!report || typeof report.message !== "string" || report.message.trim() === "") {
      return json({ ok: false, error: "messaggio mancante" }, 400, origin);
    }

    // Normalizza e limita le dimensioni (anti-abuso).
    const entry = {
      receivedAt: new Date().toISOString(),
      message: String(report.message).slice(0, 2000),
      barcode: String(report.barcode || "").slice(0, 64),
      verdict: String(report.verdict || "").slice(0, 16),
      product: {
        name: String((report.product && report.product.name) || "").slice(0, 200),
        brand: String((report.product && report.product.brand) || "").slice(0, 200)
      },
      triggers: Array.isArray(report.triggers) ? report.triggers.slice(0, 50) : [],
      analyzedIngredients: String(report.analyzedIngredients || "").slice(0, 4000)
    };

    // Fino a 3 tentativi in caso di conflitto sullo sha (scritture concorrenti).
    for (let i = 0; i < 3; i++) {
      const current = await readFile(token);
      current.list.push(entry);
      const put = await writeFile(token, current.list, current.sha);
      if (put.ok) {
        return json({ ok: true, total: current.list.length }, 200, origin);
      }
      if (put.status === 409) {
        continue; // conflitto: rileggi lo sha e riprova
      }
      const txt = await put.text();
      return json({ ok: false, error: "PUT " + put.status + ": " + txt.slice(0, 200) }, 502, origin);
    }
    return json({ ok: false, error: "conflitto persistente, riprova" }, 409, origin);
  }
};
