import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { DATEN_ORT } from '@/lib/datenOrt';

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
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const login = (cookies['streamer_dashboard_user_login'] || 'guest').trim() || 'guest';

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    const userData = await readUserFile(login.toLowerCase());
    if (!key) {
      return NextResponse.json({ data: userData });
    }

    return NextResponse.json({ value: userData[key] ?? null });
  } catch (err: any) {
    console.error('user-storage GET error', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const login = (cookies['streamer_dashboard_user_login'] || 'guest').trim() || 'guest';

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
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
