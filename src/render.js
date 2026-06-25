// Rendering del risultato dell'analisi (verdetto personalizzato a 3 stati).
// Costruzione via nodi DOM + textContent: niente innerHTML su dati esterni
// (nome prodotto, ingredienti) per evitare injection.

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
    head.appendChild(el("span", "trigger-cat", t.categoryLabel));
    item.appendChild(head);
    if (t.nota) {
      item.appendChild(el("div", "trigger-nota", t.nota));
    }
    group.appendChild(item);
  });
  return group;
}

// Mostra il risultato completo dell'analisi nel container.
export function renderResult(container, result) {
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
}
