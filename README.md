# FODMAP Scanner

Web app **statica, interamente client-side** (nessun backend): scansiona o digita il codice
a barre di un prodotto, recupera gli ingredienti da **Open Food Facts** e dice se contiene
ingredienti **FODMAP**, con l'elenco completo dei trigger.

**URL pubblico:** https://buonalaprima-ai.github.io/fodmap-coverage/

## Regola del verdetto (binaria, 3 stati)

- 🔴 **red** — trovato ≥1 ingrediente FODMAP. Mostra *tutti* i trigger (grano incluso, nessuna eccezione).
- 🟢 **green** — ingredienti letti correttamente e nessun trigger.
- ⚪️ **unknown** — prodotto non trovato, o senza lista ingredienti. **Mai verde** in questo caso.

Nessuna soglia in grammi: se contiene un FODMAP della lista, è rosso. Categorie e note sono solo informative.

## Struttura

```
index.html               # app (shell + UI), carica src/main.js come modulo ES
high-fodmap.json         # base dati FODMAP (v2.1) — NON modificare
src/
  main.js                # wiring UI + eventi
  scanner.js             # fotocamera + ZXing, decodifica a 2 orientamenti (portrait/landscape)
  openfoodfacts.js       # fetch prodotto (+ normalizeProduct, funzione pura)
  engine.js              # motore di matching (cuore) + verdetto
  normalize.js           # normalizzazione testo (lowercase, accenti, confine di parola)
  render.js              # rendering del risultato
tests.html               # test del motore in-browser
test-copertura-off.html  # vecchio strumento di test copertura OFF (standalone)
```

Niente build: sono moduli ES puri serviti staticamente.

## Sviluppo locale

I moduli ES e la `fetch` di `high-fodmap.json` **non funzionano da `file://`**: serve un server locale.

```bash
cd fodmap-coverage
python3 -m http.server 8000
# poi apri http://localhost:8000/
```

La **fotocamera** richiede un contesto sicuro: funziona su `https` (GitHub Pages) e su
`localhost`, ma non aprendo il file direttamente.

## Test

Il motore è verificato da `tests.html`: apri **http://localhost:8000/tests.html** (o l'URL su Pages).
Copre i casi chiave: cipolla/aglio/inulina/grano → rosso; amido di mais / lecitina di soia →
nessun falso trigger; "fosfato" → niente FOS; prodotto pulito → verde; senza ingredienti → unknown;
match dai tag canonici OFF.

## Note sui dati

- `high-fodmap.json` è usato **così com'è**. Il matching è a **confine di parola** (token interi):
  evita falsi positivi come `fos` dentro `fosfato` o `caco` dentro `cacao`, pur riconoscendo le
  frasi multi-parola (`garlic powder`).
- Il campo `exclude` di alcune voci (latte, soia, mais) neutralizza le frasi low-FODMAP prima del
  match (es. `lecitina di soia`, `latte di mandorla`, `amido di mais`).
- **Gap noto:** la voce *Mandorle* (GOS) contiene il termine `mandorla`, quindi un prodotto
  "latte di mandorla" risulta attualmente **rosso** (la bevanda di mandorla è in realtà low-FODMAP).
  La voce *Latte* esclude già "latte di mandorla", ma *Mandorle* no. Risolvibile aggiungendo
  `"latte di mandorla"`/`"bevanda di mandorla"` agli `exclude` della voce *Mandorle*.

## Limiti

Strumento di allerta, non sostituisce la app Monash ufficiale né un dietista. Dipende dalla
copertura e dalla qualità dei dati su Open Food Facts.
