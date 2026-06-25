// Rendering del risultato dell'analisi. Costruzione via nodi DOM + textContent:
// niente innerHTML su dati esterni (nome prodotto, ingredienti) per evitare injection.

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
  red: { cls: "verdict-red", icon: "🔴", word: "CONTIENE FODMAP" },
  green: { cls: "verdict-green", icon: "🟢", word: "Nessun FODMAP rilevato" },
  unknown: { cls: "verdict-unknown", icon: "⚪️", word: "Non determinabile" }
};

// Mostra un messaggio di stato (caricamento / errore) nel container.
export function renderStatus(container, message, kind) {
  container.innerHTML = "";
  const box = el("div", "status " + (kind || ""), message);
  container.appendChild(box);
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

  // Verdetto rosso: elenco di TUTTI i trigger con categoria e nota.
  if (result.verdict === "red") {
    const list = el("div", "triggers");
    list.appendChild(el("div", "triggers-title", "Ingredienti FODMAP trovati:"));
    result.triggers.forEach(function (t) {
      const item = el("div", "trigger");
      item.appendChild(el("span", "trigger-name", t.nome));
      item.appendChild(el("span", "trigger-cat", t.categoryLabel));
      if (t.nota) {
        item.appendChild(el("div", "trigger-nota", t.nota));
      }
      list.appendChild(item);
    });
    container.appendChild(list);
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
  const summary = el("summary", null, "Ingredienti analizzati");
  details.appendChild(summary);
  const body = el("div", "ingredients-body",
    result.analyzedIngredients && result.analyzedIngredients.trim()
      ? result.analyzedIngredients
      : "— non disponibili —");
  details.appendChild(body);
  // su verdetto rosso/verde li teniamo chiusi; su unknown aperti per aiutare la verifica
  if (result.verdict === "unknown") {
    details.open = true;
  }
  container.appendChild(details);
}
