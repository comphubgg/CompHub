import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { zugangNach, rechteVon } from "@/lib/vipZugaenge";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || "streamer-dashboard-secret";

function signValue(value: string) {
  return crypto.createHmac("sha256", AUTH_COOKIE_SECRET).update(value).digest("hex");
}

function verifyCookie(cookieValue: string | undefined) {
  if (!cookieValue) return null;

  const parts = cookieValue.split(":");
  if (parts.length !== 3) return null;

  const [login, timestamp, signature] = parts;
  const payload = `${login}:${timestamp}`;
  if (signValue(payload) !== signature) return null;

  const createdAt = Number(timestamp);
  if (Number.isNaN(createdAt)) return null;
  if (Date.now() - createdAt > 30 * 24 * 3600 * 1000) return null;

  return login;
}

export async function GET(req: NextRequest) {
  const cookieValue = req.cookies.get("streamer_dashboard_auth")?.value;
  const login = verifyCookie(cookieValue);

  if (!login) {
    return NextResponse.json({ authorized: false });
  }

  /*
   * Was dieser Zugang darf, steht in der Zugangsdatei.
   *
   * Bisher kam von hier nur "ja, angemeldet, und so heisst er". Die Rolle,
   * die der Betreiber dem Zugang gegeben hatte - Admin, Manager mit
   * Bereichen, Pro -, wurde zwar gespeichert, aber nie gelesen: der Zugang
   * war immer nur VIP. Und eine Stilllegung wirkte erst, wenn das Cookie
   * von selbst ablief, also bis zu dreissig Tage spaeter.
   *
   * Der Betreiber selbst ("admin-juanito") kommt nicht aus dieser Datei -
   * er bleibt Admin, auch wenn dort nichts zu ihm steht.
   */
  const betreiber = login.trim().toLowerCase() === 'admin-juanito';
  const eintrag = await zugangNach(login);
  const darf = rechteVon(eintrag);

  /*
   * Kein Eintrag mehr, oder stillgelegt: dann gilt das Cookie nicht.
   *
   * Ein Zugang, den der Betreiber geloescht hat, war sonst bis zu dreissig
   * Tage weiter angemeldet - so lange gilt das Cookie. Loeschen muss aber
   * heissen, dass jemand draussen ist, sonst ist es kein Loeschen.
   *
   * Der Betreiber selbst ist ausgenommen: seine Kennung haengt nicht an
   * dieser Datei, und er soll sich nicht versehentlich selbst aussperren
   * koennen.
   */
  if (!betreiber && (!eintrag || !darf.gueltig)) {
    return NextResponse.json({
      authorized: false,
      grund: eintrag ? 'stillgelegt' : 'entfernt',
    });
  }

  return NextResponse.json({
    authorized: true,
    user: login,
    rolle: betreiber ? 'admin' : darf.rolle,
    rechte: betreiber ? [] : darf.rechte,
    vip: betreiber ? true : darf.vip,
    epicId: darf.epicId,
  });
}
