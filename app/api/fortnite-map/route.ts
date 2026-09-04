import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Aktuelles Fortnite-Kartenbild samt Ortsnamen - von fortnite-api.com,
// kostenlos und ohne Schluessel. Dadurch muss kein PNG mehr von Hand
// eingepflegt werden: nach einem Karten-Update stimmt das Bild von selbst.
//
// Die Quelle braucht nach einem Season-Start allerdings ein paar Tage, bis
// das neue Bild dort liegt. Damit man das sieht statt zu raten, reichen wir
// das Aenderungsdatum des Bildes als "Stand" mit durch.
//
//   /api/fortnite-map             -> Infos, Bild-URLs, Stand und alle Orte
//   /api/fortnite-map?bild=poi    -> das Bild selbst, mit Ortsnamen
//   /api/fortnite-map?bild=leer   -> das Bild ohne Ortsnamen
//   /api/fortnite-map?frisch=1    -> Zwischenspeicher uebergehen

interface MapAntwort {
  status: number;
  data: {
    images: { blank: string; pois: string };
    pois: Array<{ id: string; name: string; location: { x: number; y: number; z: number } }>;
  };
}

interface Karte {
  daten: MapAntwort['data'];
  stand: string | null;   // wann das Bild zuletzt geaendert wurde
  bis: number;
}

let cache: Karte | null = null;

// Eine halbe Stunde. Kurz genug, dass ein neues Kartenbild am Season-Start
// zeitnah durchkommt, lang genug um die Quelle nicht zu belasten.
const HALTBAR = 30 * 60_000;

async function holeKarte(frisch: boolean): Promise<Karte> {
  if (!frisch && cache && Date.now() < cache.bis) return cache;

  const res = await fetch('https://fortnite-api.com/v1/map', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Kartendienst antwortet mit ${res.status}`);
  const j = await res.json() as MapAntwort;

  // Kopfzeile des Bildes lesen, ohne das Bild zu laden.
  let stand: string | null = null;
  try {
    const kopf = await fetch(j.data.images.pois, { method: 'HEAD', cache: 'no-store' });
    stand = kopf.headers.get('last-modified');
  } catch { /* Stand ist ein Extra, kein Muss */ }

  cache = { daten: j.data, stand, bis: Date.now() + HALTBAR };
  return cache;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bild = searchParams.get('bild');
  const frisch = searchParams.get('frisch') === '1';

  try {
    const karte = await holeKarte(frisch);

    if (bild) {
      const url = bild === 'leer' ? karte.daten.images.blank : karte.daten.images.pois;
      const img = await fetch(url, { cache: 'no-store' });
      if (!img.ok) throw new Error(`Bild nicht ladbar (${img.status})`);
      // Die Bildadresse bleibt bei einem Karten-Update dieselbe - nur der
      // Inhalt dahinter aendert sich. Ohne einen Pruefwert koennte der Browser
      // deshalb tagelang das alte Bild behalten. Darum wird der Stand der
      // Quelle durchgereicht: der Browser fragt dann kurz nach, ob sich etwas
      // getan hat, statt blind das Gespeicherte zu nehmen.
      const kopf: Record<string, string> = {
        'Content-Type': img.headers.get('content-type') ?? 'image/png',
        // Fuenf Minuten aus eigener Kraft, danach jedes Mal kurz nachfragen.
        'Cache-Control': 'public, max-age=300, must-revalidate',
      };
      const stand = img.headers.get('last-modified');
      const marke = img.headers.get('etag');
      if (stand) kopf['Last-Modified'] = stand;
      if (marke) kopf['ETag'] = marke;

      return new NextResponse(img.body, { headers: kopf });
    }

    // Epics Weltkoordinaten laufen von etwa -135000 bis +135000. Fuer die
    // Karte rechnen wir sie in Prozent um, damit sie zu jeder Bildgroesse passen.
    // Y waechst dabei in dieselbe Richtung wie die Bildhoehe - gegen die Karte
    // geprueft: Lifty Lodge liegt oben links, Heatwave Harbor unten links.
    const SPANNE = 135_000;
    const orte = karte.daten.pois
      .map((p) => ({
        id: p.id,
        name: p.name,
        links: ((p.location.x + SPANNE) / (2 * SPANNE)) * 100,
        oben: ((p.location.y + SPANNE) / (2 * SPANNE)) * 100,
      }))
      // Epic listet manche Orte doppelt (etwa zwei "Carwash").
      .filter((o, i, alle) => alle.findIndex((x) => x.name === o.name) === i)
      .sort((a, b) => a.name.localeCompare(b.name));

    const standMs = karte.stand ? Date.parse(karte.stand) : NaN;
    const tageAlt = Number.isNaN(standMs)
      ? null : Math.floor((Date.now() - standMs) / 86_400_000);

    return NextResponse.json({
      bildMitNamen: '/api/fortnite-map?bild=poi',
      bildOhneNamen: '/api/fortnite-map?bild=leer',
      quelle: karte.daten.images.pois,
      stand: karte.stand,
      tageAlt,
      orte,
      anzahlOrte: orte.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
