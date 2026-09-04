import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { t } from "@/app/lib/i18n";
import { holeDienst } from '@/lib/dienstZugaenge';

// Client-Id kommt zur Laufzeit aus der Ablage (oder der Umgebung).
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "";

function getRedirectUri(req: NextRequest) {
  if (BASE_URL) {
    // Ohne den Schraegstrich am Ende: steht in .env.local
    // "http://localhost:3000/", entstuende sonst "localhost:3000//api/…"
    // - und das stimmt mit keiner bei Twitch hinterlegten Adresse
    // ueberein. Der Fehler faellt erst auf, wenn alles andere passt.
    return `${BASE_URL.replace(/\/+$/, "")}/api/auth/twitch/callback`;
  }
  return `${req.nextUrl.origin}/api/auth/twitch/callback`;
}

export async function GET(req: NextRequest) {
  const { id: TWITCH_CLIENT_ID } = await holeDienst('twitch');
  if (!TWITCH_CLIENT_ID) {
    return new NextResponse(t('twitch_oauth_ist_nicht_konfiguriert', 'Twitch OAuth ist nicht konfiguriert.'), { status: 500 });
  }

  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "user:read:email",
    state,
    force_verify: "true",
  });

  const twitchUrl = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  const response = NextResponse.redirect(twitchUrl);
  response.cookies.set("twitch_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });

  return response;
}
