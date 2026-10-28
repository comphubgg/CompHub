import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import { kontoAus } from '@/lib/konten';

const STORAGE_DIR = path.join(DATEN_ORT, 'user-storage');

function parseCookies(cookieHeader?: string | null) {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.split('=');
    if (!k) continue;
    result[k.trim()] = decodeURIComponent((rest || []).join('=').trim() || '');
  }
  return result;
}

/**
 * Wessen Ablage das ist: der alte VIP-Zugang (Cookie streamer_dashboard_user_login), sonst das CompHub-Konto, sonst "guest" (Betreiber, 19.10.2026: die
 * Tierlist und die eigenen Ordner gingen bei Konten ins Leere). Der Wert kommt aus einem Cookie und wird zum Dateinamen - deshalb nur harmlose Zeichen,
 * sonst liesse sich mit "../" eine fremde Datei beschreiben.
 */
function loginVon(request: NextRequest): string {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const alt = (cookies['streamer_dashboard_user_login'] || '').trim();
  if (alt) return alt.toLowerCase().replace(/[^a-z0-9_.@-]/g, '_').replace(/^\.+/, '_').slice(0, 80) || 'guest';
  const konto = kontoAus(cookies['streamer_dashboard_konto']);
  return konto ? `konto-${konto.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)}` : 'guest';
}

async function readUserFile(login: string) {
  const file = path.join(STORAGE_DIR, `${login}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function writeUserFile(login: string, data: Record<string, unknown>) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const file = path.join(STORAGE_DIR, `${login}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  try {
    const login = loginVon(request);

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    const userData = await readUserFile(login.toLowerCase());
    if (!key) {
      return NextResponse.json({ data: userData });
    }

    return NextResponse.json({ value: userData[key] ?? null });
  } catch (err: any) {
    console.error('user-storage GET error', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 424 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const login = loginVon(request);

    const body = await request.json();
    const key = body?.key;
    const value = body?.value;
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    const userData = await readUserFile(login.toLowerCase());
    userData[key] = value;
    await writeUserFile(login.toLowerCase(), userData);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('user-storage POST error', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 424 });
  }
}
