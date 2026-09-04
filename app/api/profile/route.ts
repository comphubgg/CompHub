import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATEN_ORT } from '@/lib/datenOrt';

const PROFILE_FILE = path.join(DATEN_ORT, 'streamer-profiles.json');
const VIP_USERS_FILE = path.join(DATEN_ORT, 'vip-users.json');
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || 'streamer-dashboard-secret';

type ProfileData = {
  displayName: string;
  avatarUrl: string | null;
  twitchChatEnabled: boolean;
  /**
   * Nur noch der Twitch-Kanal.
   *
   * YouTube, Twitter, Instagram und TikTok wurden entfernt: im Dashboard soll
   * niemand seine Konten ausstellen. Der Kanal bleibt allein deshalb, weil der
   * Chat eine Adresse braucht. Aeltere Dateien tragen die weggefallenen Listen
   * noch; beim naechsten Speichern verschwinden sie von selbst.
   */
  socials: { twitch: string };
};

type ProfileResponse = {
  profile: ProfileData;
  accountStatus: string;
  accessKey: string | null;
};

type ProfilesFile = Record<string, ProfileData>;

type VipUser = { username: string; accessKey: string; status: string; createdAt: string };

type VipFile = { users: VipUser[] };

function signValue(value: string) {
  return crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(value).digest('hex');
}

function verifyCookie(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  const parts = cookieValue.split(':');
  if (parts.length !== 3) return null;
  const [login, timestamp, signature] = parts;
  const payload = `${login}:${timestamp}`;
  if (signValue(payload) !== signature) return null;
  const createdAt = Number(timestamp);
  if (Number.isNaN(createdAt)) return null;
  if (Date.now() - createdAt > 30 * 24 * 3600 * 1000) return null;
  return login;
}

async function ensureDataDir() {
  const dir = path.dirname(PROFILE_FILE);
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

async function writeJsonFile<T>(filePath: string, data: T) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getCurrentUser(request: NextRequest) {
  const cookieValue = request.cookies.get('streamer_dashboard_auth')?.value;
  return verifyCookie(cookieValue);
}

async function getVipMapping(): Promise<Record<string, boolean>> {
  const vipFile = await readJsonFile<VipFile>(VIP_USERS_FILE);
  if (!vipFile?.users) return {};
  return vipFile.users.reduce<Record<string, boolean>>((acc, user) => {
    if (user.status === 'active') acc[user.username.toLowerCase()] = true;
    return acc;
  }, {});
}

async function getVipAccessKey(username: string): Promise<string | null> {
  const vipFile = await readJsonFile<VipFile>(VIP_USERS_FILE);
  if (!vipFile?.users) return null;
  const user = vipFile.users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
  return user?.accessKey || null;
}

function buildDefaultProfile(username: string): ProfileData {
  return {
    displayName: username,
    avatarUrl: null,
    twitchChatEnabled: true,
    socials: { twitch: '' },
  };
}

export async function GET(request: NextRequest) {
  const username = getCurrentUser(request);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profiles = (await readJsonFile<ProfilesFile>(PROFILE_FILE)) || {};
  const profile = profiles[username] || buildDefaultProfile(username);
  const vipMap = await getVipMapping();
  const accessKey = await getVipAccessKey(username);
  return NextResponse.json({ profile, accountStatus: vipMap[username] ? 'VIP User' : 'Normal User', accessKey });
}

export async function POST(request: NextRequest) {
  const username = getCurrentUser(request);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const profile = body.profile as Partial<ProfileData> | undefined;

    if (!profile || typeof profile.displayName !== 'string') {
      return NextResponse.json({ error: 'Invalid profile payload' }, { status: 400 });
    }

    const existingProfiles = (await readJsonFile<ProfilesFile>(PROFILE_FILE)) || {};
    const savedProfile: ProfileData = {
      displayName: profile.displayName.trim() || username,
      avatarUrl: profile.avatarUrl ? String(profile.avatarUrl).trim() : null,
      twitchChatEnabled: Boolean(profile.twitchChatEnabled),
      socials: { twitch: String(profile.socials?.twitch || '').trim() },
    };

    existingProfiles[username] = savedProfile;
    await writeJsonFile(PROFILE_FILE, existingProfiles);

    return NextResponse.json({ success: true, profile: savedProfile });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
