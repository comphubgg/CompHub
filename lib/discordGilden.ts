import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * CompHub auf mehreren Discord-Servern: Einrichtung, Ankuendigungen, Sprachkanal-Suche.
 *
 * Der Betreiber (11.10.2026): keine Webhooks je Kanal. Wird CompHub auf einen Server eingeladen, legt es dort von
 * selbst einen Kanal "comphub-dashboard" an; in dem stellt ein Server-Admin ein, in welchem Kanal die Live-Meldungen
 * der Profis erscheinen. Profis entscheiden in ihrem Dashboard, auf welchen Servern ihr POV angekuendigt wird.
 *
 * Wie der Bot erfaehrt, dass er eingeladen wurde: ohne dauerhafte Verbindung zu Discord (die Seite laeuft ohne
 * Hintergrundvorgaenge) fragt der zehn-Minuten-Ablauf der GitHub-Aktion /api/cron/discord-gilden ab, auf welchen
 * Servern der Bot sitzt, und richtet neue ein. Dasselbe passiert, sobald ein Profi sein Dashboard oeffnet.
 *
 * Der Kanal ist nur fuer Admins sichtbar (alle anderen: "Kanal ansehen" verweigert) - dort werden Einstellungen
 * gemacht. Gespeichert wird je Server: der Kanal, die Nachricht darin und der Ankuendigungskanal.
 */

const API = 'https://discord.com/api/v10';
const DATEI = 'discord-gilden.json';
export const DASHBOARD_KANAL = 'comphub-dashboard';
/** Kanaele ansehen, Nachrichten senden, Links einbetten, Verlauf lesen, Kanaele verwalten. */
export const BOT_RECHTE = '85008';
const SEHEN = 1024n;
const SENDEN = 2048n;
const EINBETTEN = 16384n;
const VERLAUF = 65536n;
const ADMINISTRATOR = 0x8n;
const SERVER_VERWALTEN = 0x20n;

export interface GildenStand {
  name: string;
  /** Der Kanal "comphub-dashboard". */
  kanal: string;
  /** Die Einstellungs-Nachricht darin. */
  nachricht: string;
  /** Wohin die Live-Meldungen gehen; leer = noch nicht gewaehlt (dann bleibt es still). */
  ankuendigung: string;
  /** Eigener Kanal je Profi (Kennung -> Kanal), falls ein Server-Admin das so will. */
  proKanal: Record<string, string>;
  /**
   * VIPs, die hier die Live-Meldungen ihrer Pros haben wollen (alle Kennungen des VIPs) - eingestellt im POV-Bereich des VIPs (/pov, 29.10.2026).
   * Gemeldet werden dann die Pros, die diesen VIP zusehen lassen, auch wenn der Pro den Server nicht selbst eingeschaltet hat.
   */
  vips?: string[];
  /** Letzter Fehler bei der Einrichtung ("rechte" = dem Bot fehlt "Kanaele verwalten"). */
  fehler: string;
  eingerichtet: number;
}

interface Meldung { kanal: string; nachricht: string; seit: number; gilde: string }
interface Ablage {
  gilden: Record<string, GildenStand>;
  /** Offene Live-Meldungen je Profi - damit sie beim Ende des Streams durchgestrichen werden koennen. */
  live: Record<string, Meldung[]>;
}

async function lies(): Promise<Ablage> {
  const a = await liesJson<Partial<Ablage>>(DATEI, {});
  return { gilden: a.gilden ?? {}, live: a.live ?? {} };
}
const schreibe = (a: Ablage) => schreibJson(DATEI, a);

/* ------------------------------------------------------------------ Discord */

function token(): string { return (process.env.DISCORD_BOT_TOKEN ?? '').trim(); }

