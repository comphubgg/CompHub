import crypto from "crypto";
import { NextRequest } from "next/server";
import { t } from "@/app/lib/i18n";
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "";
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || TWITCH_CLIENT_SECRET || "streamer-dashboard-secret";

export const SESSION_COOKIE_NAME = "streamer_dashboard_auth";
export const OAUTH_STATE_COOKIE = "twitch_oauth_state";

export function getRedirectUri(req: NextRequest) {
  return rueckwegVon(req, '/api/auth/twitch/callback');
}

export function signPayload(payload: string) {
  return crypto.createHmac("sha256", AUTH_COOKIE_SECRET).update(payload).digest("hex");
}

export function makeSessionValue(username: string) {
  const normalizedLogin = username.trim().toLowerCase();
  const timestamp = String(Date.now());
  const signature = signPayload(`${normalizedLogin}:${timestamp}`);
  return `${normalizedLogin}:${timestamp}:${signature}`;
}

export function verifySessionValue(cookieValue: string | undefined) {
  if (!cookieValue) return null;

  const parts = cookieValue.split(":");
  if (parts.length !== 3) return null;

  const [login, timestamp, signature] = parts;
  const payload = `${login}:${timestamp}`;
  if (signPayload(payload) !== signature) return null;

  const createdAt = Number(timestamp);
  if (Number.isNaN(createdAt)) return null;
  if (Date.now() - createdAt > 30 * 24 * 3600 * 1000) return null;

  return login;
}

export function isTwitchAuthConfigured() {
  return Boolean(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET);
}

export function getAllowedTwitchUsers() {
  return [];
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
  tokenUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
  tokenUrl.searchParams.set("client_secret", TWITCH_CLIENT_SECRET);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("redirect_uri", redirectUri);

  const response = await fetch(tokenUrl.toString(), { method: "POST" });
  if (!response.ok) {
    throw new Error(t('twitch_token_exchange_failed', 'Twitch token exchange failed'));
  }

  return response.json();
}

export async function fetchTwitchUser(accessToken: string) {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Client-ID": TWITCH_CLIENT_ID,
    },
  });

  if (!response.ok) {
    throw new Error(t('twitch_user_info_request_failed', 'Twitch user info request failed'));
  }

  const data = await response.json();
  return data.data?.[0] ?? null;
}
