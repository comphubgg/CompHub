import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { liesJson } from '@/lib/ablage';
import {
  liesOrgs, schreibOrgs, saeubere, orgKennung, fuerDieOrg, ORGS_JAHR, type Org, type Posten,
} from '@/lib/orgs';
import { abgelegteAntwort, legeAntwortAb, ohneDateien } from '@/lib/antwortSpeicher';

/*
 * Die E-Sports-Organisationen (lib/orgs).
 *
 *   GET                      die Orgs mit Spielern und Preisgeld des Jahres
 *                            fuer die Org (ab Beitritt) - fuer jeden
 *   GET ?ansicht=verdienst   das Preisgeld je Spieler neu rechnen und
 *                            ablegen - ruft der stuendliche Lauf, wo die
 *                            Dateien liegen
 *   POST { org }             anlegen oder aendern (nur Admin)
 *   POST { loeschen: id }    entfernen (nur Admin)
 *
 * Wer bei welcher Org ist, gilt sofort; das Preisgeld kommt aus der
 * stuendlich gerechneten Antwort. Ein eben dazugekommener Spieler steht bis
 * zum naechsten Lauf ohne Betrag da ("wird gerechnet"), nicht mit 0.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';
const SCHLUESSEL = `orgs|verdienst|${ORGS_JAHR}`;

/** Fuer wen gerechnet wurde (konten) und was sie gewannen (posten - nur Konten mit Geld). */
interface VerdienstAntwort { zeit: number; konten?: string[]; posten: Record<string, Posten[]> }

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin' && !k.gesperrt) return true;
  }
  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;
  const name = vipAus(wert);
  if (!name) return false;
  return rechteVon(await zugangNach(name)).rolle === 'admin';
}

/** Das Preisgeld je Konto neu rechnen - nur, wo die Dateien liegen. */
async function rechne(orgs: Org[]): Promise<VerdienstAntwort> {
  const { verdienstPosten } = await import('@/lib/szeneStats');
  const ids = new Set(orgs.flatMap((o) => o.spieler.map((s) => s.epicId).filter((x): x is string => !!x)));
  return { zeit: Date.now(), konten: [...ids], posten: await verdienstPosten(ORGS_JAHR, ids) };
}

export async function GET(request: Request) {
  const ansicht = new URL(request.url).searchParams.get('ansicht');

  let orgs: Org[];
  try {
    orgs = await liesOrgs();
  } catch {
    // Nie "keine Organisationen" bei einem Ausfall - das saehe aus wie weg.
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 503 });
  }

  if (ansicht === 'verdienst') {
    if (ohneDateien()) return NextResponse.json({ fehler: 'only where the data files are' }, { status: 400 });
    const antwort = await rechne(orgs);
    await legeAntwortAb(SCHLUESSEL, antwort);
    return NextResponse.json({ ok: true, konten: Object.keys(antwort.posten).length });
  }

  let verdienst: VerdienstAntwort | null = null;
  try {
    verdienst = await abgelegteAntwort<VerdienstAntwort>(SCHLUESSEL);
    if (!verdienst && !ohneDateien()) {
      verdienst = await rechne(orgs);
      await legeAntwortAb(SCHLUESSEL, verdienst);
    }
  } catch { verdienst = null; }

  // Anzeige je Konto: der gepflegte Name, die Flagge, das Foto.
  const [profile, bilder] = await Promise.all([
    liesJson<Record<string, { name?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { name?: string; land?: string }>)),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  const bildZu = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.datei && b.echtesFoto) bildZu.set(b.epicId, `/spielerbilder/${encodeURIComponent(b.datei)}`);

  const raus = orgs.map((o) => {
    const spieler = o.spieler.map((s) => {
      const p = s.epicId ? profile[s.epicId] : undefined;
      const posten = s.epicId && verdienst ? (verdienst.posten[s.epicId] ?? null) : null;
      // Konto, das beim letzten Rechnen noch nicht dabei war: "wird gerechnet".
      const bekannt = !!(s.epicId && verdienst
        && (s.epicId in verdienst.posten || (verdienst.konten ?? []).includes(s.epicId)));
      const wert = posten ? fuerDieOrg(posten, s.seit) : (bekannt ? { betrag: 0, anzahl: 0 } : null);
      return {
        // Der Name, wie ihn die Org fuehrt - das Profil kennt oft nur den rohen Epic-Namen.
        epicId: s.epicId, name: s.name || p?.name || '?', land: p?.land ? String(p.land).toUpperCase() : null,
        bild: s.epicId ? bildZu.get(s.epicId) ?? null : null, seit: s.seit,
        betrag: wert ? wert.betrag : null, turniere: wert ? wert.anzahl : null,
      };
    }).sort((a, b) => (b.betrag ?? -1) - (a.betrag ?? -1));
    const jahrExtras = o.extras.filter((e) => !e.datum || e.datum.startsWith(String(ORGS_JAHR)));
    const summeSpieler = spieler.reduce((a, s) => a + (s.betrag ?? 0), 0);
    const gesamt = verdienst ? summeSpieler + jahrExtras.reduce((a, e) => a + e.betrag, 0) : null;
    return { ...o, spieler, extras: jahrExtras, gesamt };
  }).sort((a, b) => (b.gesamt ?? -1) - (a.gesamt ?? -1) || a.name.localeCompare(b.name));

  return NextResponse.json({ jahr: ORGS_JAHR, stand: verdienst?.zeit ?? null, orgs: raus });
}

export async function POST(request: Request) {
  if (!await istAdmin()) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const koerper = await request.json().catch(() => ({})) as { org?: Partial<Org>; loeschen?: string };

  let orgs: Org[];
  try { orgs = await liesOrgs(); } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now - nothing was saved.' }, { status: 503 });
  }

  if (koerper.loeschen) {
    orgs = orgs.filter((o) => o.id !== koerper.loeschen);
  } else if (koerper.org) {
    // Mit Kennung: diese Org aendern. Ohne: eine neue anlegen - nie eine
    // vorhandene gleichen Namens ueberschreiben.
    const neu = saeubere({ ...koerper.org, id: koerper.org.id || orgKennung(String(koerper.org.name ?? '')) });
    const i = koerper.org.id ? orgs.findIndex((o) => o.id === neu.id) : -1;
    if (i >= 0) orgs[i] = neu;
    else if (koerper.org.id) {
      return NextResponse.json({ fehler: 'This organization no longer exists.' }, { status: 404 });
    } else {
      // Eine neue Org mit einem schon vergebenen Namen bekommt eine eigene Kennung.
      let id = neu.id; let n = 2;
      while (orgs.some((o) => o.id === id)) id = `${neu.id}-${n++}`;
      orgs.push({ ...neu, id });
    }
  } else {
    return NextResponse.json({ fehler: 'Nothing to do.' }, { status: 400 });
  }

  try { await schreibOrgs(orgs); } catch (e) {
    return NextResponse.json({ fehler: `Not saved: ${(e as Error).message}` }, { status: 503 });
  }
  return NextResponse.json({ ok: true, orgs });
}