async function bot<T = unknown>(
  weg: string, methode: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET', body?: unknown,
): Promise<{ status: number; daten: T | null }> {
  const t = token();
  if (!t) return { status: 0, daten: null };
  try {
    const r = await fetch(`${API}${weg}`, {
      method: methode, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bot ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const daten = r.status === 204 ? null : await r.json().catch(() => null) as T | null;
    return { status: r.status, daten };
  } catch { return { status: 0, daten: null }; }
}

let botId = '';
async function eigeneId(): Promise<string> {
  if (botId) return botId;
  const r = await bot<{ id?: string }>('/users/@me');
  botId = String(r.daten?.id ?? '');
  return botId;
}

let gildenListe: { bis: number; liste: Array<{ id: string; name: string }> } | null = null;

/** Alle Server, auf denen der Bot sitzt (eine Minute gemerkt). Null = Discord antwortet nicht. */
export async function botGilden(): Promise<Array<{ id: string; name: string }> | null> {
  if (gildenListe && gildenListe.bis > Date.now()) return gildenListe.liste;
  const r = await bot<Array<{ id: string; name: string }>>('/users/@me/guilds?limit=200');
  if (r.status !== 200 || !Array.isArray(r.daten)) return null;
  gildenListe = { bis: Date.now() + 60_000, liste: r.daten.map((g) => ({ id: g.id, name: g.name })) };
  return gildenListe.liste;
}

/** Der Link, mit dem jemand CompHub auf seinen Server einlaedt. */
export async function einladungsLink(): Promise<string | null> {
  const r = await bot<{ id?: string }>('/applications/@me');
  const id = r.daten?.id;
  if (!id) return null;
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${BOT_RECHTE}`;
}

/* ------------------------------------------------------------------ Einrichtung */

/** Die Einstellungs-Nachricht: erklaert in zwei Saetzen, was hier geht, und zeigt den gewaehlten Kanal. */
export function dashboardNachricht(g: Pick<GildenStand, 'ankuendigung' | 'proKanal'>, seite = 'https://www.thecomphub.com') {
  const kanal = g.ankuendigung ? `<#${g.ankuendigung}>` : '*not chosen yet — nothing is announced*';
  const eigene = Object.entries(g.proKanal ?? {});
  return {
    embeds: [{
      title: 'CompHub POV setup',
      color: 0x0ea5e9,
      description:
        'Pros can show their POV to approved VIPs on CompHub. This channel is only visible to server admins.\n\n'
        + `**Live announcements go to:** ${kanal}\n`
        + (eigene.length ? `**Own channels:** ${eigene.map(([, k]) => `<#${k}>`).join(', ')}\n` : '')
        + '\n1. Pick the channel for live announcements below.\n'
        + '2. Pros turn this server on in their CompHub dashboard (Settings → Discord servers).\n'
        + `3. Optional: \`/povkanal channel:#channel pro:name\` sends one pro's announcements to a different channel.\n\n`
        + `Watch on ${seite}/streams · invite-only access, VIPs approved by the pro.`,
    }],
    components: [
      {
        type: 1,
        components: [{
          type: 8, custom_id: 'gilde:kanal', placeholder: 'Pick the announcement channel',
          channel_types: [0, 5], min_values: 1, max_values: 1,
        }],
      },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: 'Send a test message', custom_id: 'gilde:test' },
          { type: 2, style: 4, label: 'Turn announcements off', custom_id: 'gilde:aus' },
        ],
      },
    ],
  };
}

/**
 * Einen Server einrichten: Kanal anlegen (oder den vorhandenen uebernehmen) und die Einstellungs-Nachricht setzen.
 * Mehrfach aufrufbar - was schon steht, bleibt.
 */
