import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import {
  liesOrgs, schreibOrgs, saeubere, orgKennung, fuerDieOrg, fensterFuerDieOrg, ORGS_JAHR, type Org, type Posten,
} from '@/lib/orgs';
import { abgelegteAntwort, legeAntwortAb, ohneDateien } from '@/lib/antwortSpeicher';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';
import { istAdminAnfrage } from '@/lib/adminPruefung';

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

const SCHLUESSEL = `orgs|verdienst|${ORGS_JAHR}`;
/*
 * Ueber alle Jahre - wie bei Fortnite Tracker (Betreiber, 30.9.2026): die
 * heutigen Spieler ab Beitritt in jedem Jahr, dazu die Ehemaligen fuer die
 * Zeit, in der sie bei der Org waren.
 */
const SCHLUESSEL_ALLE = 'orgs|verdienst|alle';

/** Fuer wen gerechnet wurde (konten) und was sie gewannen (posten - nur Konten mit Geld). */
interface VerdienstAntwort { zeit: number; konten?: string[]; posten: Record<string, Posten[]> }

/** Das Preisgeld je Konto neu rechnen - nur, wo die Dateien liegen. */
async function rechne(orgs: Org[]): Promise<VerdienstAntwort> {
  const { verdienstPosten } = await import('@/lib/szeneStats');
  const ids = new Set(orgs.flatMap((o) => o.spieler.map((s) => s.epicId).filter((x): x is string => !!x)));
  return { zeit: Date.now(), konten: [...ids], posten: await verdienstPosten(ORGS_JAHR, ids) };
}

/** Dasselbe ueber alle Jahre, fuer heutige und ehemalige Spieler. */
async function rechneAlle(orgs: Org[]): Promise<VerdienstAntwort> {
  const { verdienstPosten, JAHR_SAISONS } = await import('@/lib/szeneStats');
  const ids = new Set([
    ...orgs.flatMap((o) => o.spieler.map((s) => s.epicId)),
    ...orgs.flatMap((o) => (o.ehemalige ?? []).map((e) => e.epicId ?? null)),
  ].filter((x): x is string => !!x));
  const posten: Record<string, Posten[]> = {};
  for (const jahr of Object.keys(JAHR_SAISONS).map(Number).sort()) {
    const teil = await verdienstPosten(jahr, ids);
    for (const [id, liste] of Object.entries(teil)) {
      const da = new Set((posten[id] ?? []).map((p) => p.windowId));
      posten[id] = [...(posten[id] ?? []), ...liste.filter((p) => !da.has(p.windowId))];
    }
  }
  return { zeit: Date.now(), konten: [...ids], posten };
}

/** Rang einer Region fuer den Gleichstand: EU vorn, dann die uebliche Reihenfolge, Unbekanntes zuletzt. */
const regionRang = (r: string | null | undefined) => { const i = r ? REGIONEN_REIHE.indexOf(r as never) : -1; return i < 0 ? 99 : i; };

