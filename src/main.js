// Entry point: collega UI, scanner, lookup OFF e motore FODMAP.

import { lookup } from "./openfoodfacts.js";
import { analyze } from "./engine.js";
import { startScanner, stopScanner, isScanning } from "./scanner.js";
import { renderResult, renderStatus } from "./render.js";

const $ = function (id) { return document.getElementById(id); };

let db = null;
let personal = null;
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
    const result = analyze(product, db, personal);
    renderResult($("result"), result);
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

function init() {
  $("scanBtn").addEventListener("click", toggleScan);
  $("analyzeBtn").addEventListener("click", function () { handleBarcode($("barcode").value); });
  $("barcode").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      handleBarcode($("barcode").value);
    }
  });
  loadDb();
}

init();
