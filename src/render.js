// Rendering del risultato dell'analisi (verdetto personalizzato a 3 stati).
// Costruzione via nodi DOM + textContent: niente innerHTML su dati esterni
// (nome prodotto, ingredienti) per evitare injection.

import { submitReport } from "./reports.js?v=2026.06.26-12";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

const VERDICT_META = {
  red: { cls: "verdict-red", icon: "🔴", word: "DA EVITARE" },
  yellow: { cls: "verdict-yellow", icon: "🟡", word: "OK in piccola dose" },
  green: { cls: "verdict-green", icon: "🟢", word: "OK per te" },
  unknown: { cls: "verdict-unknown", icon: "⚪️", word: "Non determinabile" }
};

// Mostra un messaggio di stato (caricamento / errore) nel container.
export function renderStatus(container, message, kind) {
  container.innerHTML = "";
  const box = el("div", "status " + (kind || ""), message);
  container.appendChild(box);
}

// Etichetta categoria leggibile. La categoria 'misto' ("Più tipi di FODMAP") non
// viene mostrata: non porta utilità all'utente.
function catLabel(t) {
  if (t.categoryKey === "misto") {
    return "";
  }
  return t.categoryLabel || "";
}

// Costruisce un blocco di trigger (lista) con titolo e classe di colore.
function triggerGroup(title, items, groupClass, showDose) {
  const group = el("div", "triggers " + groupClass);
  group.appendChild(el("div", "triggers-title", title));
  items.forEach(function (t) {
    const item = el("div", "trigger");
    const head = el("div", "trigger-head");
    head.appendChild(el("span", "trigger-name", t.nome));
    if (showDose && t.dose) {
      head.appendChild(el("span", "trigger-dose", t.dose));
    }
    const label = catLabel(t);
    if (label) {
      head.appendChild(el("span", "trigger-cat", label));
    }
    item.appendChild(head);
    group.appendChild(item);
  });
  return group;
}

// Blocco "Segnala un problema": textarea + pulsante (attivo solo se c'e' testo).
// All'invio raccoglie il contesto del risultato e lo manda via reports.submitReport.
function reportBlock(result, barcode) {
  const wrap = el("div", "report");
  wrap.appendChild(el("div", "report-title", "Qualcosa non torna?"));
  const ta = el("textarea", "report-text");
  ta.placeholder = "Descrivi il problema (es. verdetto sbagliato, ingrediente non riconosciuto, dose errata…).";
  ta.rows = 2;
  const btn = el("button", "report-btn", "Segnala un problema");
  btn.type = "button";
  btn.disabled = true;
  const msg = el("div", "report-msg");

  ta.addEventListener("input", function () {
    btn.disabled = ta.value.trim().length === 0;
  });

  btn.addEventListener("click", async function () {
    const text = ta.value.trim();
    if (!text) {
      return;
    }
    btn.disabled = true;
    msg.textContent = "Invio…";
    const report = {
      barcode: barcode || "",
      verdict: result.verdict,
      product: {
        name: (result.product && result.product.name) || "",
        brand: (result.product && result.product.brand) || ""
      },
      triggers: (result.triggers || []).map(function (t) {
        return { nome: t.nome, stato: t.stato, dose: t.dose || "" };
      }),
      analyzedIngredients: result.analyzedIngredients || "",
      message: text
    };
    const res = await submitReport(report);
    ta.value = "";
    msg.textContent = res.remote
      ? "✓ Segnalazione inviata. Grazie!"
      : "✓ Segnalazione salvata: verrà inviata appena c'è rete (" + (res.pending || 0) + " in coda).";
    document.dispatchEvent(new CustomEvent("fodmap-report-saved"));
  });

  wrap.appendChild(ta);
  wrap.appendChild(btn);
  wrap.appendChild(msg);
  return wrap;
}

// Mostra il risultato completo dell'analisi nel container.
export function renderResult(container, result, barcode) {
  container.innerHTML = "";
  const meta = VERDICT_META[result.verdict] || VERDICT_META.unknown;

  // Banner verdetto, grande e leggibile a colpo d'occhio.
  const banner = el("div", "verdict " + meta.cls);
  banner.appendChild(el("span", "verdict-icon", meta.icon));
  banner.appendChild(el("span", "verdict-word", meta.word));
  container.appendChild(banner);

  // Riga prodotto: miniatura + nome + brand.
  const product = result.product || {};
  if (product.name || product.brand || product.imageUrl) {
    const row = el("div", "product");
    if (product.imageUrl) {
      const img = el("img", "product-img");
      img.src = product.imageUrl;
      img.alt = "";
      img.loading = "lazy";
      row.appendChild(img);
    }
    const info = el("div", "product-info");
    if (product.name) {
      info.appendChild(el("div", "product-name", product.name));
    }
    if (product.brand) {
      info.appendChild(el("div", "product-brand", product.brand));
    }
    row.appendChild(info);
    container.appendChild(row);
  }

  // Trigger raggruppati per stato: "Da evitare" (no) e "Solo in piccola dose" (limite).
  const triggers = Array.isArray(result.triggers) ? result.triggers : [];
  const toAvoid = triggers.filter(function (t) { return t.stato === "no"; });
  const toLimit = triggers.filter(function (t) { return t.stato === "limite"; });

  if (toAvoid.length) {
    container.appendChild(triggerGroup("Da evitare:", toAvoid, "triggers-no", false));
  }
  if (toLimit.length) {
    container.appendChild(triggerGroup("OK solo in piccola dose:", toLimit, "triggers-limit", true));
  }

  // Verdetto sconosciuto: spiegazione + invito a leggere l'etichetta.
  if (result.verdict === "unknown") {
    const note = el("div", "unknown-note");
    note.appendChild(el("p", null, result.reason || "Impossibile determinare il prodotto."));
    note.appendChild(el("p", "muted", "Controlla la lista ingredienti sulla confezione a mano."));
    container.appendChild(note);
  }

  // Sempre: testo ingredienti analizzato (collassabile) per verifica a occhio.
  const details = el("details", "ingredients");
  details.appendChild(el("summary", null, "Ingredienti analizzati"));
  details.appendChild(el("div", "ingredients-body",
    result.analyzedIngredients && result.analyzedIngredients.trim()
      ? result.analyzedIngredients
      : "— non disponibili —"));
  if (result.verdict === "unknown") {
    details.open = true;
  }
  container.appendChild(details);

  // Segnala un problema (sempre, qualunque sia il verdetto).
  container.appendChild(reportBlock(result, barcode));
}
