import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { liesJson } from '@/lib/ablage';
import {
  liesGalerie, schreibGalerie, liesBild, schreibBild, loescheBild, neueId,
  type Galerie, type GalerieEintrag, type GalerieEvent,
} from '@/lib/galerie';

// Das Archiv - Fotos und Videos zu Events und Spielern (siehe lib/galerie).
//
//   GET                       -> Events, Eintraege und die Spieler darauf
//                                (Name, Flagge, Foto - aus den gepflegten Profilen)
//   GET ?spieler=<id>         -> nur, worauf dieser Spieler zu sehen ist
//   GET ?cup=<id>             -> nur die Events zu diesem Cup (Reiter Archiv der Cup-Seite)
//   GET ?bild=<datei>         -> das Bild selbst
//   POST (multipart)          -> aktion=event | bild | video (nur Admin)
//   PATCH (JSON)              -> Titel, Spieler oder Event-Angaben aendern (nur Admin)
//   DELETE ?id=… | ?event=…   -> einen Eintrag oder ein ganzes Event entfernen (nur Admin)
//
// Lesen darf jeder, aendern nur der Admin.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ERLAUBT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
/** Zwanzig Megabyte je Bild - ein Foto von der Kamera, kein Rohbild. */
const MAX_BYTES = 20 * 1024 * 1024;

const sauber = (s: unknown, n = 120) => String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const ids = (s: unknown) => String(s ?? '').split(',').map((x) => x.trim().toLowerCase())
  .filter((x) => /^[0-9a-f]{32}$/.test(x)).filter((x, i, a) => a.indexOf(x) === i);

/**
 * Die Spieler auf den Bildern - Name, Flagge, Foto - aus den gepflegten
 * Profilen, sonst aus dem Namensverzeichnis. Nur, was belegt ist.
 */
