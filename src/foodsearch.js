// Ricerca testuale di ingredienti: l'utente scrive un alimento (es. "broccoli",
// "fagiolini", "cipolla") e otteniamo i match dal dizionario food-search.json,
// ciascuno classificato FODMAP. Tre esiti possibili:
//   - alto/moderato/basso FODMAP -> rosso/giallo/verde (con lo stato personale per le voci della dieta)
//   - nessun match -> "non so" (NON diamo verde per default)
// Il dizionario combina i concetti di high-fodmap.json (stato personale) con una lista
// low/moderate/high compilata da fonti autorevoli, con termini di ricerca IT+EN.

import { normalizeText } from "./normalize.js?v=2026.06.26-13";

// Radice IT/EN: toglie una vocale o `s` finale (parole >=5) per gestire singolare/plurale.
function stem(w) {
  return (w.length >= 5 && "aeios".indexOf(w[w.length - 1]) >= 0) ? w.slice(0, -1) : w;
}

// Cerca `query` nell'indice. Ritorna le voci ordinate per pertinenza, deduplicate per etichetta.
export function searchFoods(query, index, limit) {
  const qn = normalizeText(query || "");
  if (qn === "" || !Array.isArray(index)) {
    return [];
  }
  const qstems = qn.split(" ").map(stem);
  const scored = [];
  for (const e of index) {
    let best = 99;
    const terms = Array.isArray(e.t) ? e.t : [];
    for (const t of terms) {
      const tw = t.split(" ");
      if (t === qn) {
        best = 0;
        break;
      } else if ((" " + t + " ").indexOf(" " + qn + " ") >= 0) {
        best = Math.min(best, 1); // parola/frase intera
      } else if (qn.length >= 3 && tw.some(function (w) { return w.indexOf(qn) === 0; })) {
        best = Math.min(best, 2); // prefisso di parola
      } else if (qstems.every(function (qs) { return qs.length >= 4 && tw.some(function (w) { return stem(w) === qs; }); })) {
        best = Math.min(best, 3); // match per radice (singolare/plurale)
      }
    }
    if (best < 99) {
      scored.push({ rank: best, e: e });
    }
  }
  scored.sort(function (a, b) { return (a.rank - b.rank) || (a.e.label.length - b.e.label.length); });
  const out = [];
  const seen = {};
  for (const s of scored) {
    if (seen[s.e.label]) {
      continue;
    }
    seen[s.e.label] = true;
    out.push(s.e);
    if (out.length >= (limit || 8)) {
      break;
    }
  }
  return out;
}

// Classifica una voce dell'indice applicando il livello personale (per i 'concept').
// Ritorna { stato: 'no'|'limite'|'si', dose?, cat? }.
export function classifyFood(entry, personal) {
  if (entry.status === "concept") {
    const overrides = (personal && personal.override) || {};
    const def = (personal && personal._meta && personal._meta.default_generico) || "no";
    const ov = overrides[entry.nome];
    const stato = ov ? (typeof ov === "string" ? ov : ov.stato) : def;
    return { stato: stato, dose: (ov && ov.dose) ? ov.dose : undefined, cat: entry.cat };
  }
  if (entry.status === "high") {
    return { stato: "no", cat: entry.cat };
  }
  if (entry.status === "moderate") {
    return { stato: "limite", dose: entry.serving, cat: entry.cat };
  }
  return { stato: "si" }; // low
}
