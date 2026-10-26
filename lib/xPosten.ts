import crypto from 'crypto';
import { holeDienst } from '@/lib/dienstZugaenge';
import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Automatisch auf X posten (Betreiber, 26.10.2026: "automatisch auf Twitter Sachen posten, zum Beispiel Standings - fuer Europa und NAC").
 *
 * Gepostet wird, was ohnehin als fertiger Ergebnis-Post entsteht (lib/ergebnisPosts: Text mit @-Konten, dazu das Fotomosaik der Besten). Dieselben Zahlen, derselbe Text -
 * nur dass er von selbst auf X geht, wenn der Admin das eingeschaltet hat. Zwei Bedingungen, beide beim Admin:
 *   1. Die vier Schluessel der X-App stehen unter /admin/services (API-Schluessel und Zugriffstoken, mit Schreibrecht) - die traegt nur er selbst ein.
 *   2. Der Schalter "Automatisch posten" ist an (Voreinstellung: aus), und die Region steht in der Liste (Voreinstellung: EU und NAC).
 *
 * Gesendet wird ueber die offizielle Schnittstelle von X (v2, OAuth 1.0a im Namen des Kontos). Bild zuerst hochladen, dann der Beitrag. Ist der Text fuer das Konto zu lang
 * (ein Konto ohne Premium darf 280 Zeichen), geht eine gekuerzte Fassung mit den ersten fuenf Plaetzen hinaus. Was schiefgeht, steht als Meldung in #admin-alarm -
 * ein Fehler hier darf den Ergebnis-Post nicht aufhalten.
 */

const EINSTELLUNG = 'x-autopost.json';
const GEPOSTET = 'x-gepostet.json';

export interface XEinstellung { an: boolean; regionen: string[] }
const STANDARD: XEinstellung = { an: false, regionen: ['EU', 'NAC'] };

export async function xEinstellung(): Promise<XEinstellung> {
  const e = await liesJson<Partial<XEinstellung>>(EINSTELLUNG, {});
  return { an: e.an === true, regionen: Array.isArray(e.regionen) ? e.regionen.map(String) : STANDARD.regionen };
}
export async function xEinstellungSetzen(neu: Partial<XEinstellung>): Promise<XEinstellung> {
  const alt = await xEinstellung();
  const fertig: XEinstellung = {
    an: typeof neu.an === 'boolean' ? neu.an : alt.an,
    regionen: Array.isArray(neu.regionen) ? [...new Set(neu.regionen.map((r) => String(r).toUpperCase()).filter((r) => /^[A-Z]{2,4}$/.test(r)))] : alt.regionen,
  };
  await schreibJson(EINSTELLUNG, fertig);
  return fertig;
}

async function schluessel() {
  const [k, z] = await Promise.all([holeDienst('x'), holeDienst('xzugang')]);
  if (k.woher === 'fehlt' || z.woher === 'fehlt') return null;
  return { apiKey: k.id, apiSecret: k.secret, token: z.id, tokenSecret: z.secret };
}

/** Sind alle vier Schluessel eingetragen? */
export async function xBereit(): Promise<boolean> { return (await schluessel()) !== null; }

const kodiere = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Der OAuth-1.0a-Kopf einer Anfrage. Bei JSON- und Multipart-Rumpf gehen nur die oauth-Felder (und die Adressparameter) in die Signatur. */
function oauthKopf(methode: string, adresse: string, k: NonNullable<Awaited<ReturnType<typeof schluessel>>>): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: k.apiKey, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: k.token, oauth_version: '1.0',
  };
  const u = new URL(adresse);
  const params: Array<[string, string]> = [...Object.entries(oauth), ...[...u.searchParams.entries()]];
  const norm = params.map(([a, b]) => [kodiere(a), kodiere(b)] as const).sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([a, b]) => `${a}=${b}`).join('&');
  const basis = [methode.toUpperCase(), kodiere(`${u.origin}${u.pathname}`), kodiere(norm)].join('&');
  const signatur = crypto.createHmac('sha1', `${kodiere(k.apiSecret)}&${kodiere(k.tokenSecret)}`).update(basis).digest('base64');
  const alle = { ...oauth, oauth_signature: signatur };
  return 'OAuth ' + Object.entries(alle).map(([a, b]) => `${kodiere(a)}="${kodiere(b)}"`).join(', ');
}

