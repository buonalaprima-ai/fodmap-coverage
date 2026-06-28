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

// Avvertenze allergeni di tipo "puo' contenere tracce di...": NON sono ingredienti e
// non interessano ai fini FODMAP. Taglia il testo dalla prima avvertenza in poi.
const TRACES_RE = /(pu[oò]'?\s+contenere|potrebbe\s+contenere|tracce\s+(?:eventuali\s+)?di|may\s+contain|prodott[oi]\s+in\s+uno\s+stabilimento|in\s+uno\s+stabilimento\s+che|produced\s+in\s+a?\s*facilit|made\s+in\s+a?\s*facilit)/i;

function stripTraces(text) {
  if (!text) {
    return "";
  }
  const m = text.match(TRACES_RE);
  return m ? text.slice(0, m.index).replace(/[\s,;.]+$/, "").trim() : text;
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
  const rawIt = (p.ingredients_text_it || "").trim();
  const rawDefault = (p.ingredients_text || "").trim();
  // Toglie le avvertenze "puo' contenere tracce di..." (allergeni, non ingredienti).
  const textIt = stripTraces(rawIt);
  const textDefault = stripTraces(rawDefault);
  const arr = Array.isArray(p.ingredients) ? p.ingredients : [];
  const arrTexts = arr
    .map(function (i) { return i && i.text ? String(i.text).trim() : ""; })
    .filter(Boolean);
  const tags = Array.isArray(p.ingredients_tags) ? p.ingredients_tags : [];
  const tagTexts = tags.map(tagToText).filter(Boolean);

  const hasIngredients = !!(rawIt || rawDefault || arr.length);

  // I tag canonici OFF includono anche le CATEGORIE-genitore della tassonomia
  // (es. kale -> "en:cabbage"; cipolla/aglio -> "en:onion-family-vegetable"), che
  // generano falsi positivi. Quindi i tag si usano SOLO come RISERVA: se c'e' testo
  // o array ingredienti reale, il match avviene esclusivamente su quello.
  const realSources = [textIt, textDefault].concat(arrTexts).filter(Boolean);

  return {
    found: true,
    hasIngredients: hasIngredients,
    name: p.product_name_it || p.product_name || p.brands || "",
    brand: p.brands || "",
    imageUrl: p.image_front_small_url || "",
    // testo mostrato all'utente per verifica a occhio (preferisci IT, poi default, poi array)
    ingredientsText: textIt || textDefault || arrTexts.join(", "),
    // fonti per il matching lessicale (fallback): testo + array; i tag SOLO se non c'e' altro
    textSources: realSources.length ? realSources : tagTexts,
    // albero strutturato OFF (id canonici + is_in_taxonomy + sotto-ingredienti) per il
    // path tassonomia del motore; [] se OFF non ha parsato gli ingredienti.
    tree: arr
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

    // OFF risponde 404 con JSON {"status":0,"status_verbose":"product not found"}
    // per i barcode NON presenti nel database: non e' un errore di rete, ma un
    // "prodotto non trovato" (verdetto unknown). Quindi proviamo sempre a leggere
    // il JSON e trattiamo come errore reale solo cio' che non e' una risposta OFF
    // valida (HTML di challenge, 5xx, rete caduta).
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!data || typeof data.status === "undefined") {
      if (!res.ok) {
        throw new Error("Open Food Facts ha risposto con stato " + res.status + ".");
      }
      data = {};
    }

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
