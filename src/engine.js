// Motore di matching FODMAP — il cuore dell'app.
//
// Verdetto BINARIO e a 3 stati (vedi analyze):
//   'red'     -> trovato >= 1 ingrediente FODMAP (elenca TUTTI i trigger)
//   'green'   -> ingredienti letti correttamente e nessun trigger
//   'unknown' -> prodotto non trovato / senza lista ingredienti (MAI verde)
//
// Matching a CONFINE DI PAROLA: l'haystack e le stringhe "match"/"exclude" vengono
// normalizzati (vedi normalize.js) in token separati da spazio, poi si cerca
// " termine " (con spazi ai bordi). Cosi' "fos" NON scatta dentro "fosfato",
// "caco" NON scatta dentro "cacao", ma "garlic powder" combacia regolarmente.
//
// Logica "exclude" (da _meta.exclude_logic): per le voci che hanno "exclude", le frasi
// low-FODMAP vengono azzerate nell'haystack PRIMA di cercare le "match" di quella voce
// (es. "olio di soia" non deve far scattare il trigger "Soia").

import { normalizeText } from "./normalize.js";

// Avvolge una stringa gia' normalizzata con spazi ai bordi, per il match a confine di parola.
function pad(normalized) {
  return " " + normalized + " ";
}

// Azzera (sostituisce con spazi) ogni occorrenza della frase `phrasePadded` in `hayPadded`,
// preservando i confini di parola. `phrasePadded` e `hayPadded` sono gia' paddati.
function blankOut(hayPadded, phrasePadded) {
  if (phrasePadded.trim() === "") {
    return hayPadded;
  }
  let out = hayPadded;
  let idx = out.indexOf(phrasePadded);
  while (idx >= 0) {
    // sostituisce la frase (spazi di confine inclusi) con due spazi, cosi' i token
    // adiacenti restano separati e i loro confini di parola sono preservati.
    out = out.slice(0, idx) + "  " + out.slice(idx + phrasePadded.length);
    idx = out.indexOf(phrasePadded);
  }
  return out;
}

// Cerca i trigger FODMAP in un haystack gia' normalizzato+paddato.
// Ritorna un array di trigger deduplicati per `nome`.
export function findTriggers(haystackPadded, db) {
  const labels = (db && db._meta && db._meta.categorie_label) || {};
  const entries = (db && db.ingredienti) || [];
  const triggers = [];
  const seen = {};

  for (const entry of entries) {
    // Haystack locale: se la voce ha "exclude", azzera quelle frasi prima del match.
    let hay = haystackPadded;
    if (Array.isArray(entry.exclude) && entry.exclude.length) {
      for (const ex of entry.exclude) {
        hay = blankOut(hay, pad(normalizeText(ex)));
      }
      // ricompatta eventuali spazi multipli introdotti dall'azzeramento
      hay = pad(hay.replace(/\s+/g, " ").trim());
    }

    let matchedOn = null;
    const terms = Array.isArray(entry.match) ? entry.match : [];
    for (const term of terms) {
      const needle = pad(normalizeText(term));
      if (needle.trim() !== "" && hay.indexOf(needle) >= 0) {
        matchedOn = term;
        break;
      }
    }

    if (matchedOn && !seen[entry.nome]) {
      seen[entry.nome] = true;
      triggers.push({
        nome: entry.nome,
        categoryKey: entry.category,
        categoryLabel: labels[entry.category] || entry.category,
        nota: entry.nota, // nota divulgativa da mostrare all'utente (se presente)
        matchedOn: matchedOn
      });
    }
  }

  return triggers;
}

// Analizza un prodotto normalizzato (vedi openfoodfacts.normalizeProduct) contro il db.
// Ritorna { verdict, triggers, product, analyzedIngredients, reason? }.
export function analyze(input, db) {
  const product = {
    name: (input && input.name) || "",
    brand: (input && input.brand) || "",
    imageUrl: (input && input.imageUrl) || ""
  };

  if (!input || !input.found) {
    return {
      verdict: "unknown",
      triggers: [],
      product: product,
      analyzedIngredients: "",
      reason: "Prodotto non trovato su Open Food Facts."
    };
  }

  if (!input.hasIngredients) {
    return {
      verdict: "unknown",
      triggers: [],
      product: product,
      analyzedIngredients: input.ingredientsText || "",
      reason: "Impossibile determinare: ingredienti non disponibili su Open Food Facts."
    };
  }

  const sources = Array.isArray(input.textSources) ? input.textSources : [];
  const haystack = pad(normalizeText(sources.join("  ")));
  const triggers = findTriggers(haystack, db);

  return {
    verdict: triggers.length ? "red" : "green",
    triggers: triggers,
    product: product,
    analyzedIngredients: input.ingredientsText || ""
  };
}
