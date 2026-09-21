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
 * Zwei Dateien fuehren dieselben Streamer: dashboard.json (die Ordner, die
 * die Seite zeigt) und streamers.json (die Listen je Region, die die Seite
 * beim Anlegen und Loeschen mitschreibt). Wer streamers.json direkt
 * ergaenzt - so kamen die fuenfzig EU-Pros des Betreibers hinein -, sah in
 * den Ordnern nichts davon: "wieso hat es immer noch nur 54". Deshalb
 * gehen fehlende Eintraege der Listen hier in ihren Ordner, hinten dran.
 */
const ORDNER_JE_LISTE: Record<string, string> = { EU: 'fortnite-eu', NA: 'fortnite-na', streamer: 'streamer' };

function mitListen(dashboard: DashboardData, listen: Record<string, StreamerData[]> | undefined): DashboardData {
  if (!listen) return dashboard;
  for (const [liste, ordnerId] of Object.entries(ORDNER_JE_LISTE)) {
    const ordner = dashboard.folders.find((f) => f.id === ordnerId);
    if (!ordner || !Array.isArray(listen[liste])) continue;
    const da = new Set(ordner.streamers.map((s) => s.twitch.trim().toLowerCase()));
    for (const s of listen[liste]) {
      const twitch = String(s.twitch || '').trim().toLowerCase();
      if (!twitch || da.has(twitch)) continue;
      ordner.streamers.push({ twitch, twitter: String(s.twitter || '').trim() || twitch });
      da.add(twitch);
    }
  }
  return dashboard;
}

async function getDashboardData(): Promise<DashboardData> {
  await ensureDataDir();
  const dashboardJson = await readJsonFile<DashboardData>(DASHBOARD_FILE);
  const listen = await readJsonFile<{ streamers?: Record<string, StreamerData[]> }>(STREAMERS_FILE);
  if (dashboardJson && Array.isArray(dashboardJson.folders)) {
    return mitListen(dashboardJson, listen?.streamers);
  }
  return mitListen(await getFallbackDashboard(), listen?.streamers);
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
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    console.error(t('error_saving_dashboard', 'Error saving dashboard:'), error);
    return NextResponse.json({ error: t('failed_to_save_dashboard', 'Failed to save dashboard') }, { status: 500 });
  }
}