export async function richteGildeEin(gildenId: string, name: string, seite?: string): Promise<GildenStand> {
  const a = await lies();
  const alt: GildenStand = a.gilden[gildenId] ?? {
    name, kanal: '', nachricht: '', ankuendigung: '', proKanal: {}, fehler: '', eingerichtet: 0,
  };
  const g: GildenStand = { ...alt, name, proKanal: alt.proKanal ?? {} };

  // Gibt es den Kanal noch?
  if (g.kanal) {
    const da = await bot(`/channels/${g.kanal}`);
    if (da.status === 404) { g.kanal = ''; g.nachricht = ''; }
  }
  if (!g.kanal) {
    const kanaele = await bot<Array<{ id: string; name: string; type: number }>>(`/guilds/${gildenId}/channels`);
    const vorhanden = (kanaele.daten ?? []).find((k) => k.type === 0 && k.name === DASHBOARD_KANAL);
    if (vorhanden) g.kanal = vorhanden.id;
    else if (kanaele.status === 200) {
      const ich = await eigeneId();
      const neu = await bot<{ id?: string }>(`/guilds/${gildenId}/channels`, 'POST', {
        name: DASHBOARD_KANAL, type: 0,
        topic: 'CompHub setup — only visible to server admins. Pick where Pro POV announcements go.',
        permission_overwrites: [
          { id: gildenId, type: 0, deny: String(SEHEN) },
          ...(ich ? [{ id: ich, type: 1, allow: String(SEHEN | SENDEN | EINBETTEN | VERLAUF) }] : []),
        ],
      });
      if (neu.status === 200 || neu.status === 201) g.kanal = String(neu.daten?.id ?? '');
      else g.fehler = neu.status === 403 ? 'rechte' : `discord-${neu.status}`;
    } else {
      g.fehler = kanaele.status === 403 ? 'rechte' : `discord-${kanaele.status}`;
    }
  }

  if (g.kanal) {
    g.fehler = '';
    const inhalt = dashboardNachricht(g, seite);
    let ok = false;
    if (g.nachricht) {
      ok = (await bot(`/channels/${g.kanal}/messages/${g.nachricht}`, 'PATCH', inhalt)).status === 200;
    }
    if (!ok) {
      const neu = await bot<{ id?: string }>(`/channels/${g.kanal}/messages`, 'POST', inhalt);
      g.nachricht = neu.status === 200 || neu.status === 201 ? String(neu.daten?.id ?? '') : '';
      if (!g.nachricht) g.fehler = neu.status === 403 ? 'rechte' : `discord-${neu.status}`;
    }
    if (!g.eingerichtet && !g.fehler) g.eingerichtet = Date.now();
  }
  const b = await lies();
  b.gilden[gildenId] = g;
  await schreibe(b);
  return g;
}

/** Alle Server, auf denen der Bot sitzt, einrichten; Server, die er verlassen hat, vergessen. */
export async function richteAlleEin(seite?: string): Promise<{ gilden: number; neu: number; fehler: number } | null> {
  const liste = await botGilden();
  if (!liste) return null;
  const a = await lies();
  let neu = 0; let fehler = 0;
  for (const gl of liste) {
    const war = a.gilden[gl.id]?.eingerichtet ?? 0;
    const g = await richteGildeEin(gl.id, gl.name, seite);
    if (!war && g.eingerichtet) neu += 1;
    if (g.fehler) fehler += 1;
  }
  const b = await lies();
  const ids = new Set(liste.map((x) => x.id));
  let geaendert = false;
  for (const id of Object.keys(b.gilden)) if (!ids.has(id)) { delete b.gilden[id]; geaendert = true; }
  if (geaendert) await schreibe(b);
  return { gilden: liste.length, neu, fehler };
}

export async function liesGilden(): Promise<Record<string, GildenStand>> {
  return (await lies()).gilden;
}

/** Den Ankuendigungskanal eines Servers setzen (leer = aus) - optional nur fuer einen Profi. */
export async function setzeKanal(gildenId: string, kanal: string, pro?: string): Promise<GildenStand | null> {
  const a = await lies();
  const g = a.gilden[gildenId];
  if (!g) return null;
  if (pro) {
    if (kanal) g.proKanal = { ...(g.proKanal ?? {}), [pro]: kanal };
    else { const k = { ...(g.proKanal ?? {}) }; delete k[pro]; g.proKanal = k; }
  } else g.ankuendigung = kanal;
  await schreibe(a);
  if (g.kanal && g.nachricht) await bot(`/channels/${g.kanal}/messages/${g.nachricht}`, 'PATCH', dashboardNachricht(g));
  return g;
}

/** Eine Testmeldung in den gewaehlten Kanal - damit der Admin sieht, dass es ankommt. */
export async function sendeTest(gildenId: string): Promise<'ok' | 'kein-kanal' | 'fehler'> {
  const g = (await lies()).gilden[gildenId];
  if (!g?.ankuendigung) return 'kein-kanal';
  const r = await bot(`/channels/${g.ankuendigung}/messages`, 'POST', {
    embeds: [{
      title: 'CompHub test message',
      description: 'This is where live announcements of Pro POVs will appear.',
      color: 0x0ea5e9,
    }],
  });
  return r.status === 200 || r.status === 201 ? 'ok' : 'fehler';
}

/* ------------------------------------------------------------------ Server der VIPs */

/*
 * Der Betreiber (29.10.2026): "der VIP soll den Bot fuer die POV auch auf sein Discord einladen koennen und einstellen". Der VIP laedt CompHub aus
 * seinem POV-Bereich (/pov) ein und waehlt dort den Kanal fuer die Live-Meldungen seiner Pros. Welche Server er einstellen darf, sieht der Bot an
 * seinem Discord-Konto - dieselbe Regel wie im Kanal comphub-dashboard: Besitzer, Administrator oder "Server verwalten".
 */
