import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { t } from "@/app/lib/i18n";
import { DATEN_ORT } from '@/lib/datenOrt';

const STREAMERS_FILE = path.join(DATEN_ORT, 'streamers.json');

interface StreamerData {
  twitch: string;
  twitter: string;
}

interface StreamersData {
  streamers: {
    EU: StreamerData[];
    NA: StreamerData[];
  };
}

// Stelle sicher, dass das Verzeichnis existiert
async function ensureDataDir() {
  const dir = path.dirname(STREAMERS_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Lese die Streamer-Datei
async function getStreamersData(): Promise<StreamersData> {
  try {
    await ensureDataDir();
    const content = await fs.readFile(STREAMERS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Datei existiert nicht, return empty data
    return {
      streamers: {
        EU: [],
        NA: []
      }
    };
  }
}

async function saveStreamersData(data: StreamersData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STREAMERS_FILE, JSON.stringify(data, null, 2));
}

// GET: Hole alle Streamer
export async function GET() {
  try {
    const data = await getStreamersData();
    return NextResponse.json(data);
  } catch (error) {
    console.error(t('error_reading_streamers', 'Error reading streamers:'), error);
    return NextResponse.json({ error: t('failed_to_read_streamers', 'Failed to read streamers') }, { status: 500 });
  }
}

// POST: Füge einen Streamer hinzu
export async function POST(request: NextRequest) {
  try {
    const { twitch, twitter, region } = await request.json();

    if (!twitch || !region || (region !== 'EU' && region !== 'NA')) {
      return NextResponse.json({ error: t('twitch_twitter_and_region_required', 'Twitch, Twitter and region required') }, { status: 400 });
    }

    const data = await getStreamersData();
    const regionList = data.streamers[region as 'EU' | 'NA'];

    // Check if streamer already exists
    if (regionList.some(s => s.twitch.toLowerCase() === twitch.toLowerCase())) {
      return NextResponse.json({ error: t('streamer_already_exists', 'Streamer already exists') }, { status: 400 });
    }

    regionList.push({
      twitch: twitch.toLowerCase(),
      twitter: twitter || twitch
    });

    await saveStreamersData(data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(t('error_adding_streamer', 'Error adding streamer:'), error);
    return NextResponse.json({ error: t('failed_to_add_streamer', 'Failed to add streamer') }, { status: 500 });
  }
}

// DELETE: Entferne einen Streamer
export async function DELETE(request: NextRequest) {
  try {
    const { twitch, region } = await request.json();

    if (!twitch || !region) {
      return NextResponse.json({ error: t('twitch_and_region_required', 'Twitch and region required') }, { status: 400 });
    }

    const data = await getStreamersData();
    const regionList = data.streamers[region as 'EU' | 'NA'];

    const initialLength = regionList.length;
    data.streamers[region as 'EU' | 'NA'] = regionList.filter(s => 
      s.twitch.toLowerCase() !== twitch.toLowerCase()
    );

    if (data.streamers[region as 'EU' | 'NA'].length === initialLength) {
      return NextResponse.json({ error: t('streamer_not_found', 'Streamer not found') }, { status: 404 });
    }

    await saveStreamersData(data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(t('error_deleting_streamer', 'Error deleting streamer:'), error);
    return NextResponse.json({ error: t('failed_to_delete_streamer', 'Failed to delete streamer') }, { status: 500 });
  }
}

// PUT: Aktualisiere einen Streamer
export async function PUT(request: NextRequest) {
  try {
    const { twitch, twitter, region } = await request.json();

    if (!twitch || !region) {
      return NextResponse.json({ error: t('twitch_and_region_required', 'Twitch and region required') }, { status: 400 });
    }

    const data = await getStreamersData();
    const regionList = data.streamers[region as 'EU' | 'NA'];

    const streamer = regionList.find(s => s.twitch.toLowerCase() === twitch.toLowerCase());
    if (!streamer) {
      return NextResponse.json({ error: t('streamer_not_found', 'Streamer not found') }, { status: 404 });
    }

    streamer.twitter = twitter || streamer.twitter;

    await saveStreamersData(data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(t('error_updating_streamer', 'Error updating streamer:'), error);
    return NextResponse.json({ error: t('failed_to_update_streamer', 'Failed to update streamer') }, { status: 500 });
  }
}
