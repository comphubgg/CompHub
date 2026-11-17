import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { liesJson } from '@/lib/ablage';
import { ANZEIGENAMEN_DATEI, anzeigenameSetzen } from '@/lib/anzeigenamen';

/*
 * Die gelaeufigen Namen der Profis bearbeiten (lib/anzeigenamen, /admin/fotos-pool, Abschnitt "Anzeigenamen").
 *
 *   GET                         -> { eintraege: [{ epicId, epic, anzeige }] } - alle Spieler mit oeffentlichem Foto und alle mit Eintrag
 *   POST { epicId, name }       -> setzen; leerer Name entfernt den Eintrag (dann gilt wieder der Epic-Name)
 */

export const dynamic = 'force-dynamic';

const privat = { 'Cache-Control': 'private, no-store' };
const antwort = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: privat });
const nein = () => antwort({ ok: false, error: 'Nur für Admins – bitte (neu) anmelden.', anmelden: true }, 403);

export async function GET() {
  if (!await istAdminAnfrage()) return nein();
  const [tafel, bilder] = await Promise.all([
    liesJson<Record<string, string>>(ANZEIGENAMEN_DATEI, {}),
    liesJson<Array<{ epicId?: string; name?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []),
  ]);
  const epic = new Map<string, string>();
  const mitFoto = new Set<string>();
  for (const e of Array.isArray(bilder) ? bilder : []) {
    const id = String(e?.epicId ?? '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    if (e.name && !epic.has(id)) epic.set(id, e.name);
    if (e.datei && e.echtesFoto) mitFoto.add(id);
  }
  const ids = new Set([...mitFoto, ...Object.keys(tafel ?? {}).map((x) => x.toLowerCase())]);
  const eintraege = [...ids].map((id) => ({ epicId: id, epic: epic.get(id) ?? '', anzeige: tafel?.[id] ?? '', foto: mitFoto.has(id) }))
    .sort((a, b) => (a.anzeige || a.epic).localeCompare(b.anzeige || b.epic, 'en', { sensitivity: 'base' }));
  return antwort({ ok: true, eintraege });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  let k: { epicId?: unknown; name?: unknown };
  try { k = await request.json(); } catch { return antwort({ ok: false, error: 'Kein JSON.' }, 400); }
  const id = String(k.epicId ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return antwort({ ok: false, error: 'Keine gültige Konto-Id.' }, 400);
  try {
    const tafel = await anzeigenameSetzen(id, String(k.name ?? ''));
    return antwort({ ok: true, epicId: id, anzeige: tafel[id] ?? '' });
  } catch (f) {
    return antwort({ ok: false, error: `Nicht gespeichert: ${String((f as Error)?.message ?? f).slice(0, 200)}` }, 503);
  }
}
