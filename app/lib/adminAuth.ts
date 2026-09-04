import crypto from 'crypto';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || 'streamer-dashboard-secret';

function signValue(value: string) {
  return crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(value).digest('hex');
}

export function verifyAuthCookie(cookieValue: string | undefined) {
  if (!cookieValue) return null;

  const parts = cookieValue.split(':');
  if (parts.length !== 3) return null;

  const [login, timestamp, signature] = parts;
  const payload = `${login}:${timestamp}`;
  if (signValue(payload) !== signature) return null;

  const createdAt = Number(timestamp);
  if (Number.isNaN(createdAt)) return null;
  if (Date.now() - createdAt > 30 * 24 * 3600 * 1000) return null;

  return login.trim().toLowerCase();
}

export function isAdminUsername(login: string | null | undefined) {
  return typeof login === 'string' && login.trim().toLowerCase() === 'admin-juanito';
}

export function getLoginFromRequest(request: NextRequest) {
  const cookieValue = request.cookies.get('streamer_dashboard_auth')?.value;
  return verifyAuthCookie(cookieValue);
}

export function requireAdmin(request: NextRequest) {
  const login = getLoginFromRequest(request);
  if (!login || !isAdminUsername(login)) {
    throw new Error('Unauthorized');
  }
  return login;
}
