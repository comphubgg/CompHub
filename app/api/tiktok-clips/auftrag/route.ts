import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { liesJson, schreibJson } from '@/lib/ablage';
import type { ClipStreamer } from '@/lib/tiktokClips';

/*
 * Der Auftrag fuer den taeglichen Schnitt (.github/workflows/tiktok-clips.yml, lib/tiktokClips): je verbundenem Streamer die besten Clips der letzten
 * 24 Stunden mit frischer Download-Adresse (Twitch "Get Clips Download", Token des Kanals). ?ohne=<id,id> laesst schon geschnittene weg.
 * Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const DATEI = 'tiktok-clips/streamer.json';
/** Hoechstens so viele Clips je Streamer und Tag - TikTok will Qualitaet, nicht Menge. */
const JE_TAG = 3;

async function frischesToken(s: ClipStreamer, id: string, secret: string): Promise<ClipStreamer | null> {
  if (s.bis > Date.now() + 5 * 60_000) return s;
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: id, client_secret: secret }),
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  return { ...s, access: j.access_token, refresh: j.refresh_token ?? s.refresh, bis: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  const ohne = new Set((new URL(request.url).searchParams.get('ohne') ?? '').split(',').filter(Boolean));
  const { id, secret } = await holeDienst('twitch');
  const ablage = await liesJson<{ streamer: Record<string, ClipStreamer>; einladungen: Record<string, unknown> }>(DATEI, { streamer: {}, einladungen: {} });
  const raus: Array<{ login: string; name: string; facecam: string; clips: Array<{ id: string; titel: string; aufrufe: number; dauer: number; erstellt: string; url: string }>; fehler?: string }> = [];
  let geaendert = false;
  const seit = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const [login, alt] of Object.entries(ablage.streamer)) {
    const s = await frischesToken(alt, id, secret);
    if (!s) { raus.push({ login, name: alt.name, facecam: alt.facecam, clips: [], fehler: 'Twitch-Zugang abgelaufen - Streamer muss neu verbinden' }); continue; }
    if (s !== alt) { ablage.streamer[login] = s; geaendert = true; }
    const kopf = { 'Client-Id': id, Authorization: `Bearer ${s.access}` };
    const liste = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${s.id}&started_at=${encodeURIComponent(seit)}&first=20`, { headers: kopf, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { data?: Array<{ id: string; title: string; view_count: number; duration: number; created_at: string }> } | null;
    const beste = (liste?.data ?? []).filter((c) => !ohne.has(c.id) && c.duration >= 8).sort((a, b) => b.view_count - a.view_count).slice(0, JE_TAG);
    const clips: (typeof raus)[number]['clips'] = [];
    if (beste.length) {
      const q = beste.map((c) => `clip_id=${encodeURIComponent(c.id)}`).join('&');
      const dl = await fetch(`https://api.twitch.tv/helix/clips/downloads?broadcaster_id=${s.id}&editor_id=${s.id}&${q}`, { headers: kopf, cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { data?: Array<{ clip_id: string; landscape_download_url: string | null }> } | null;
      for (const c of beste) {
        const url = dl?.data?.find((d) => d.clip_id === c.id)?.landscape_download_url;
        if (url) clips.push({ id: c.id, titel: c.title, aufrufe: c.view_count, dauer: c.duration, erstellt: c.created_at, url });
      }
    }
    raus.push({ login, name: s.name, facecam: s.facecam, clips });
  }
  if (geaendert) await schreibJson(DATEI, ablage);
  return NextResponse.json({ ok: true, streamer: raus }, { headers: { 'Cache-Control': 'no-store' } });
}
