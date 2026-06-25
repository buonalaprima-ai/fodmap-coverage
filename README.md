# FODMAP Scanner (personalizzato)

Web app **statica, interamente client-side** (nessun backend): scansiona o digita il codice
a barre di un prodotto, recupera gli ingredienti da **Open Food Facts** e dà un verdetto
**personalizzato sulla dieta della Dr.ssa Francesca Fanucchi**.

**URL pubblico:** https://buonalaprima-ai.github.io/fodmap-coverage/

## Verdetto (3 stati, personalizzato)

- 🔴 **Da evitare** — contiene ≥1 ingrediente "no" della tua dieta (o un FODMAP generico non approvato).
- 🟡 **OK in piccola dose** — nessun "no", ma ci sono alimenti consentiti solo entro una **dose** (mostrata).
- 🟢 **OK per te** — tutto consentito.
- ⚪️ **Non determinabile** — prodotto non su OFF o senza ingredienti (mai verde in questo caso).

Mostra sempre l'elenco degli ingredienti rilevanti (da evitare / in piccola dose con la dose) e
il testo ingredienti analizzato, per verifica a occhio.

## Come funziona la personalizzazione

Due livelli:

1. **`high-fodmap.json`** (generico, v2.1, NON modificare) — ogni voce è un FODMAP; serve a *rilevare*
   gli ingredienti con match a confine di parola (token interi: evita falsi come `fos` in `fosfato`).
2. **`personal-fodmap.json`** (la tua dieta) — applicato sopra il generico:
   - `consentiti`: frasi SÌ da azzerare prima del match (specificità: "latte di mandorla" non fa
     scattare "Mandorle").
   - `override`: rietichetta una voce generica per nome → `si` (verde), `limite` (giallo + `dose`), `no` (rosso).
   - `extra`: voci no/limite della tua dieta non presenti nel generico (es. miso, glicerina, kamut).
   - Le voci generiche non elencate restano **rosse** (sono comunque FODMAP non approvati).

Per aggiornare la dieta basta editare `personal-fodmap.json` (nessun build).

## Struttura

```
index.html               # app (shell + UI), carica src/main.js
high-fodmap.json         # base FODMAP generica (v2.1) — NON modificare
personal-fodmap.json     # livello personale (dieta Fanucchi): si / limite(+dose) / no
src/
  main.js                # wiring UI + eventi (carica entrambi i JSON)
  scanner.js             # fotocamera + ZXing, decodifica a 2 orientamenti (portrait/landscape)
  openfoodfacts.js       # fetch prodotto (+ normalizeProduct, funzione pura)
  engine.js              # motore di matching + verdetto personalizzato a 3 stati
  normalize.js           # normalizzazione testo (lowercase, accenti, confine di parola)
  render.js              # rendering del risultato (3 colori + dose)
tests.html               # test del motore in-browser (personalizzato)
test-copertura-off.html  # vecchio strumento di test copertura OFF (standalone)
```

Niente build: moduli ES puri serviti staticamente.

## Sviluppo locale

I moduli ES e la `fetch` dei JSON **non funzionano da `file://`**: serve un server locale.

```bash
cd fodmap-coverage
python3 -m http.server 8000
# poi apri http://localhost:8000/  (e .../tests.html per i test)
```

La **fotocamera** richiede contesto sicuro: funziona su `https` (Pages) e `localhost`, non da `file://`.

## Limiti

Strumento di allerta personale, non sostituisce la app Monash né la nutrizionista. Dipende dalla
copertura e qualità dei dati su Open Food Facts. Alcune indicazioni della dieta sono tipi di
prodotto (es. "condimenti pronti", "mix di verdure in polvere") non rilevabili dai singoli
ingredienti: in quei casi controlla l'etichetta a mano.
