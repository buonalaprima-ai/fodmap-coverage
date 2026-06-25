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

// Ritorna il primo termine (originale) di `terms` presente come parola nell'haystack, o null.
function matchOne(haystackPadded, terms) {
  const list = Array.isArray(terms) ? terms : [];
  for (const term of list) {
    const needle = pad(normalizeText(term));
    if (needle.trim() !== "" && haystackPadded.indexOf(needle) >= 0) {
      return term;
    }
  }
  return null;
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

// Analizza un prodotto normalizzato (vedi openfoodfacts.normalizeProduct) contro il db
// generico e, se fornito, il livello PERSONALE (personal-fodmap.json).
//
// Senza `personal`: verdetto a 2 stati (red/green) come la lista generica.
// Con `personal`: verdetto a 3 stati personalizzato:
//   'red'    -> almeno un ingrediente "no" (da evitare per te)
//   'yellow' -> nessun "no" ma almeno un "limite" (ok solo in piccola dose)
//   'green'  -> tutto ok per te
// I trigger riportano `stato` ('no'|'limite') e `dose` (per i 'limite').
export function analyze(input, db, personal) {
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
  let haystack = pad(normalizeText(sources.join("  ")));

  // 1) Azzera le frasi "consentiti" (SI personali) per gestire la specificita'
  //    (es. "latte di mandorla" non deve far scattare la voce "Mandorle").
  if (personal && Array.isArray(personal.consentiti)) {
    for (const c of personal.consentiti) {
      const terms = Array.isArray(c.match) ? c.match : [];
      for (const m of terms) {
        haystack = blankOut(haystack, pad(normalizeText(m)));
      }
    }
    haystack = pad(haystack.replace(/\s+/g, " ").trim());
  }

  // 2) Trigger generici sull'haystack (eventualmente ripulito dai "consentiti").
  const generic = findTriggers(haystack, db);

  // 3) Applica gli override personali per nome; default 'no' per le voci non elencate.
  const overrides = (personal && personal.override) || {};
  const defaultStato = (personal && personal._meta && personal._meta.default_generico) || "no";
  const triggers = [];
  const seen = {};
  for (const t of generic) {
    const ov = overrides[t.nome];
    const stato = ov ? (typeof ov === "string" ? ov : ov.stato) : defaultStato;
    if (stato === "si") {
      continue; // OK per te: non e' un problema, non lo segnalo
    }
    if (!seen[t.nome]) {
      seen[t.nome] = true;
      triggers.push({
        nome: t.nome,
        categoryKey: t.categoryKey,
        categoryLabel: t.categoryLabel,
        nota: t.nota,
        matchedOn: t.matchedOn,
        stato: stato,
        dose: ov && ov.dose ? ov.dose : undefined
      });
    }
  }

  // 4) Voci extra personali (no/limite) non presenti nel generico.
  if (personal && Array.isArray(personal.extra)) {
    for (const e of personal.extra) {
      if (seen[e.nome]) {
        continue;
      }
      const matchedOn = matchOne(haystack, e.match);
      if (matchedOn) {
        seen[e.nome] = true;
        triggers.push({
          nome: e.nome,
          categoryKey: e.categoryKey,
          categoryLabel: e.categoryLabel || "Personale",
          nota: e.nota,
          matchedOn: matchedOn,
          stato: e.stato || "no",
          dose: e.dose
        });
      }
    }
  }

  // 5) Verdetto: rosso se almeno un 'no'; giallo se nessun 'no' ma almeno un 'limite';
  //    altrimenti verde.
  let verdict = "green";
  if (triggers.some(function (t) { return t.stato === "no"; })) {
    verdict = "red";
  } else if (triggers.some(function (t) { return t.stato === "limite"; })) {
    verdict = "yellow";
  }

  return {
    verdict: verdict,
    triggers: triggers,
    product: product,
    analyzedIngredients: input.ingredientsText || ""
  };
}
