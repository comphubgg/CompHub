import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { tagesVerdienst } from '@/lib/szeneStats';
import { besucheJeTag, tagVon } from '@/lib/besuche';
import { alleKonten } from '@/lib/konten';
import { alleZugaenge } from '@/lib/vipZugaenge';
import { liesJson } from '@/lib/ablage';

/*
 * Die Zahlen eines Tages - fuer den Admin-Kanal (#admin-zahlen).
 *
 * Der Betreiber: "wie viele Replays hochgeladen wurden, nur heute, und wie
 * viel es jetzt insgesamt hat, und neue Earnings an spezielle Spieler."
 * Gerechnet wird dort, wo die Dateien liegen - der stuendliche Lauf fragt
 * diese Adresse an seinem eigenen Server und schreibt die Antwort nach
 * Discord (scripts/admin-zahlen-discord.mjs). Nur Summen und die
 * Bestenliste des Tages, nichts Persoenliches: keine Mailadressen, keine
 * Schluessel.
 *
 *   ?tag=2026-09-21   ein bestimmter Tag (UTC), sonst heute
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Zustand {
  matches?: Record<string, { stand?: string; zuletzt?: string }>;
}

/** Die Replays: was je Match in _zustand.json steht, ueber alle Fenster. */
async function replayZahlen(tag: string) {
  const wurzel = path.join(DATEN_ORT, 'replays');
  const raus = { heute: 0, gesamt: 0, wartend: 0, fehlgeschlagen: 0, nichtVerfuegbar: 0, fenster: 0, fensterHeute: 0 };
  let saisons: string[] = [];
  try { saisons = await fs.readdir(wurzel); } catch { return raus; }
  for (const saison of saisons) {
    if (!/^S\d+$/.test(saison)) continue;
    let fenster: string[] = [];
    try { fenster = await fs.readdir(path.join(wurzel, saison)); } catch { continue; }
    for (const f of fenster) {
      let z: Zustand;
      try { z = JSON.parse(await fs.readFile(path.join(wurzel, saison, f, '_zustand.json'), 'utf8')) as Zustand; }
      catch { continue; }
      raus.fenster += 1;
      let heuteHier = false;
      for (const m of Object.values(z.matches ?? {})) {
        const stand = m.stand ?? '';
        if (stand === 'PARSED') {
          raus.gesamt += 1;
          if ((m.zuletzt ?? '').startsWith(tag)) { raus.heute += 1; heuteHier = true; }
        } else if (stand === 'FAILED') raus.fehlgeschlagen += 1;
        else if (stand === 'NOT_AVAILABLE') raus.nichtVerfuegbar += 1;
        else raus.wartend += 1;
      }
      if (heuteHier) raus.fensterHeute += 1;
    }
  }
  return raus;
}

/** Die Epic-Spieltage: wie viele Dateien, wie viele heute geholt. */
async function spieltagZahlen(tag: string) {
  const wurzel = path.join(DATEN_ORT, 'epic-spieltage');
  const raus = { gesamt: 0, heute: 0, heuteNamen: [] as string[] };
  let saisons: string[] = [];
  try { saisons = await fs.readdir(wurzel); } catch { return raus; }
  for (const saison of saisons) {
    if (!/^S\d+$|^LAN$/.test(saison)) continue;
    let dateien: string[] = [];
    try { dateien = await fs.readdir(path.join(wurzel, saison)); } catch { continue; }
    for (const d of dateien) {
      if (!d.endsWith('.json')) continue;
      raus.gesamt += 1;
      try {
        const j = JSON.parse(await fs.readFile(path.join(wurzel, saison, d), 'utf8')) as { geholt?: string; windowId?: string };
        if ((j.geholt ?? '').startsWith(tag)) { raus.heute += 1; raus.heuteNamen.push(j.windowId ?? d.replace(/\.json$/, '')); }
      } catch { /* unlesbar - zaehlt nur als Datei */ }
    }
  }
  return raus;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('tag') ?? '') ? searchParams.get('tag')! : tagVon();
  const seit = Date.parse(`${tag}T00:00:00Z`);

  const [replays, spieltage, verdienst, besuche, konten, zugaenge, szene] = await Promise.all([
    replayZahlen(tag),
    spieltagZahlen(tag),
    tagesVerdienst(seit).catch(() => null),
    besucheJeTag().catch(() => []),
    alleKonten().catch(() => []),
    alleZugaenge().catch(() => []),
    liesJson<Array<{ windowId?: string }>>('szene-stats/index.json', []).catch(() => [] as Array<{ windowId?: string }>),
  ]);

  const gestern = new Date(seit - 86_400_000).toISOString().slice(0, 10);
  const besuchHeute = besuche.find((b) => b.tag === tag) ?? null;
  const besuchGestern = besuche.find((b) => b.tag === gestern) ?? null;
  // Konten kennen ihr Anlegedatum nur in der vollen Datei - hier zaehlt die Verwaltungssicht.
  const kontenVoll = await liesJson<Array<{ angelegt?: string; zuletzt?: string }>>('konten.json', []).catch(() => [] as Array<{ angelegt?: string; zuletzt?: string }>);
  const liste = Array.isArray(kontenVoll) ? kontenVoll : [];

  return NextResponse.json({
    tag,
    replays,
    spieltage: { gesamt: spieltage.gesamt, heute: spieltage.heute, heuteNamen: spieltage.heuteNamen.slice(0, 20) },
    szene: { spieltage: Array.isArray(szene) ? szene.length : 0 },
    verdienst,
    besuche: { heute: besuchHeute, gestern: besuchGestern },
    konten: {
      gesamt: konten.length,
      neuHeute: liste.filter((k) => (k.angelegt ?? '').startsWith(tag)).length,
      aktivHeute: liste.filter((k) => (k.zuletzt ?? '').startsWith(tag)).length,
    },
    vip: {
      gesamt: zugaenge.filter((z) => z.status === 'active').length,
      neuHeute: zugaenge.filter((z) => (z.createdAt ?? '').startsWith(tag)).length,
    },
  });
}
