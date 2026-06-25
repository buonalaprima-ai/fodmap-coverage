// Normalizzazione del testo per il matching FODMAP.
//
// Passi: minuscolo -> rimozione accenti (NFD + strip dei segni combinanti) ->
// ogni carattere non alfanumerico (punteggiatura, trattini, virgole...) diventa
// spazio -> spazi collassati. Il risultato e' una sequenza di "token" separati da
// un singolo spazio, cosi' il motore puo' cercare a CONFINE DI PAROLA (vedi engine.js):
// questo evita falsi positivi come "fos" dentro "fosfato" o "caco" dentro "cacao".
//
// La stessa funzione si applica al testo ingredienti, alle stringhe "match" e alle
// frasi "exclude": normalizzando entrambi i lati, trattini e accenti combaciano sempre
// (es. "glucosio-fruttosio" e "glucosio fruttosio" diventano identici).

// Segni diacritici combinanti U+0300..U+036F (costruito da stringa ASCII per evitare
// di incollare caratteri combinanti nel sorgente).
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const NON_ALNUM = /[^a-z0-9]+/g;
const MULTISPACE = /\s+/g;

export function normalizeText(input) {
  return (input == null ? "" : String(input))
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(NON_ALNUM, " ")
    .replace(MULTISPACE, " ")
    .trim();
}