export async function GET(request: Request) {
  const ansicht = new URL(request.url).searchParams.get('ansicht');

  let orgs: Org[];
  try {
    orgs = await liesOrgs();
  } catch {
    // Nie "keine Organisationen" bei einem Ausfall - das saehe aus wie weg.
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 424 });
  }

  if (ansicht === 'verdienst') {
    if (ohneDateien()) return NextResponse.json({ fehler: 'only where the data files are' }, { status: 400 });
    const antwort = await rechne(orgs);
    await legeAntwortAb(SCHLUESSEL, antwort);
    const alle = await rechneAlle(orgs);
    await legeAntwortAb(SCHLUESSEL_ALLE, alle);
    return NextResponse.json({ ok: true, konten: Object.keys(antwort.posten).length, kontenAlle: Object.keys(alle.posten).length });
  }

  // "?zeitraum=alle": alle Jahre samt Ehemaligen; sonst das Jahr (ORGS_JAHR).
  const alleJahre = new URL(request.url).searchParams.get('zeitraum') === 'alle';
  const schluessel = alleJahre ? SCHLUESSEL_ALLE : SCHLUESSEL;
  let verdienst: VerdienstAntwort | null = null;
  try {
    verdienst = await abgelegteAntwort<VerdienstAntwort>(schluessel);
    if (!verdienst && !ohneDateien()) {
      verdienst = alleJahre ? await rechneAlle(orgs) : await rechne(orgs);
      await legeAntwortAb(schluessel, verdienst);
    }
  } catch { verdienst = null; }

  // Anzeige je Konto: der gepflegte Name, die Flagge, das Foto.
  const [profile, bilder] = await Promise.all([
    liesJson<Record<string, { name?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { name?: string; land?: string }>)),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  const bildZu = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.datei && b.echtesFoto) bildZu.set(b.epicId, spielerbildKlein(b.datei));

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
        // Das Foto am Konto, sonst das vom Admin hier hochgeladene.
        // "?v=2": Cloudflare hielt fuer diese Fotos ein 404 fest (30.9.2026) -
        // eine neue Adresse holt sie frisch.
        bild: (s.epicId ? bildZu.get(s.epicId) : null) ?? (s.bild ? `${s.bild}?v=2` : null),
        eigenesBild: s.bild ?? null, seit: s.seit,
        // Durchgereicht, damit das Admin-Werkzeug sie beim Speichern behaelt.
        liquipedia: s.liquipedia ?? null,
        betrag: wert ? wert.betrag : null, turniere: wert ? wert.anzahl : null,
        rolle: s.rolle, x: s.x || (p as { x?: string } | undefined)?.x || null,
        twitch: s.twitch, tiktok: s.tiktok, youtube: s.youtube,
      };
    }).sort((a, b) => (b.betrag ?? -1) - (a.betrag ?? -1));
    const jahrExtras = alleJahre ? o.extras
      : o.extras.filter((e) => !e.datum || e.datum.startsWith(String(ORGS_JAHR)));
    /*
     * Die Ehemaligen - fuer den Roster-Verlauf und, ueber alle Jahre, mit
     * dem, was sie in ihrer Zeit bei der Org gewonnen haben. Ohne Konto
     * bleibt der Betrag leer (null), statt 0 vorzutaeuschen.
     */
    const ehemalige = (o.ehemalige ?? []).map((e) => {
      // Wie bei den heutigen Spielern: ein Konto, das beim letzten Rechnen noch nicht dabei war, hat keinen Betrag (null, "wird gerechnet") - nicht 0.
      const bekannt = !!(e.epicId && verdienst
        && (e.epicId in verdienst.posten || (verdienst.konten ?? []).includes(e.epicId)));
      const posten = e.epicId && verdienst && bekannt ? (verdienst.posten[e.epicId] ?? []) : null;
      const wert = alleJahre && posten ? fuerDieOrg(posten, e.seit, e.bis) : null;
      return {
        // liquipedia durchgereicht, damit das Admin-Werkzeug sie behaelt.
        name: e.name, liquipedia: e.liquipedia ?? null,
        epicId: e.epicId ?? null, seit: e.seit, bis: e.bis,
        land: e.epicId && profile[e.epicId]?.land ? String(profile[e.epicId]!.land).toUpperCase() : null,
        betrag: wert ? wert.betrag : null, turniere: wert ? wert.anzahl : null,
      };
    });
    // Zum Preisgeld der Org zaehlt nur das Pro Roster - Academy und Creator
    // stehen mit ihren eigenen Zahlen da, gehen aber nicht in die Summe.
    const summeSpieler = spieler.filter((s) => s.rolle === 'pro').reduce((a, s) => a + (s.betrag ?? 0), 0);
    const summeEhemalige = alleJahre ? ehemalige.reduce((a, e) => a + (e.betrag ?? 0), 0) : 0;
    // Kennt die Org weder bei Pro-Spielern (und Ehemaligen) einen Betrag noch Extras, ist die Summe unbekannt (null) - nicht 0 (Konto fehlt oder wird noch gerechnet).
    const betragBekannt = spieler.some((s) => s.rolle === 'pro' && s.betrag !== null)
      || (alleJahre && ehemalige.some((e) => e.betrag !== null)) || jahrExtras.length > 0;
    const gesamt = verdienst && betragBekannt ? summeSpieler + summeEhemalige + jahrExtras.reduce((a, e) => a + e.betrag, 0) : null;
    // Bezahlte Turniere der Org: jeder Spieltag einmal, auch wenn mehrere
    // Spieler darin Geld holten (gleiche Auswahl wie bei der Summe: Pro + Ehemalige).
    const fenster = new Set<string>();
    if (verdienst) {
      for (const s of o.spieler) {
        if (s.rolle !== 'pro' || !s.epicId) continue;
        const po = verdienst.posten[s.epicId];
        if (po) for (const w of fensterFuerDieOrg(po, s.seit)) fenster.add(w);
      }
      if (alleJahre) {
        for (const e of o.ehemalige ?? []) {
          const po = e.epicId ? verdienst.posten[e.epicId] : null;
          if (po) for (const w of fensterFuerDieOrg(po, e.seit, e.bis)) fenster.add(w);
        }
      }
    }
    const turniereOrg = verdienst ? fenster.size : null;
    return { ...o, spieler, ehemalige, extras: jahrExtras, gesamt, turniereOrg };
  }).sort((a, b) => (b.gesamt ?? -1) - (a.gesamt ?? -1)
    // Gleichstand (viele Orgs ohne Preisgeld): EU zuerst, dann die mit dem groesseren Kader - nie alphabetisch (Betreiber).
    || regionRang(a.region) - regionRang(b.region)
    || b.spieler.length - a.spieler.length
    || a.name.localeCompare(b.name));

  return NextResponse.json({ jahr: alleJahre ? 'alle' : ORGS_JAHR, stand: verdienst?.zeit ?? null, orgs: raus });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const koerper = await request.json().catch(() => ({})) as { org?: Partial<Org>; loeschen?: string };

  let orgs: Org[];
  try { orgs = await liesOrgs(); } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now - nothing was saved.' }, { status: 424 });
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
    return NextResponse.json({ fehler: `Not saved: ${(e as Error).message}` }, { status: 424 });
  }
  return NextResponse.json({ ok: true, orgs });
}
