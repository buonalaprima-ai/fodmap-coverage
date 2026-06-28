// Motore di matching FODMAP — il cuore dell'app (IBRIDO: tassonomia-first + fallback lessicale).
//
// Verdetto a 3 stati (vedi analyze):
//   'red'     -> almeno un ingrediente "no" (da evitare)
//   'yellow'  -> nessun "no" ma almeno un "limite" (ok in piccola dose)
//   'green'   -> ingredienti letti correttamente e nessun trigger
//   'unknown' -> prodotto non trovato / senza lista ingredienti (MAI verde)
//
// COME RICONOSCE I FODMAP:
//   1) PRIMARIO — tassonomia: ogni ingrediente parsato da Open Food Facts ha un id
//      canonico (es. "en:sunflower-oil") indipendente dalla lingua. taxonomy-fodmap.json
//      mappa id->concetto FODMAP. Cosi' "olio di semi di girasole" (en:sunflower-oil) NON
//      e' confuso col seme (en:sunflower-seed), e i prodotti in qualunque lingua funzionano.
//      Si sfrutta anche la STRUTTURA ad albero (il latte figlio di un formaggio stagionato
//      ha lattosio trascurabile) e il flag is_in_taxonomy per sapere cosa e' riconosciuto.
//   2) FALLBACK — lessicale: per i nodi NON riconosciuti dalla tassonomia (typo, lingue
//      rare, parsing fallito) e per i prodotti senza albero strutturato, si torna al match
//      a confine di parola su high-fodmap.json (con i "consentiti" personali).
// Il livello PERSONALE (personal-fodmap.json) decide poi lo stato per te (no/limite/si).

import { normalizeText } from "./normalize.js?v=2026.06.26-12";

// Avvolge una stringa gia' normalizzata con spazi ai bordi, per il match a confine di parola.
function pad(normalized) {
  return " " + normalized + " ";
}

