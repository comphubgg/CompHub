import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ueberHttps } from '@/lib/vipCookie';
import { DATEN_ORT } from '@/lib/datenOrt';

const VIP_USERS_FILE = path.join(DATEN_ORT, 'vip-users.json');
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || 'streamer-dashboard-secret';

async function readVipUsers() {
  const content = await fs.readFile(VIP_USERS_FILE, 'utf-8');
  return JSON.parse(content);
}

function signValue(value: string) {
  return crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(value).digest('hex');
}

function makeSessionCookieValue(username: string) {
  const normalizedLogin = username.trim().toLowerCase();
  const timestamp = String(Date.now());
  const signature = signValue(`${normalizedLogin}:${timestamp}`);
  return `${normalizedLogin}:${timestamp}:${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const { username, accessKey } = await request.json();

    if (!username || !accessKey) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const data = await readVipUsers();
    const normalizedUsername = String(username).trim().toLowerCase();
    const user = data.users.find((u: any) => u.username.toLowerCase() === normalizedUsername);

    if (!user || user.accessKey !== accessKey || user.status !== 'active') {
      return NextResponse.json({ error: 'Invalid username or access key' }, { status: 401 });
    }

    const cookieValue = makeSessionCookieValue(user.username);
    const response = NextResponse.json({ success: true, user: user.username });
    /*
     * "secure" nur ueber HTTPS - nicht am Betriebsmodus festgemacht.
     * Sonst faellt die Anmeldung weg, sobald jemand ueber die LAN-Adresse
     * oder aus dem Fensterprogramm kommt.
     */
    const isProduction = ueberHttps(request);
    response.cookies.set('streamer_dashboard_auth', cookieValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set('streamer_dashboard_user_login', user.username, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