async function bildHochladen(png: Uint8Array, k: NonNullable<Awaited<ReturnType<typeof schluessel>>>): Promise<string | null> {
  const versuche: Array<{ adresse: string; felder: Record<string, string> }> = [
    { adresse: 'https://api.x.com/2/media/upload', felder: { media_category: 'tweet_image' } },
    { adresse: 'https://upload.twitter.com/1.1/media/upload.json', felder: {} },
  ];
  for (const v of versuche) {
    try {
      const form = new FormData();
      form.append('media', new Blob([png as BlobPart], { type: 'image/png' }), 'plakat.png');
      for (const [a, b] of Object.entries(v.felder)) form.append(a, b);
      const r = await fetch(v.adresse, { method: 'POST', headers: { Authorization: oauthKopf('POST', v.adresse, k) }, body: form, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) continue;
      const j = await r.json() as { data?: { id?: string }; media_id_string?: string };
      const id = j.data?.id ?? j.media_id_string;
      if (id) return String(id);
    } catch { /* der naechste Weg */ }
  }
  return null;
}

/** Eine kuerzere Fassung: die Kopfzeile, die ersten fuenf Plaetze und der Link - fuer Konten, die nicht lang posten duerfen. */
export function kurzFassung(text: string): string {
  const zeilen = text.split('\n');
  const kopf = zeilen[0] ?? '';
  const plaetze = zeilen.filter((z) => /^(🥇|🥈|🥉|4️⃣|5️⃣)/u.test(z));
  const link = zeilen.find((z) => z.includes('https://')) ?? '';
  return [kopf, '', ...plaetze, '', link].join('\n').trim();
}

export async function xPosten(o: { text: string; png?: Uint8Array | null }): Promise<{ ok: boolean; id?: string; grund?: string }> {
  const k = await schluessel();
  if (!k) return { ok: false, grund: 'Die X-Schluessel sind nicht eingetragen.' };
  const medien = o.png ? await bildHochladen(o.png, k) : null;
  const senden = async (text: string) => {
    const adresse = 'https://api.x.com/2/tweets';
    return fetch(adresse, {
      method: 'POST', headers: { Authorization: oauthKopf('POST', adresse, k), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(medien ? { media: { media_ids: [medien] } } : {}) }), signal: AbortSignal.timeout(30_000),
    });
  };
  try {
    let r = await senden(o.text);
    if (!r.ok) {
      const j = await r.clone().json().catch(() => ({} as Record<string, unknown>));
      const roh = JSON.stringify(j).toLowerCase();
      // Zu lang fuer dieses Konto: die kurze Fassung.
      if (r.status === 403 || r.status === 400) if (/too long|shorter|length|character/.test(roh)) r = await senden(kurzFassung(o.text));
    }
    const j = await r.json().catch(() => ({} as { data?: { id?: string }; detail?: string; title?: string }));
    if (!r.ok) return { ok: false, grund: `X antwortet mit ${r.status}: ${String((j as { detail?: string; title?: string }).detail ?? (j as { title?: string }).title ?? '').slice(0, 200)}` };
    return { ok: true, id: (j as { data?: { id?: string } }).data?.id, grund: medien || !o.png ? undefined : 'ohne Bild (der Bild-Upload wurde abgelehnt)' };
  } catch (e) { return { ok: false, grund: (e as Error).message }; }
}

/** Den Beitrag einer Region automatisch senden - nur, wenn alles bereit und eingeschaltet ist und der Beitrag noch nicht draussen war. */
export async function xAutopost(o: { schluessel: string; region: string; text: string; png?: Uint8Array | null }): Promise<{ ok: boolean; grund?: string; id?: string; uebersprungen?: boolean }> {
  const e = await xEinstellung();
  if (!e.an || !e.regionen.includes(o.region.toUpperCase())) return { ok: true, uebersprungen: true };
  if (!await xBereit()) return { ok: false, grund: 'Der Schalter ist an, aber die X-Schluessel fehlen (/admin/services).' };
  const gepostet = await liesJson<string[]>(GEPOSTET, []);
  if (gepostet.includes(o.schluessel)) return { ok: true, uebersprungen: true };
  const r = await xPosten({ text: o.text, png: o.png });
  // Auch ein Fehlversuch wird vermerkt - sonst kaeme der Beitrag nach einem Fehler alle zehn Minuten noch einmal, und ein halber Erfolg (Bild fehlt) doppelt.
  await schreibJson(GEPOSTET, [...gepostet, o.schluessel].slice(-400));
  return r;
}