const verwaltet = new Map<string, { bis: number; liste: Array<{ id: string; name: string }> }>();

export async function verwalteteGilden(discordId: string): Promise<Array<{ id: string; name: string }>> {
  if (!/^\d{5,25}$/.test(discordId)) return [];
  const da = verwaltet.get(discordId);
  if (da && da.bis > Date.now()) return da.liste;
  const liste = await botGilden();
  if (!liste) return [];
  const raus: Array<{ id: string; name: string }> = [];
  for (const g of liste) {
    const info = await bot<{ owner_id?: string; roles?: Array<{ id: string; permissions?: string }> }>(`/guilds/${g.id}`);
    if (!info.daten) continue;
    if (info.daten.owner_id === discordId) { raus.push(g); continue; }
    const m = await bot<{ roles?: string[] }>(`/guilds/${g.id}/members/${discordId}`);
    if (m.status !== 200 || !m.daten) continue;
    let rechte = 0n;
    // Die Rolle @everyone hat die Kennung des Servers.
    for (const r of info.daten.roles ?? []) {
      if (r.id === g.id || (m.daten.roles ?? []).includes(r.id)) { try { rechte |= BigInt(r.permissions ?? '0'); } catch { /* kaputtes Bitfeld */ } }
    }
    if ((rechte & ADMINISTRATOR) !== 0n || (rechte & SERVER_VERWALTEN) !== 0n) raus.push(g);
  }
  verwaltet.set(discordId, { bis: Date.now() + 60_000, liste: raus });
  return raus;
}

/** Die Textkanaele eines Servers (Text und Ankuendigung), in der Reihenfolge von Discord. */
export async function textKanaele(gildenId: string): Promise<Array<{ id: string; name: string }>> {
  const r = await bot<Array<{ id: string; name: string; type: number; position?: number }>>(`/guilds/${gildenId}/channels`);
  if (!Array.isArray(r.daten)) return [];
  return r.daten.filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c) => ({ id: c.id, name: c.name }));
}

/** Die Pros dieses VIPs auf diesem Server melden - oder nicht mehr. */
export async function setzeVipMeldungen(gildenId: string, vipIdents: string[], an: boolean): Promise<GildenStand | null> {
  const a = await lies();
  const g = a.gilden[gildenId];
  if (!g) return null;
  const v = new Set(g.vips ?? []);
  for (const id of vipIdents) { if (an) v.add(id); else v.delete(id); }
  g.vips = [...v];
  await schreibe(a);
  return g;
}

/** Die Server, auf denen einer dieser VIPs die Meldungen seiner Pros haben will. */
export async function gildenDerVips(vipIdents: string[]): Promise<string[]> {
  if (!vipIdents.length) return [];
  const gilden = (await lies()).gilden;
  return Object.entries(gilden).filter(([, g]) => (g.vips ?? []).some((v) => vipIdents.includes(v))).map(([id]) => id);
}

/** Darf, wer das abschickt, den Server einstellen? Verwalter oder Administrator (Bitfeld aus der Interaktion). */
export function darfEinstellen(rechte: string | undefined): boolean {
  try {
    const b = BigInt(rechte ?? '0');
    return (b & ADMINISTRATOR) !== 0n || (b & SERVER_VERWALTEN) !== 0n;
  } catch { return false; }
}

/* ------------------------------------------------------------------ Ankuendigungen */

/** Wohin die Meldung dieses Profis auf diesem Server geht - oder leer. */
function zielKanal(g: GildenStand | undefined, ident: string): string {
  return g ? (g.proKanal?.[ident] || g.ankuendigung || '') : '';
}

/**
 * Das POV geht live: auf allen Servern melden, die der Profi eingeschaltet hat und fuer die ein Kanal gewaehlt ist.
 * Hoechstens eine Meldung je Profi und Server alle zehn Minuten (Neuverbindungen sollen nicht spammen).
 */
