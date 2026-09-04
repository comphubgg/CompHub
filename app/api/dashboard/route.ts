import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
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
    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    console.error(t('error_saving_dashboard', 'Error saving dashboard:'), error);
    return NextResponse.json({ error: t('failed_to_save_dashboard', 'Failed to save dashboard') }, { status: 500 });
  }
}
