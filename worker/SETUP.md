# Setup del "ponte" segnalazioni (Cloudflare Worker)

Obiettivo: far sì che il pulsante **Segnala un problema** salvi ogni segnalazione come
entry in [`reports/segnalazioni.json`](../reports/segnalazioni.json) del repo, in automatico.
Il token GitHub resta **lato server** (secret del Worker), mai nella pagina pubblica.

Tutto si fa dal browser, senza installare nulla.

## 1) Crea un token GitHub (scope minimo)

1. Vai su **https://github.com/settings/personal-access-tokens/new** (Fine-grained token), loggato come `buonalaprima-ai`.
2. **Repository access** → *Only select repositories* → scegli **`fodmap-coverage`**.
3. **Permissions** → *Repository permissions* → **Contents: Read and write**. (Nient'altro.)
4. **Expiration**: a piacere (es. 90 giorni; quando scade lo rigeneri).
5. Genera e **copia** il token (`github_pat_...`).

## 2) Crea il Worker su Cloudflare

1. Account gratuito su **https://dash.cloudflare.com** (se non ce l'hai).
2. **Workers & Pages** → **Create application** → **Create Worker** → dai un nome (es. `fodmap-report`) → **Deploy**.
3. **Edit code**: cancella il codice di esempio e incolla tutto il contenuto di
   [`report-worker.js`](report-worker.js). **Deploy** (Save and deploy).
4. **Settings → Variables and Secrets** → **Add** → tipo **Secret** →
   - Name: `GITHUB_TOKEN`
   - Value: il token del passo 1
   → **Deploy**.
5. Copia l'**URL** del Worker (tipo `https://fodmap-report.<tuo-subdominio>.workers.dev`).

## 3) Collega la pagina

Incolla l'URL in [`src/config.js`](../src/config.js):

```js
export const REPORT_ENDPOINT = "https://fodmap-report.xxx.workers.dev";
```

Poi commit + push (oppure passami l'URL e lo faccio io). Fatto: le segnalazioni
arrivano in `reports/segnalazioni.json`.

## Note

- Il Worker accetta richieste solo dall'origine della pagina (`buonalaprima-ai.github.io`) e
  limita la dimensione dei campi (anti-abuso).
- Finché l'URL non è configurato (o se sei offline), le segnalazioni restano in **coda nel
  browser** e vengono inviate automaticamente al successivo avvio/invio.
- Alternativa equivalente: lo stesso codice gira su **Val Town** (HTTP val + env `GITHUB_TOKEN`).
