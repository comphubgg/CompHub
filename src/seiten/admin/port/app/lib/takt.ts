/*
 * Ein Takt, der nur laeuft, solange jemand hinsieht.
 *
 * Am 27.9.2026, am zweiten Tag der Globals, hat Vercel die ganze Seite
 * gesperrt: die vier Stunden Rechenzeit im Monat, die der kostenlose Tarif
 * erlaubt, waren aufgebraucht. Verbraucht hatten sie nicht die Seiten
 * selbst, sondern das Nachfragen: jede offene Seite fragte alle zehn bis
 * dreissig Sekunden nach Konto, Bereichen und Schloessern - auch in Tabs,
 * die niemand ansah. Hundert Zuschauer ergaben so Zehntausende Aufrufe in
 * der Stunde.
 *
 * Deshalb: ein verborgener Tab fragt nicht. Wird er wieder sichtbar und ist
 * der letzte Lauf laenger her als ein Takt, wird sofort nachgefragt, damit
 * niemand einen alten Stand sieht.
 */
export function sichtbarerTakt(lauf: () => void, ms: number): () => void {
  let zuletzt = Date.now();
  const einmal = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    zuletzt = Date.now();
    lauf();
  };
  const uhr = setInterval(einmal, ms);
  const beiSichtbar = () => {
    if (!document.hidden && Date.now() - zuletzt >= ms) einmal();
  };
  document.addEventListener('visibilitychange', beiSichtbar);
  return () => {
    clearInterval(uhr);
    document.removeEventListener('visibilitychange', beiSichtbar);
  };
}

/*
 * Ein Abruf, den sich alle Teile einer Seite teilen.
 *
 * Kopfzeile, Zugang und Chat fragten dieselbe Stelle (/api/konto) jeder fuer
 * sich - drei Aufrufe fuer eine Auskunft. Wer innerhalb der Frist dasselbe
 * wissen will, bekommt die Antwort, die schon unterwegs oder da ist.
 */
export interface GeteilteAntwort<T> { ok: boolean; status: number; daten: T | null }

const abrufe = new Map<string, { zeit: number; wert: Promise<GeteilteAntwort<unknown>> }>();

export function geteilterAbruf<T>(url: string, frischMs = 15_000): Promise<GeteilteAntwort<T>> {
  const da = abrufe.get(url);
  if (da && Date.now() - da.zeit < frischMs) return da.wert as Promise<GeteilteAntwort<T>>;
  const wert = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
    .then(async (r) => ({ ok: r.ok, status: r.status, daten: await r.json().catch(() => null) as T | null }));
  abrufe.set(url, { zeit: Date.now(), wert });
  // Ein Fehlschlag bleibt nicht liegen - der naechste fragt neu.
  wert.catch(() => { if (abrufe.get(url)?.wert === wert) abrufe.delete(url); });
  return wert;
}

/** Nach einer Aenderung (Anmelden, Abmelden, Rechte) wieder frisch fragen. */
export function vergissAbruf(url?: string) {
  if (url) abrufe.delete(url); else abrufe.clear();
}
