// Endpoint del "ponte" serverless che salva le segnalazioni in reports/segnalazioni.json.
// Finche' e' vuoto, le segnalazioni restano in coda nel browser (localStorage) e
// vengono inviate appena l'endpoint e' configurato e c'e' rete.
// >>> Incolla qui l'URL del tuo Worker (es. "https://fodmap-report.xxx.workers.dev"). <<<
export const REPORT_ENDPOINT = "https://fodmap-report.buonalaprima.workers.dev";