// Azzera (sostituisce con spazi) ogni occorrenza della frase `phrasePadded` in `hayPadded`.
function blankOut(hayPadded, phrasePadded) {
  if (phrasePadded.trim() === "") {
    return hayPadded;
  }
  let out = hayPadded;
  let idx = out.indexOf(phrasePadded);
  while (idx >= 0) {
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

// Avvertenze "puo' contenere tracce di..." (multi-lingua): NON sono ingredienti.
const TRACE_MARK = /(pu[oò]'?\s*contenere|potrebbe\s+contenere|tracce\s+(?:eventuali\s+)?di|may\s+contain|peut\s+contenir|kann\s+spuren|trazas\s+de|spuren\s+von)/i;

// Formaggi stagionati a lattosio trascurabile: il loro "en:milk" figlio non e' un trigger.
const AGED_CHEESE_IDS = {
  "en:grana-padano": 1, "en:parmigiano-reggiano": 1, "en:parmesan": 1, "en:pecorino-romano": 1,
  "en:cheddar": 1, "en:cheddar-cheese": 1, "en:emmental": 1, "en:emmentaler": 1, "en:gruyere": 1,
  "en:comte": 1, "en:provolone": 1, "en:gouda": 1, "en:montasio": 1, "en:sbrinz": 1,
  "en:caciocavallo": 1, "en:hard-cheese": 1, "en:grated-cheese": 1, "en:aged-cheese": 1
};

// Cerca i trigger FODMAP in un haystack gia' normalizzato+paddato (path LESSICALE).
export function findTriggers(haystackPadded, db) {
  const labels = (db && db._meta && db._meta.categorie_label) || {};
  const entries = (db && db.ingredienti) || [];
  const triggers = [];
  const seen = {};

  for (const entry of entries) {
    let hay = haystackPadded;
    if (Array.isArray(entry.exclude) && entry.exclude.length) {
      for (const ex of entry.exclude) {
        hay = blankOut(hay, pad(normalizeText(ex)));
      }
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
        nota: entry.nota,
        matchedOn: matchedOn
      });
    }
  }

  return triggers;
}

// Costruisce l'haystack normalizzato+ripulito dai "consentiti" e dalla regola formaggi
// (usato dal path lessicale, dalle voci "extra" e dal claim "senza lattosio").
function buildHaystack(text, personal) {
  let haystack = pad(normalizeText(text));

  if (personal && Array.isArray(personal.consentiti)) {
    for (const c of personal.consentiti) {
      const terms = Array.isArray(c.match) ? c.match : [];
      for (const m of terms) {
        haystack = blankOut(haystack, pad(normalizeText(m)));
      }
    }
    haystack = pad(haystack.replace(/\s+/g, " ").trim());
  }

  // Formaggi stagionati (path lessicale): azzera SOLO il primo latte/milk entro 3 token
  // dopo il nome del formaggio, cosi' la besciamella separata di una lasagna resta rossa.
  if (personal && Array.isArray(personal.formaggi_stagionati)) {
    const WINDOW = 3;
    const MILK = { latte: true, milk: true };
    const toks = haystack.trim().split(/\s+/);
    for (const cheese of personal.formaggi_stagionati) {
      const cToks = normalizeText(cheese).split(" ").filter(function (x) { return x !== ""; });
      if (cToks.length === 0) {
        continue;
      }
      for (let i = 0; i + cToks.length <= toks.length; i++) {
        let hit = true;
        for (let j = 0; j < cToks.length; j++) {
          if (toks[i + j] !== cToks[j]) {
            hit = false;
            break;
          }
        }
        if (!hit) {
          continue;
        }
        const start = i + cToks.length;
        const end = Math.min(start + WINDOW, toks.length);
        for (let k = start; k < end; k++) {
          if (MILK[toks[k]]) {
            toks[k] = "";
            break;
          }
        }
      }
    }
    haystack = pad(toks.filter(function (x) { return x !== ""; }).join(" "));
  }

  return haystack;
}

// PATH TASSONOMIA: percorre l'albero `ingredients` di OFF.
// Ritorna { triggers: [...], fallbackText: "<testo dei nodi NON riconosciuti>" }.
function taxonomyTriggers(tree, taxmap, db) {
  const labels = (db && db._meta && db._meta.categorie_label) || {};
  const noteByNome = {};
  for (const e of ((db && db.ingredienti) || [])) {
    noteByNome[e.nome] = e.nota;
  }
  // id che rappresentano "latte" (per sopprimere il latte dei formaggi stagionati)
  const milkIds = {};
  for (const id in taxmap) {
    if (taxmap[id] && taxmap[id].nome === "Latte vaccino/capra/pecora") {
      milkIds[id] = 1;
    }
  }

  const triggers = [];
  const seen = {};
  const fallback = [];

  function walk(nodes, parentAged) {
    for (const nd of nodes) {
      const id = String((nd && nd.id) || "");
      const text = (nd && nd.text) || "";
      const isTrace = TRACE_MARK.test(text);
      const suppressed = parentAged && milkIds[id]; // latte del formaggio stagionato

      if (!isTrace && !suppressed) {
        const concept = taxmap[id];
        if (concept) {
          if (!seen[concept.nome]) {
            seen[concept.nome] = true;
            triggers.push({
              nome: concept.nome,
              categoryKey: concept.category,
              categoryLabel: labels[concept.category] || concept.category,
              nota: noteByNome[concept.nome],
              matchedOn: id
            });
          }
        } else if (nd && nd.is_in_taxonomy === 1) {
          // riconosciuto dalla tassonomia e non-FODMAP -> ok
        } else if (text) {
          fallback.push(text); // non riconosciuto -> al fallback lessicale
        }
      }

      if (nd && Array.isArray(nd.ingredients) && nd.ingredients.length && !isTrace) {
        walk(nd.ingredients, AGED_CHEESE_IDS[id] === 1);
      }
    }
  }

  walk(Array.isArray(tree) ? tree : [], false);
  return { triggers: triggers, fallbackText: fallback.join("  ") };
}

// Analizza un prodotto normalizzato (vedi openfoodfacts.normalizeProduct).
// `taxmap` (taxonomy-fodmap.json) e' opzionale: se assente o senza albero, si usa il
// solo path lessicale (retro-compatibile).
export function analyze(input, db, personal, taxmap) {
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
  // Haystack completo (per "extra", claim "senza lattosio" e per il fallback lessicale).
  const haystack = buildHaystack(sources.join("  "), personal);

  const tree = (input && Array.isArray(input.tree)) ? input.tree : [];
  let generic;
  if (taxmap && tree.length) {
    // 1) PRIMARIO: tassonomia sull'albero strutturato.
    const tax = taxonomyTriggers(tree, taxmap, db);
    generic = tax.triggers;
    // 2) FALLBACK: lessicale sui SOLI nodi non riconosciuti dalla tassonomia.
    if (tax.fallbackText.trim() !== "") {
      const fbHay = buildHaystack(tax.fallbackText, personal);
      const seenNomi = {};
      for (const t of generic) {
        seenNomi[t.nome] = true;
      }
      for (const t of findTriggers(fbHay, db)) {
        if (!seenNomi[t.nome]) {
          seenNomi[t.nome] = true;
          generic.push(t);
        }
      }
    }
  } else {
    // Nessun albero/tassonomia: solo path lessicale (retro-compatibile).
    generic = findTriggers(haystack, db);
  }

  // 3) Override personali per nome; default 'no' per le voci non elencate.
  const overrides = (personal && personal.override) || {};
  const defaultStato = (personal && personal._meta && personal._meta.default_generico) || "no";
  const triggers = [];
  const seen = {};
  for (const t of generic) {
    const ov = overrides[t.nome];
    const stato = ov ? (typeof ov === "string" ? ov : ov.stato) : defaultStato;
    if (stato === "si") {
      continue;
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

  // 4) Voci extra personali (no/limite) cercate sul testo completo.
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

  // 5) Claim "senza lattosio": i trigger di categoria lattosio non si applicano.
  //    Il claim puo' essere negli ingredienti, MA anche solo nell'etichetta OFF
  //    ("en:no-lactose"/"en:lactose-free") o nel nome del prodotto (es. "Philadelphia
  //    senza lattosio") — quindi controlliamo tutte e tre le fonti.
  const labels = (input && Array.isArray(input.labelsTags)) ? input.labelsTags : [];
  const nameHay = pad(normalizeText((input && input.name) || ""));
  const lactoseFree =
    haystack.indexOf(" senza lattosio ") >= 0 ||
    haystack.indexOf(" delattosat") >= 0 ||
    haystack.indexOf(" lactose free ") >= 0 ||
    haystack.indexOf(" zero lattosio ") >= 0 ||
    haystack.indexOf("contenuto di lattosio") >= 0 ||
    labels.indexOf("en:no-lactose") >= 0 ||
    labels.indexOf("en:lactose-free") >= 0 ||
    nameHay.indexOf(" senza lattosio ") >= 0 ||
    nameHay.indexOf(" delattosat") >= 0 ||
    nameHay.indexOf(" lactose free ") >= 0 ||
    nameHay.indexOf(" zero lattosio ") >= 0;
  const finalTriggers = lactoseFree
    ? triggers.filter(function (t) { return t.categoryKey !== "lattosio"; })
    : triggers;

  // 6) Verdetto.
  let verdict = "green";
  if (finalTriggers.some(function (t) { return t.stato === "no"; })) {
    verdict = "red";
  } else if (finalTriggers.some(function (t) { return t.stato === "limite"; })) {
    verdict = "yellow";
  }

  return {
    verdict: verdict,
    triggers: finalTriggers,
    product: product,
    analyzedIngredients: input.ingredientsText || ""
  };
}