async function spielerAngaben(alle: string[]) {
  const profile = await liesJson<Record<string, { id?: string; name?: string; anzeige?: string; land?: string }>>('spieler-profile.json', {});
  const namen = await liesJson<Record<string, { haupt?: string; namen?: string[] }>>('spieler-namen.json', {});
  const bilder = await liesJson<Array<{ datei: string; epicId: string; echtesFoto?: boolean }>>('spielerbilder.json', []);
  const proId = new Map<string, { name: string; land: string | null; bild: string | null }>();
  const profilVon = new Map<string, { name?: string; anzeige?: string; land?: string }>();
  for (const [k, p] of Object.entries(profile)) {
    const id = p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '');
    if (id) profilVon.set(id.toLowerCase(), p);
  }
  const bildVon = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.echtesFoto) bildVon.set(b.epicId.toLowerCase(), `/spielerbilder/${encodeURIComponent(b.datei)}`);
  for (const id of alle) {
    const p = profilVon.get(id);
    const n = namen[id];
    proId.set(id, {
      name: p?.anzeige || p?.name || n?.haupt || n?.namen?.[0] || id.slice(0, 8),
      land: p?.land || null,
      bild: bildVon.get(id) ?? null,
    });
  }
  return Object.fromEntries(proId);
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const bild = p.get('bild');
  if (bild) {
    const daten = await liesBild(bild);
    if (!daten) return NextResponse.json({ error: 'kein Bild' }, { status: 404 });
    const ext = bild.split('.').pop()!.toLowerCase();
    const typ = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return new NextResponse(new Uint8Array(daten), {
      headers: {
        'Content-Type': typ,
        // Ein Bild aendert sich nie - nur sein Name waere ein anderes Bild.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  const g = await liesGalerie();
  const wer = (p.get('spieler') ?? '').trim().toLowerCase();
  const cup = (p.get('cup') ?? '').trim();
  let events = g.events;
  let eintraege = g.eintraege;
  if (cup) {
    events = events.filter((ev) => ev.cupId === cup);
    const ids = new Set(events.map((ev) => ev.id));
    eintraege = eintraege.filter((e) => ids.has(e.eventId));
  }
  if (wer) eintraege = eintraege.filter((e) => e.spieler.includes(wer));
  const alle = [...new Set(eintraege.flatMap((e) => e.spieler))];
  return NextResponse.json({
    success: true,
    events: [...events].sort((a, b) => b.datum.localeCompare(a.datum)),
    eintraege: [...eintraege].sort((a, b) => b.erstellt - a.erstellt),
    spieler: await spielerAngaben(alle),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!(await istAdminAnfrage(request))) return NextResponse.json({ error: 'nur Admin' }, { status: 403 });
  const form = await request.formData();
  const aktion = String(form.get('aktion') ?? '');
  const g = await liesGalerie();

  if (aktion === 'event') {
    const name = sauber(form.get('name'), 80);
    const datum = sauber(form.get('datum'), 10);
    if (!name) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return NextResponse.json({ error: 'Datum als JJJJ-MM-TT' }, { status: 400 });
    const bis = sauber(form.get('bis'), 10);
    const cupId = sauber(form.get('cupId'), 120);
    const event: GalerieEvent = {
      id: neueId(), name, ort: sauber(form.get('ort'), 80), datum,
      bis: /^\d{4}-\d{2}-\d{2}$/.test(bis) && bis > datum ? bis : undefined,
      cupId: cupId || undefined,
      beschreibung: sauber(form.get('beschreibung'), 600) || undefined, erstellt: Date.now(),
    };
    g.events.push(event);
    await schreibGalerie(g);
    return NextResponse.json({ success: true, event });
  }

  // Ohne Event ist es das allgemeine Archiv - dann muss ein Spieler dran.
  const eventId = sauber(form.get('eventId'), 40);
  if (eventId && !g.events.some((e) => e.id === eventId)) return NextResponse.json({ error: 'Event unbekannt' }, { status: 400 });
  const spieler = ids(form.get('spieler'));
  if (!eventId && !spieler.length) return NextResponse.json({ error: 'Ohne Event braucht ein Bild einen Spieler.' }, { status: 400 });

  if (aktion === 'video') {
    const url = sauber(form.get('url'), 400);
    if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: 'Adresse fehlt' }, { status: 400 });
    const eintrag: GalerieEintrag = {
      id: neueId(), eventId, art: 'video', url, titel: sauber(form.get('titel'), 120) || undefined,
      spieler, erstellt: Date.now(),
    };
    g.eintraege.push(eintrag);
    await schreibGalerie(g);
    return NextResponse.json({ success: true, eintrag });
  }

  if (aktion === 'bild') {
    const dateien = form.getAll('dateien').filter((d): d is File => d instanceof File);
    if (!dateien.length) return NextResponse.json({ error: 'keine Datei' }, { status: 400 });
    const neu: GalerieEintrag[] = [];
    const fehler: string[] = [];
    for (const d of dateien) {
      const ext = ERLAUBT[d.type];
      if (!ext) { fehler.push(`${d.name}: kein Bild (${d.type || 'unbekannt'})`); continue; }
      if (d.size > MAX_BYTES) { fehler.push(`${d.name}: groesser als 20 MB`); continue; }
      const id = neueId();
      const datei = `${id}.${ext}`;
      try {
        await schreibBild(datei, Buffer.from(await d.arrayBuffer()));
      } catch (e) {
        fehler.push(`${d.name}: nicht abgelegt (${(e as Error).message.slice(0, 80)})`);
        continue;
      }
      neu.push({
        id, eventId, art: 'bild', datei, typ: d.type, bytes: d.size,
        titel: sauber(form.get('titel'), 120) || undefined, spieler, erstellt: Date.now(),
      });
    }
    if (neu.length) { g.eintraege.push(...neu); await schreibGalerie(g); }
    return NextResponse.json({ success: neu.length > 0, eintraege: neu, fehler }, { status: neu.length ? 200 : 400 });
  }

  return NextResponse.json({ error: 'aktion unbekannt' }, { status: 400 });
}

export async function PATCH(request: Request) {
  if (!(await istAdminAnfrage(request))) return NextResponse.json({ error: 'nur Admin' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const g = await liesGalerie();
  if (typeof body.eventId === 'string' && !body.id) {
    const ev = g.events.find((e) => e.id === body.eventId);
    if (!ev) return NextResponse.json({ error: 'Event unbekannt' }, { status: 404 });
    if (body.name !== undefined) ev.name = sauber(body.name, 80) || ev.name;
    if (body.ort !== undefined) ev.ort = sauber(body.ort, 80);
    if (body.datum !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(body.datum))) ev.datum = String(body.datum);
    if (body.bis !== undefined) {
      const bis = sauber(body.bis, 10);
      ev.bis = /^\d{4}-\d{2}-\d{2}$/.test(bis) && bis > ev.datum ? bis : undefined;
    }
    if (body.cupId !== undefined) ev.cupId = sauber(body.cupId, 120) || undefined;
    if (body.beschreibung !== undefined) ev.beschreibung = sauber(body.beschreibung, 600) || undefined;
    await schreibGalerie(g);
    return NextResponse.json({ success: true, event: ev });
  }
  const eintrag = g.eintraege.find((e) => e.id === body.id);
  if (!eintrag) return NextResponse.json({ error: 'Eintrag unbekannt' }, { status: 404 });
  if (body.titel !== undefined) eintrag.titel = sauber(body.titel, 120) || undefined;
  if (Array.isArray(body.spieler)) eintrag.spieler = ids(body.spieler.join(','));
  if (typeof body.eventId === 'string' && (body.eventId === '' || g.events.some((e) => e.id === body.eventId))) eintrag.eventId = body.eventId;
  await schreibGalerie(g);
  return NextResponse.json({ success: true, eintrag });
}

export async function DELETE(request: Request) {
  if (!(await istAdminAnfrage(request))) return NextResponse.json({ error: 'nur Admin' }, { status: 403 });
  const p = new URL(request.url).searchParams;
  const g: Galerie = await liesGalerie();
  const id = p.get('id');
  const eventId = p.get('event');
  if (id) {
    const e = g.eintraege.find((x) => x.id === id);
    if (!e) return NextResponse.json({ error: 'Eintrag unbekannt' }, { status: 404 });
    if (e.datei) await loescheBild(e.datei);
    g.eintraege = g.eintraege.filter((x) => x.id !== id);
  } else if (eventId) {
    // Ein Event geht nur weg, wenn nichts mehr darin liegt - sonst waeren
    // die Bilder mit einem Klick verschwunden.
    if (g.eintraege.some((x) => x.eventId === eventId)) {
      return NextResponse.json({ error: 'Erst die Bilder und Videos entfernen.' }, { status: 400 });
    }
    g.events = g.events.filter((x) => x.id !== eventId);
  } else {
    return NextResponse.json({ error: 'id oder event fehlt' }, { status: 400 });
  }
  await schreibGalerie(g);
  return NextResponse.json({ success: true });
}
