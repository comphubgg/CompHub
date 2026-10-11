import { mitgliederSuchen } from '@/lib/discord';
import { mitgliedPerName, stimmeSuchen } from '@/lib/discordGilden';
import { nachId } from '@/lib/konten';
import { zugangNach } from '@/lib/vipZugaenge';

/*
 * Wer von den Profis gerade in einem Discord-Sprachkanal ist - und seinen Bildschirm uebertraegt.
 *
 * Der Betreiber (11.10.2026): Profis gehen auch ueber Discord live (Sprachkanal, "Live gehen"). Dieses Bild
 * laesst sich nicht auf die Webseite holen - Discord gibt Bots kein Video. Aber der Bot kann sehen, WER in
 * welchem Sprachkanal sitzt und ob er streamt (Abfrage "Voice State" eines Mitglieds). Die Streams-Seite
 * zeigt freigegebenen Zuschauern deshalb "Live auf Discord" mit einem Knopf, der den Kanal in Discord oeffnet.
 *
 * Damit der Bot weiss, WELCHES Mitglied welcher Profi ist, weist der Profi in seinen Einstellungen sein
 * Discord-Konto zu (Namenssuche im CompHub-Server). Ohne eigene Wahl gilt das Discord-Konto, mit dem das Konto
 * oder der VIP-Zugang ohnehin verknuepft ist.
 *
 * Gesehen wird auf JEDEM Server, auf dem der Bot sitzt (lib/discordGilden.ts) - nicht nur im CompHub-Server.
 * Der Betreiber (11.10.2026): er war im Sprachkanal "Live Support" und die Seite sah ihn nicht; es gibt mehrere
 * Server und Sprachkanaele. Ist kein Discord-Konto zugewiesen, sucht CompHub den bei den Socials eingetragenen
 * Discord-Namen auf den Servern des Bots.
 */

const API = 'https://discord.com/api/v10';
const SERVER = process.env.DISCORD_SERVER_ID || '1529205620287344783';

export interface DiscordStand {
  imKanal: boolean;
  /** Streamt (Bildschirm oder "Live gehen")? */
  streamt: boolean;
  kamera: boolean;
  kanalName: string | null;
  /** Auf welchem Server. */
  gildenName: string | null;
  /** Oeffnet den Sprachkanal in Discord. */
  link: string | null;
}

const NICHT_DA: DiscordStand = { imKanal: false, streamt: false, kamera: false, kanalName: null, gildenName: null, link: null };

async function bot(weg: string): Promise<Response | null> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!token) return null;
  try {
    return await fetch(`${API}${weg}`, {
      headers: { Authorization: `Bot ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000),
    });
  } catch { return null; }
}

/* ------------------------------------------------------------------ Stand eines Mitglieds */

const stand = new Map<string, { bis: number; wert: DiscordStand | null }>();

/** Null heisst "weiss ich nicht" (Discord antwortet nicht), nie "nicht im Kanal". */
export async function discordStand(id: string): Promise<DiscordStand | null> {
  if (!/^\d{15,25}$/.test(id)) return null;
  const da = stand.get(id);
  if (da && da.bis > Date.now()) return da.wert;
  const s = await stimmeSuchen(id); // alle Server des Bots
  let wert: DiscordStand | null = null;
  if (s === null) wert = NICHT_DA;
  else if (s) {
    wert = {
      imKanal: true, streamt: s.streamt, kamera: s.kamera, kanalName: s.kanalName, gildenName: s.gildenName, link: s.link,
    };
  }
  // Zwoelf Sekunden gemerkt: viele Zuschauer, eine Abfrage.
  stand.set(id, { bis: Date.now() + 12_000, wert });
  if (stand.size > 200) stand.clear();
  return wert;
}

/* ------------------------------------------------------------------ Mitglieder */

const namen = new Map<string, { bis: number; name: string | null }>();

/** Der Name eines Mitglieds im CompHub-Server - oder null, wenn es dort nicht ist. */
export async function mitgliedName(id: string): Promise<string | null> {
  if (!/^\d{15,25}$/.test(id)) return null;
  const da = namen.get(id);
  if (da && da.bis > Date.now()) return da.name;
  const r = await bot(`/guilds/${SERVER}/members/${id}`);
  let name: string | null = null;
  if (r?.ok) {
    const m = await r.json().catch(() => null) as { nick?: string; user?: { global_name?: string; username?: string } } | null;
    name = m ? String(m.nick || m.user?.global_name || m.user?.username || id) : null;
  } else if (r && r.status !== 404) {
    // Discord antwortet nicht richtig: nichts behaupten und nichts merken.
    return null;
  }
  namen.set(id, { bis: Date.now() + 10 * 60_000, name });
  return name;
}

export { mitgliederSuchen };

const perName = new Map<string, { bis: number; id: string | null }>();

/** Das Discord-Konto zu einem bei den Socials eingetragenen Benutzernamen - auf einem Server des Bots gesucht. */
async function ueberSocials(name: string): Promise<string | null> {
  const n = name.trim().replace(/^@/, '').toLowerCase();
  if (n.length < 2) return null;
  const da = perName.get(n);
  if (da && da.bis > Date.now()) return da.id;
  const id = await mitgliedPerName(n);
  perName.set(n, { bis: Date.now() + (id ? 30 : 5) * 60_000, id });
  return id;
}

/**
 * Das Discord-Konto, das ohne eigene Wahl gilt: das des verknuepften VIP-Zugangs oder Anmeldedienstes - und wo es
 * keines gibt, das Mitglied, dessen Benutzername bei den Socials des Kontos steht.
 */
export async function standardDiscordId(ident: string): Promise<string | null> {
  try {
    if (ident.startsWith('z:')) return (await zugangNach(ident.slice(2)))?.discordId ?? null;
    if (ident.startsWith('k:')) {
      const k = await nachId(ident.slice(2));
      if (k?.dienste?.discord) return k.dienste.discord;
      const name = k?.socials?.discord;
      return name ? await ueberSocials(name) : null;
    }
  } catch { /* dann keines */ }
  return null;
}