export async function kuendigeAn(ident: string, name: string, gildenIds: string[], seite: string): Promise<number> {
  if (!gildenIds.length) return 0;
  const a = await lies();
  const jetzt = Date.now();
  const alte = a.live[ident] ?? [];
  const neue: Meldung[] = [];
  let gesendet = 0;
  for (const id of gildenIds) {
    const g = a.gilden[id];
    const kanal = zielKanal(g, ident);
    if (!kanal) continue;
    const frisch = alte.find((m) => m.gilde === id && jetzt - m.seit < 10 * 60_000);
    if (frisch) { neue.push(frisch); continue; }
    const r = await bot<{ id?: string }>(`/channels/${kanal}/messages`, 'POST', {
      embeds: [{
        title: `\u{1F534} ${name.replace(/[*_`~|>]/g, '')} is live`,
        description: `POV on CompHub — approved VIPs can watch here: ${seite}/streams`,
        color: 0xef4444,
      }],
    });
    if ((r.status === 200 || r.status === 201) && r.daten?.id) {
      neue.push({ kanal, nachricht: String(r.daten.id), seit: jetzt, gilde: id });
      gesendet += 1;
    }
  }
  // Meldungen anderer Server, die nicht mehr gewaehlt sind, bleiben stehen und werden beim Ende mit abgeraeumt.
  a.live[ident] = [...neue, ...alte.filter((m) => !neue.some((n) => n.nachricht === m.nachricht))];
  await schreibe(a);
  return gesendet;
}

/*
 * Der Profi streamt in einem Discord-Sprachkanal ("Live gehen"): auf dem Server melden, auf dem er sitzt.
 *
 * Der Betreiber (12.10.2026): er war live in einem Sprachkanal, und es kam keine Meldung. Der Bot sieht nur, WER in
 * welchem Sprachkanal sitzt und ob er streamt - nicht das Bild. Gemeldet wird, wenn der Profi das fuer diesen Server
 * eingeschaltet hat und dort ein Meldungs-Kanal gewaehlt ist; einmal je Sitzung, und beim Ende wird die Meldung
 * durchgestrichen. Gepruefte Stelle: wann immer jemand den Stand abfragt (Streams-Seite, Dashboard) und im
 * Zehn-Minuten-Ablauf.
 */
const unterwegs = new Set<string>();

export interface StimmenStand {
  streamt: boolean; gilde: string | null; gildenName: string | null; kanalName: string | null; link: string | null;
}

export async function meldeDiscordStand(
  ident: string, name: string, gildenIds: string[], stand: StimmenStand | null,
): Promise<void> {
  const schluessel = `${ident}#discord`;
  if (unterwegs.has(schluessel)) return;
  unterwegs.add(schluessel);
  try {
    const a = await lies();
    const offen = a.live[schluessel] ?? [];
    const sauber = name.replace(/[*_`~|>]/g, '');
    if (!stand?.streamt || !stand.gilde) {
      if (!offen.length) return;
      for (const m of offen) {
        await bot(`/channels/${m.kanal}/messages/${m.nachricht}`, 'PATCH', {
          embeds: [{ title: `${sauber} was live on Discord`, description: 'The stream in the voice channel has ended.', color: 0x64748b }],
        });
      }
      delete a.live[schluessel];
      await schreibe(a);
      return;
    }
    // Schon gemeldet in dieser Sitzung (hoechstens zwoelf Stunden alt - eine haengengebliebene Meldung soll nicht ewig blockieren).
    if (offen.some((m) => Date.now() - m.seit < 12 * 3600_000)) return;
    if (!gildenIds.includes(stand.gilde)) return;
    const kanal = zielKanal(a.gilden[stand.gilde], ident);
    if (!kanal) return;
    const r = await bot<{ id?: string }>(`/channels/${kanal}/messages`, 'POST', {
      embeds: [{
        title: `\u{1F534} ${sauber} is live on Discord`,
        description: `Streaming in the voice channel **#${stand.kanalName ?? 'voice'}** on ${stand.gildenName ?? 'this server'}`
          + (stand.link ? ` — [join](${stand.link})` : ''),
        color: 0xef4444,
      }],
    });
    if ((r.status === 200 || r.status === 201) && r.daten?.id) {
      a.live[schluessel] = [{ kanal, nachricht: String(r.daten.id), seit: Date.now(), gilde: stand.gilde }];
      await schreibe(a);
    }
  } finally {
    unterwegs.delete(schluessel);
  }
}

