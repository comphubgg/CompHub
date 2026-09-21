import { NextRequest, NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { t } from '@/app/lib/i18n';
import { DATEN_ORT } from '@/lib/datenOrt';

const DASHBOARD_FILE = path.join(DATEN_ORT, 'dashboard.json');
const STREAMERS_FILE = path.join(DATEN_ORT, 'streamers.json');

type StreamerData = {
  twitch: string;
  twitter: string;
};

type FolderData = {
  id: string;
  name: string;
  streamers: StreamerData[];
};

type DashboardData = {
  folders: FolderData[];
};

async function ensureDataDir() {
  const dir = path.dirname(DASHBOARD_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function getFallbackDashboard(): Promise<DashboardData> {
  return {
    folders: [
      { id: 'fortnite-eu', name: 'Fortnite Pros EU', streamers: [] },
      { id: 'fortnite-na', name: 'Fortnite Pros NA', streamers: [] },
      { id: 'streamer', name: 'Streamer', streamers: [] }
    ]
  };
}

/*
 * Die Ordner sind die Wahrheit, streamers.json wird daraus abgeleitet.
 *
 * Zwei Dateien fuehren dieselben Streamer: dashboard.json (die Ordner, die
 * die Seite zeigt und beim Speichern schreibt) und streamers.json (die
 * Listen je Region, die Skripte lesen). Am 21.9.2026 stand hier kurz das
 * Umgekehrte - fehlende Eintraege der Listen wurden beim Lesen in die
 * Ordner gemischt. Folge: was der Betreiber im Dashboard loeschte, stand
 * nach dem Neuladen wieder da, weil es in der Liste noch lag. Der
 * Betreiber: "Ich habe jetzt ein paar Streamer rausgeloescht, die sollten
 * dann fuer jeden geloescht sein." Jetzt gilt nur noch eine Richtung: beim
 * Speichern der Ordner werden die Listen daraus neu geschrieben.
 */
const ORDNER_JE_LISTE: Record<string, string> = { EU: 'fortnite-eu', NA: 'fortnite-na', streamer: 'streamer' };

async function listenAusOrdnern(dashboard: DashboardData): Promise<void> {
  const alt = (await readJsonFile<{ streamers?: Record<string, StreamerData[]> }>(STREAMERS_FILE))?.streamers ?? {};
  const neu: Record<string, StreamerData[]> = { ...alt };
  for (const [liste, ordnerId] of Object.entries(ORDNER_JE_LISTE)) {
    const ordner = dashboard.folders.find((f) => f.id === ordnerId);
    if (!ordner) continue;
    neu[liste] = ordner.streamers.map((s) => ({ twitch: s.twitch, twitter: s.twitter }));
  }
  await fs.writeFile(STREAMERS_FILE, JSON.stringify({ streamers: neu }, null, 2));
}

async function getDashboardData(): Promise<DashboardData> {
  await ensureDataDir();
  const dashboardJson = await readJsonFile<DashboardData>(DASHBOARD_FILE);
  if (dashboardJson && Array.isArray(dashboardJson.folders)) {
    return dashboardJson;
  }
  return await getFallbackDashboard();
}

async function saveDashboardData(data: DashboardData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DASHBOARD_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    console.error(t('error_reading_dashboard', 'Error reading dashboard:'), error);
    return NextResponse.json({ error: t('failed_to_read_dashboard', 'Failed to read dashboard') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !Array.isArray(body.folders)) {
      return NextResponse.json({ error: t('invalid_dashboard_payload', 'Invalid dashboard payload') }, { status: 400 });
    }

    const sanitizedFolders = body.folders.map((folder: any) => ({
      id: String(folder.id || '').trim(),
      name: String(folder.name || 'Untitled folder').trim(),
      streamers: Array.isArray(folder.streamers)
        ? folder.streamers.map((streamer: any) => ({
            twitch: String(streamer.twitch || '').trim().toLowerCase(),
            twitter: String(streamer.twitter || '').trim() || String(streamer.twitch || '').trim().toLowerCase(),
          }))
        : [],
    }));

    const dashboard: DashboardData = { folders: sanitizedFolders };
    await saveDashboardData(dashboard);
    // Die Listen je Region folgen den Ordnern - ein Fehler dort haelt das Speichern nicht auf.
    try { await listenAusOrdnern(dashboard); } catch (e) { console.error('streamers.json nicht nachgezogen:', e); }
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    console.error(t('error_saving_dashboard', 'Error saving dashboard:'), error);
    return NextResponse.json({ error: t('failed_to_save_dashboard', 'Failed to save dashboard') }, { status: 500 });
  }
}
