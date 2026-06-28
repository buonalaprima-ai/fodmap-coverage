// Segnalazioni utente ("segnala un problema").
//
// L'app e' statica: la segnalazione viene inviata via POST a un "ponte" serverless
// (vedi config.REPORT_ENDPOINT) che la appende a reports/segnalazioni.json nel repo.
// Se l'invio fallisce (offline o endpoint non ancora configurato) la segnalazione
// finisce in una CODA in localStorage e viene reinviata al prossimo avvio / invio.

import { REPORT_ENDPOINT } from "./config.js?v=2026.06.26-12";

const QUEUE_KEY = "fodmap-reports-queue-v1";

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function setQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch (e) { /* quota/privata: ignora */ }
}

export function pendingCount() {
  return getQueue().length;
}

async function postReport(report) {
  if (!REPORT_ENDPOINT) {
    throw new Error("endpoint non configurato");
  }
  const res = await fetch(REPORT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report)
  });
  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }
  return res.json().catch(function () { return {}; });
}

// Invia una segnalazione. Se fallisce, la mette in coda. Non lancia mai: ritorna lo stato.
export async function submitReport(report) {
  try {
    const data = await postReport(report);
    return { ok: true, remote: true, total: data && data.total };
  } catch (e) {
    const q = getQueue();
    q.push(report);
    setQueue(q);
    return { ok: true, remote: false, queued: true, pending: q.length, reason: e.message };
  }
}

// Reinvia le segnalazioni in coda (chiamare all'avvio e dopo un invio riuscito).
export async function flushQueue() {
  if (!REPORT_ENDPOINT) {
    return { sent: 0, pending: getQueue().length };
  }
  let q = getQueue();
  let sent = 0;
  while (q.length) {
    try {
      await postReport(q[0]);
      q.shift();
      setQueue(q);
      sent++;
    } catch (e) {
      break; // ancora offline / errore: riprova piu' tardi
    }
  }
  return { sent: sent, pending: q.length };
}
