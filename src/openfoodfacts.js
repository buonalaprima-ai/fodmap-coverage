// Lookup prodotto su Open Food Facts (client-side, nessun backend).
//
// normalizeProduct() e' una funzione PURA (testabile headless): trasforma la risposta
// grezza dell'API nell'oggetto che il motore (engine.analyze) si aspetta.
// lookup() fa la fetch con timeout e cache opzionale in localStorage.

const API_FIELDS = [
  "product_name",
  "product_name_it",
  "brands",
  "image_front_small_url",
  "ingredients_text",
  "ingredients_text_it",
  "ingredients",
  "ingredients_tags",
  "allergens_tags",
  "countries_tags"
].join(",");

function apiUrl(barcode) {
  return "https://world.openfoodfacts.org/api/v2/product/"
    + encodeURIComponent(barcode) + ".json?fields=" + API_FIELDS;
}

// Rimuove il prefisso lingua dei tag canonici OFF (es. "en:wheat-flour" -> "wheat-flour")
// e converte i trattini in spazi, cosi' il tag entra nell'haystack come testo cercabile.
function tagToText(tag) {
  return String(tag).replace(/^[a-z]{2,3}:/, "").replace(/-/g, " ");
}

// Trasforma la risposta OFF { status, product } nell'input normalizzato per il motore.
// "Prodotto trovato" = status === 1 && product presente.
// "Ha ingredienti" = ingredients_text(_it) non vuoto OPPURE array ingredients non vuoto.
export function normalizeProduct(data) {
  const found = !!(data && data.status === 1 && data.product);
  if (!found) {
    return {
      found: false,
      hasIngredients: false,
      name: "",
      brand: "",
      imageUrl: "",
      ingredientsText: "",
      textSources: []
    };
  }

  const p = data.product;
  const textIt = (p.ingredients_text_it || "").trim();
  const textDefault = (p.ingredients_text || "").trim();
  const arr = Array.isArray(p.ingredients) ? p.ingredients : [];
  const arrTexts = arr
    .map(function (i) { return i && i.text ? String(i.text).trim() : ""; })
    .filter(Boolean);
  const tags = Array.isArray(p.ingredients_tags) ? p.ingredients_tags : [];
  const tagTexts = tags.map(tagToText).filter(Boolean);

  const hasIngredients = !!(textIt || textDefault || arr.length);

  return {
    found: true,
    hasIngredients: hasIngredients,
    name: p.product_name_it || p.product_name || p.brands || "",
    brand: p.brands || "",
    imageUrl: p.image_front_small_url || "",
    // testo mostrato all'utente per verifica a occhio (preferisci IT, poi default, poi array)
    ingredientsText: textIt || textDefault || arrTexts.join(", "),
    // tutte le fonti testuali combinate per il matching (testo + array + tag canonici)
    textSources: [textIt, textDefault].concat(arrTexts).concat(tagTexts).filter(Boolean)
  };
}

// Recupera e normalizza un prodotto. Opzioni: { timeoutMs, cache } (cache in localStorage).
export async function lookup(barcode, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 12000;
  const useCache = opts.cache !== false;
  const cacheKey = "off:" + barcode;

  if (useCache) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) { /* localStorage non disponibile: ignora */ }
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

  try {
    const res = await fetch(apiUrl(barcode), {
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) {
      throw new Error("Open Food Facts ha risposto con stato " + res.status + ".");
    }
    const data = await res.json();
    const normalized = normalizeProduct(data);
    if (useCache && normalized.found) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(normalized));
      } catch (e) { /* quota/privata: ignora */ }
    }
    return normalized;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
