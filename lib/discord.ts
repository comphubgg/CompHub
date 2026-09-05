import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Zugangsschluessel nach Discord schicken.
 *
 * Der Betreiber fuehrt fuer jeden VIP einen eigenen Kanal auf seinem Server.
 * Wenn er dort einen neuen Schluessel erzeugt, soll der von selbst in diesen
 * Kanal wandern und der vorherige verschwinden - damit im Kanal immer genau
 * ein Schluessel steht, naemlich der gueltige. Wer einen neuen VIP anlegt,
 * bekommt den Kanal gleich mit dazu, benannt nach "<name>-key".
 *
 * ------------------------------------------------------------ Ohne Zugang
 *
 * Alles hier haengt an einem Bot-Token. Fehlt er, geschieht schlicht nichts:
 * der Schluessel wird trotzdem erzeugt und dem Admin angezeigt, er wandert
 * nur nicht nach Discord. Ein Schluessel, der sich nicht erzeugen laesst,
 * weil ein Chatdienst gerade nicht erreichbar ist, waere die schlechtere
 * Seite des Handels.
 *
 * Der Token gehoert in .env.local als DISCORD_BOT_TOKEN. Er steht bewusst
 * nicht in der Verzeichnisverwaltung - mit ihm kann man auf dem Server
 * schreiben und Kanaele anlegen.
 *
 * ------------------------------------------------------------ Was er darf
 *
 * Der Bot braucht auf dem Server: Kanaele verwalten (fuer neue VIPs),
 * Nachrichten senden und Nachrichten verwalten (um die alte zu loeschen).
 * Mehr nicht.
 */

const API = 'https://discord.com/api/v10';

/**
 * Server und Kategorie.
 *
 * Fest hinterlegt, weil sie sich nicht aendern - und weil data/ nicht mit
 * dem Verzeichnis wandert: stuenden sie nur dort, muesste der Betreiber sie
 * auf dem Laptop noch einmal eintragen. Eine Umgebungsvariable sticht sie,
 * falls doch einmal ein anderer Server drankommt.
 */
const SERVER = process.env.DISCORD_SERVER_ID || '1529205620287344783';
const KATEGORIE = process.env.DISCORD_KATEGORIE_ID || '1529205953118081167';

/**
 * Die Kanaele, die es schon gibt.
 *
 * Ebenfalls im Quelltext und nicht nur in den Daten, aus demselben Grund.
 * Was spaeter dazukommt, landet in data/discord-kanaele.json und geht hier
 * vor.
 */
const BEKANNTE_KANAELE: Record<string, string> = {
  amar: '1529207545921540096',
  boop: '1529207598593609861',
  gripey: '1529207652515844147',
  leothecrack: '1529207738809450619',
  'aussie-antics': '1529207809709965492',
  faxuty: '1529207869075881994',
  'admin-juanito': '1529554751275143309',
};

const DATEI = path.join(DATEN_ORT, 'discord-kanaele.json');

interface Eintrag {
  /** Der Kanal dieses VIPs. */
  kanal: string;
  /** Die zuletzt dort abgelegte Schluesselnachricht - sie wird ersetzt. */
  nachricht?: string;
}

type Ablage = Record<string, Eintrag>;

/** Ist die Anbindung ueberhaupt eingerichtet? */
export function discordDa(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

async function lies(): Promise<Ablage> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Ablage;
    return roh && typeof roh === 'object' ? roh : {};
  } catch {
    return {};
  }
}

async function schreibe(a: Ablage): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(a, null, 1), 'utf8');
}

/** Ein Aufruf an Discord. Gibt die Antwort zurueck oder null. */
async function ruf(
  weg: string, art: 'GET' | 'POST' | 'DELETE', koerper?: unknown,
): Promise<Record<string, unknown> | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`${API}${weg}`, {
      method: art,
      headers: {
        Authorization: `Bot ${token}`,
        ...(koerper ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    // 204 kommt beim Loeschen und hat keinen Inhalt.
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[discord]', art, weg, r.status,
        JSON.stringify(j).slice(0, 200));
      return null;
    }
    return j as Record<string, unknown>;
  } catch (e) {
    console.error('[discord] nicht erreichbar:', (e as Error).message);
    return null;
  }
}

/**
 * Der Kanal eines VIPs - vorhandener oder neu angelegter.
 *
 * Der Name folgt dem Muster "<name>-key". Discord erlaubt in Kanalnamen
 * keine Grossbuchstaben und keine Leerzeichen; was nicht hineinpasst, wird
 * zu einem Bindestrich.
 */
async function kanalFuer(name: string, ablage: Ablage): Promise<string | null> {
  const schluessel = name.toLowerCase();
  const vorhanden = ablage[schluessel]?.kanal ?? BEKANNTE_KANAELE[schluessel];
  if (vorhanden) return vorhanden;

  const kanalname = `${schluessel.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}-key`;
  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name: kanalname,
    type: 0,                 // Textkanal
    parent_id: KATEGORIE,
  });
  const id = typeof neu?.id === 'string' ? neu.id : null;
  if (!id) return null;

  ablage[schluessel] = { kanal: id };
  await schreibe(ablage);
  return id;
}

/**
 * Den Schluessel in den Kanal des VIPs legen.
 *
 * Zuerst die alte Nachricht weg, dann die neue - in dieser Reihenfolge, weil
 * ein kurzer Moment ohne Schluessel harmloser ist als einer mit zweien. Wer
 * zwei sieht, probiert den falschen.
 *
 * Zurueck kommt, ob es geklappt hat. Der Grund ist ein kurzes Kennwort und
 * kein Satz: die Oberflaeche laeuft auf Englisch und Deutsch, und ein hier
 * fertig formulierter deutscher Satz stand dort mitten im englischen Text.
 * Der Aufrufer entscheidet, ob er das
 * dem Admin sagt - der Schluessel selbst ist zu diesem Zeitpunkt schon
 * erzeugt und gespeichert.
 */
export async function schickeSchluessel(
  name: string, schluessel: string,
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };

  const ablage = await lies();
  const kanal = await kanalFuer(name, ablage);
  if (!kanal) return { ok: false, grund: 'kein-kanal' };

  const alt = ablage[name.toLowerCase()]?.nachricht;
  if (alt) await ruf(`/channels/${kanal}/messages/${alt}`, 'DELETE');

  /*
   * Der Text bleibt knapp und englisch, wie alles, was nach aussen geht.
   * Der Schluessel steht in einem Codeblock: so laesst er sich auf dem
   * Telefon mit einem Griff kopieren, und Discord macht keine Formatierung
   * daraus.
   */
  const gesendet = await ruf(`/channels/${kanal}/messages`, 'POST', {
    content: [
      `**Your CompHub access key**`,
      '```',
      schluessel,
      '```',
      `Sign in at https://thecomphub.com/login/vip with the name \`${name}\`.`,
      '',
      '_This message is replaced whenever a new key is generated — the key '
      + 'above is always the valid one._',
    ].join('\n'),
  });

  const id = typeof gesendet?.id === 'string' ? gesendet.id : null;
  if (!id) return { ok: false, grund: 'abgelehnt' };

  ablage[name.toLowerCase()] = { kanal, nachricht: id };
  await schreibe(ablage);
  return { ok: true };
}
