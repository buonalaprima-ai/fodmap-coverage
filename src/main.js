// Entry point: collega UI, scanner, lookup OFF e motore FODMAP.

import { lookup } from "./openfoodfacts.js";
import { analyze } from "./engine.js";
import { startScanner, stopScanner, isScanning } from "./scanner.js";
import { renderResult, renderStatus } from "./render.js";
import { flushQueue, pendingCount } from "./reports.js";

const $ = function (id) { return document.getElementById(id); };

let db = null;
let personal = null;
let taxmap = null;
let dbError = null;

async function fetchJson(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(path + " HTTP " + res.status);
  }
  return res.json();
}

// Carica la base dati generica + il livello personale una sola volta all'avvio.
async function loadDb() {
  try {
    db = await fetchJson("high-fodmap.json");
  } catch (e) {
    dbError = e;
  }
  // Il livello personale e' opzionale: se manca, si ricade sul verdetto generico.
  try {
    personal = await fetchJson("personal-fodmap.json");
  } catch (e) {
    personal = null;
  }
  // La mappa tassonomia (id OFF -> concetto FODMAP) e' opzionale: se manca, il motore
  // usa il solo path lessicale.
  try {
    taxmap = await fetchJson("taxonomy-fodmap.json");
  } catch (e) {
    taxmap = null;
  }
}

function setBusy(busy) {
  $("scanBtn").disabled = busy;
  $("analyzeBtn").disabled = busy;
  $("barcode").disabled = busy;
}

// Flusso principale: codice -> lookup OFF -> analisi -> render.
async function handleBarcode(raw) {
  const code = (raw || "").trim().replace(/\s+/g, "");
  if (!code) {
    return;
  }
  if (!db) {
    renderStatus($("result"), dbError
      ? "Base dati FODMAP non caricata. Ricarica la pagina."
      : "Base dati FODMAP non ancora pronta, riprova tra un istante.", "error");
    return;
  }

  setBusy(true);
  renderStatus($("result"), "Cerco il prodotto " + code + "…", "loading");
  try {
    const product = await lookup(code, { timeoutMs: 12000 });
    const result = analyze(product, db, personal, taxmap);
    renderResult($("result"), result, code);
  } catch (e) {
    const offline = (typeof navigator !== "undefined" && navigator.onLine === false);
    renderStatus($("result"),
      (offline ? "Sei offline. " : "Errore di rete contattando Open Food Facts. ")
      + "Riprova, oppure inserisci di nuovo il codice.", "error");
  } finally {
    setBusy(false);
    $("barcode").value = "";
  }
}

function toggleScan() {
  if (isScanning()) {
    stopScanner();
    $("scanBtn").textContent = "📷 Scansiona";
    return;
  }
  $("scanBtn").textContent = "✕ Ferma";
  renderStatus($("result"), "Inquadra il codice a barre…", "loading");
  startScanner({
    video: $("video"),
    onResult: function (code) {
      $("scanBtn").textContent = "📷 Scansiona";
      handleBarcode(code);
    },
    onError: function (e) {
      $("scanBtn").textContent = "📷 Scansiona";
      renderStatus($("result"),
        "Fotocamera non disponibile (" + (e && e.message ? e.message : "errore") + "). "
        + "Usa l'inserimento manuale del codice qui sopra.", "error");
    }
  });
}

// Barra "segnalazioni in attesa di invio" (coda offline non ancora inviata).
function refreshReportsBar() {
  const bar = $("reports-bar");
  if (!bar) {
    return;
  }
  const n = pendingCount();
  if (n > 0) {
    $("reports-count").textContent = n + (n === 1 ? " segnalazione" : " segnalazioni") + " in attesa di invio";
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

// Auto-aggiornamento: confronta la versione caricata (window.APP_VERSION) con
// version.json (letto sempre fresco). Se differiscono, la pagina in cache è vecchia
// → ricarica una volta. Se dopo il reload è ancora vecchia, mostra un avviso tappabile.
async function checkForUpdate() {
  const current = window.APP_VERSION || "";
  const verEl = $("appver");
  if (verEl) {
    verEl.textContent = current ? "v" + current : "";
  }
  try {
    const res = await fetch("version.json?ts=" + Date.now(), { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    const latest = data && data.version;
    if (!latest || latest === current) {
      return;
    }
    const key = "fodmap-reloaded-" + latest;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      location.reload();
    } else if (verEl) {
      verEl.innerHTML = "";
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = "Nuova versione disponibile — tocca per aggiornare";
      a.addEventListener("click", function (e) { e.preventDefault(); location.reload(); });
      verEl.appendChild(a);
    }
  } catch (e) { /* offline: ignora */ }
}

function init() {
  checkForUpdate();
  $("scanBtn").addEventListener("click", toggleScan);
  $("analyzeBtn").addEventListener("click", function () { handleBarcode($("barcode").value); });
  $("barcode").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      handleBarcode($("barcode").value);
    }
  });
  $("retry-reports").addEventListener("click", async function () {
    $("reports-count").textContent = "Invio in corso…";
    await flushQueue();
    refreshReportsBar();
  });
  document.addEventListener("fodmap-report-saved", async function () {
    await flushQueue();
    refreshReportsBar();
  });

  loadDb();
  // Prova a reinviare eventuali segnalazioni rimaste in coda da una sessione precedente.
  flushQueue().then(refreshReportsBar);
}

init();
