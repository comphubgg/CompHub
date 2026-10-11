import { mitgliederSuchen } from '@/lib/discord';
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
 * Gesehen wird nur der CompHub-Server: der Bot sitzt nur dort. Wer in einem fremden Server streamt, taucht
 * hier nicht auf.
 */

const API = 'https://discord.com/api/v10';
const SERVER = process.env.DISCORD_SERVER_ID || '1529205620287344783';

export interface DiscordStand {
  imKanal: boolean;
  /** Streamt (Bildschirm oder "Live gehen")? */
  streamt: boolean;
  kamera: boolean;
  kanalName: string | null;
  /** Oeffnet den Sprachkanal in Discord. */
  link: string | null;
}

const NICHT_DA: DiscordStand = { imKanal: false, streamt: false, kamera: false, kanalName: null, link: null };

async function bot(weg: string): Promise<Response | null> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!token) return null;
  try {
    return await fetch(`${API}${weg}`, {
      headers: { Authorization: `Bot ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000),
    });
  } catch { return null; }
}

/* ------------------------------------------------------------------ Kanalnamen */

let kanaele: { bis: number; namen: Map<string, string> } | null = null;

async function kanalName(id: string): Promise<string | null> {
  if (!kanaele || kanaele.bis < Date.now()) {
    const r = await bot(`/guilds/${SERVER}/channels`);
    if (r?.ok) {
      const liste = await r.json().catch(() => []) as Array<{ id: string; name: string }>;
      kanaele = { bis: Date.now() + 5 * 60_000, namen: new Map(liste.map((k) => [k.id, k.name])) };
    }
  }
  return kanaele?.namen.get(id) ?? null;
}

/* ------------------------------------------------------------------ Stand eines Mitglieds */

const stand = new Map<string, { bis: number; wert: DiscordStand | null }>();

/** Null heisst "weiss ich nicht" (Discord antwortet nicht), nie "nicht im Kanal". */
export async function discordStand(id: string): Promise<DiscordStand | null> {
  if (!/^\d{15,25}$/.test(id)) return null;
  const da = stand.get(id);
  if (da && da.bis > Date.now()) return da.wert;
  let wert: DiscordStand | null = null;
  const r = await bot(`/guilds/${SERVER}/voice-states/${id}`);
  if (r) {
    if (r.status === 404) wert = NICHT_DA; // "Unknown Voice State": sitzt in keinem Sprachkanal
    else if (r.ok) {
      const j = await r.json().catch(() => null) as { channel_id?: string; self_stream?: boolean; self_video?: boolean } | null;
      const kanal = String(j?.channel_id ?? '');
      wert = kanal
        ? {
          imKanal: true, streamt: Boolean(j?.self_stream), kamera: Boolean(j?.self_video),
          kanalName: await kanalName(kanal), link: `https://discord.com/channels/${SERVER}/${kanal}`,
        }
        : NICHT_DA;
    }
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

/** Das Discord-Konto, das ohne eigene Wahl gilt: das des verknuepften VIP-Zugangs oder Anmeldedienstes. */
export async function standardDiscordId(ident: string): Promise<string | null> {
  try {
    if (ident.startsWith('z:')) return (await zugangNach(ident.slice(2)))?.discordId ?? null;
    if (ident.startsWith('k:')) return (await nachId(ident.slice(2)))?.dienste?.discord ?? null;
  } catch { /* dann keines */ }
  return null;
}