/** Das POV ist zu Ende: die Live-Meldungen durchstreichen. */
export async function beendeAnkuendigung(ident: string, name: string): Promise<void> {
  const a = await lies();
  const offen = a.live[ident];
  if (!offen?.length) return;
  for (const m of offen) {
    await bot(`/channels/${m.kanal}/messages/${m.nachricht}`, 'PATCH', {
      embeds: [{
        title: `${name.replace(/[*_`~|>]/g, '')} was live`,
        description: 'The POV has ended.',
        color: 0x64748b,
      }],
    });
  }
  delete a.live[ident];
  await schreibe(a);
}

/** Offene Meldungen von Profis, die nicht mehr senden (Verbindung gerissen, ohne Ende-Aufruf): abraeumen. */
export async function raeumeVerwaiste(istLive: (ident: string) => boolean, namen: Record<string, string>): Promise<number> {
  const a = await lies();
  let n = 0;
  for (const ident of Object.keys(a.live)) {
    // Die Meldungen zum Discord-Sprachkanal prueft meldeDiscordStand - nicht der Weiterreicher.
    if (ident.endsWith('#discord') || istLive(ident)) continue;
    await beendeAnkuendigung(ident, namen[ident] || 'Pro');
    n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ Sprachkanal ueber alle Server */

export interface GildenStimme {
  gilde: string; gildenName: string; kanal: string; kanalName: string | null;
  streamt: boolean; kamera: boolean; link: string;
}

const kanalNamen = new Map<string, { bis: number; namen: Map<string, string> }>();
async function kanalName(gilde: string, id: string): Promise<string | null> {
  let c = kanalNamen.get(gilde);
  if (!c || c.bis < Date.now()) {
    const r = await bot<Array<{ id: string; name: string }>>(`/guilds/${gilde}/channels`);
    if (r.status === 200 && Array.isArray(r.daten)) {
      c = { bis: Date.now() + 5 * 60_000, namen: new Map(r.daten.map((k) => [k.id, k.name])) };
      kanalNamen.set(gilde, c);
    }
  }
  return c?.namen.get(id) ?? null;
}

/**
 * Sitzt dieses Mitglied in einem Sprachkanal - auf irgendeinem Server, auf dem der Bot ist?
 * Null heisst "weiss ich nicht" (Discord antwortet nicht), nie "nicht im Kanal".
 */
export async function stimmeSuchen(mitglied: string): Promise<GildenStimme | null | undefined> {
  const liste = await botGilden();
  if (!liste) return undefined;
  const treffer = await Promise.all(liste.map(async (g) => {
    const r = await bot<{ channel_id?: string; self_stream?: boolean; self_video?: boolean }>(
      `/guilds/${g.id}/voice-states/${mitglied}`);
    if (r.status === 404 || r.status === 400) return { g, aus: null, unklar: false };
    if (r.status !== 200 || !r.daten?.channel_id) return { g, aus: null, unklar: r.status !== 200 };
    return { g, aus: r.daten, unklar: false };
  }));
  const da = treffer.filter((t) => t.aus);
  if (!da.length) return treffer.some((t) => t.unklar) && treffer.every((t) => t.unklar) ? undefined : null;
  // Mehrere Server: der, in dem er streamt, zuerst.
  da.sort((x, y) => Number(Boolean(y.aus?.self_stream)) - Number(Boolean(x.aus?.self_stream)));
  const t = da[0];
  const kanal = String(t.aus!.channel_id);
  return {
    gilde: t.g.id, gildenName: t.g.name, kanal, kanalName: await kanalName(t.g.id, kanal),
    streamt: Boolean(t.aus!.self_stream), kamera: Boolean(t.aus!.self_video),
    link: `https://discord.com/channels/${t.g.id}/${kanal}`,
  };
}

/** Ein Mitglied mit diesem Benutzernamen auf irgendeinem Server des Bots - fuer die automatische Zuordnung. */
export async function mitgliedPerName(benutzername: string): Promise<string | null> {
  const q = benutzername.trim().replace(/^@/, '').toLowerCase();
  if (q.length < 2) return null;
  const liste = await botGilden();
  if (!liste) return null;
  for (const g of liste) {
    const r = await bot<Array<{ user?: { id?: string; username?: string; global_name?: string } }>>(
      `/guilds/${g.id}/members/search?query=${encodeURIComponent(q)}&limit=5`);
    if (r.status !== 200 || !Array.isArray(r.daten)) continue;
    const genau = r.daten.find((m) => m.user?.username?.toLowerCase() === q);
    if (genau?.user?.id) return genau.user.id;
  }
  return null;
}

