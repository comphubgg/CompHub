import fs from '@/lib/ablageFs';
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

/**
 * Der Status der letzten Anfrage.
 *
 * Nur dafuer da, "gibt es nicht" (404) von "geht gerade nicht" zu
 * unterscheiden. Beim ersten legen wir einen neuen Kanal an, beim zweiten
 * waere das ein zweiter Kanal neben einem, der noch existiert.
 */
let letzterStatus = 0;

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

/**
 * Die Kennung des Bots selbst - einmal geholt und gemerkt.
 *
 * Gebraucht, um einem neu angelegten Kanal gleich das Recht mitzugeben,
 * dort zu schreiben. Ohne das erbt der Kanal die Regeln seiner Kategorie,
 * und die sperrt bei privaten Kanaelen alle aus, die nicht ausdruecklich
 * genannt sind - auch den Bot, der ihn gerade selbst angelegt hat.
 */
let eigeneId: string | null = null;

async function werBinIch(): Promise<string | null> {
  if (eigeneId) return eigeneId;
  const ich = await ruf('/users/@me', 'GET');
  eigeneId = idAus(ich);
  return eigeneId;
}

/**
 * Die Id aus einer Antwort - oder null.
 *
 * ruf() liefert je nach Weg ein Objekt oder eine Liste (die Rollen etwa
 * kommen als Liste). Diese eine Stelle erspart es, das an jeder Verwendung
 * auseinanderzuhalten.
 */
function idAus(antwort: Record<string, unknown> | unknown[] | null): string | null {
  if (!antwort || Array.isArray(antwort)) return null;
  return typeof antwort.id === 'string' ? antwort.id : null;
}

/** Ein Aufruf an Discord. Gibt die Antwort zurueck oder null. */
async function ruf(
  weg: string, art: 'GET' | 'POST' | 'DELETE', koerper?: unknown,
): Promise<Record<string, unknown> | unknown[] | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  letzterStatus = 0;
  try {
    const r = await fetch(`${API}${weg}`, {
      method: art,
      headers: {
        Authorization: `Bot ${token}`,
        ...(koerper ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    letzterStatus = r.status;
    // 204 kommt beim Loeschen und hat keinen Inhalt.
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.error('[discord]', art, weg, r.status,
        JSON.stringify(j).slice(0, 200));
      return null;
    }
    return j as Record<string, unknown> | unknown[];
  } catch (e) {
    console.error('[discord] nicht erreichbar:', (e as Error).message);
    return null;
  }
}

/**
 * Eine eigene Rolle je VIP.
 *
 * Der Betreiber will die Kanaele privat halten und trotzdem vorbereitet
 * sein: "eine passende Rolle fuer jeden, und wenn der User mal auf den
 * Discord kommt, kann er die Rolle bekommen und es sich jederzeit
 * ansehen."
 *
 * Die Rolle traegt keinerlei Rechte auf Serverebene (permissions "0") - sie
 * ist reine Zugehoerigkeit. Was sie darf, entscheidet allein die Regel im
 * Kanal. So kann eine vergebene Rolle nirgendwo sonst etwas aufmachen.
 *
 * Zum Anlegen braucht der Bot "Rollen verwalten". Hat er es nicht, kommt
 * null zurueck, und der Kanal entsteht trotzdem - nur eben ohne die Rolle.
 * Ein Zugangsschluessel darf nicht daran scheitern, dass eine Rolle fehlt.
 */
/**
 * Die Rolle des Betreibers - damit er seine eigenen Kanaele sieht.
 *
 * Gesucht wird nach einer Rolle mit Administratorrecht. Ueber den Namen zu
 * gehen waere geraten: er heisst auf jedem Server anders. Das Recht dagegen
 * ist eindeutig - Bit 3.
 */
async function adminRolleId(): Promise<string | null> {
  const rollen = await ruf(`/guilds/${SERVER}/roles`, 'GET');
  if (!Array.isArray(rollen)) return null;
  const ADMIN = 1n << 3n;
  const treffer = (rollen as Array<{ id: string; permissions: string; managed?: boolean }>)
    .find((r) => !r.managed && (BigInt(r.permissions || '0') & ADMIN) === ADMIN);
  return treffer?.id ?? null;
}

/**
 * Wofuer ein Kanal da ist - und damit, wie er heisst und wo er liegt.
 *
 * "vip" ist der bisherige Fall: ein Kanal je Streamer in der vorhandenen
 * Kategorie, benannt "<name>-key".
 *
 * "manager" ist neu. Ein Manager-Zugang gehoert nicht einer Person, sondern
 * einem Streamer - mehrere Leute teilen ihn sich. Es gibt deshalb auch nicht
 * je Person einen Kanal, sondern je Streamer einen, in einer eigenen
 * Kategorie. Der Betreiber: "es gibt nicht fuenfzigtausend Amar-Manager-
 * Accounts, sondern einen Kanal fuer Amar Manager, und da kommt jeder rein,
 * der zu Amar gehoert."
 */
export type KanalArt = 'vip' | 'manager';

const MANAGER_KATEGORIE = 'Manager Access Keys';

/**
 * Eine Kategorie mit diesem Namen - vorhandene oder neu angelegte.
 *
 * Gesucht wird ueber die Kanalliste des Servers; Discord fuehrt Kategorien
 * dort als Kanaele vom Typ 4. Angelegt wird sie mit derselben Sperre wie die
 * Kanaele darin: @everyone sieht nichts.
 */
async function kategorieFuer(name: string): Promise<string | null> {
  const kanaele = await ruf(`/guilds/${SERVER}/channels`, 'GET');
  if (Array.isArray(kanaele)) {
    const schon = (kanaele as Array<{ id: string; name: string; type: number }>)
      .find((k) => k.type === 4 && k.name.toLowerCase() === name.toLowerCase());
    if (schon) return schon.id;
  }
  const ich = await werBinIch();
  const regeln: Array<Record<string, string | number>> = [
    { id: SERVER, type: 0, allow: '0', deny: '1024' },
  ];
  if (ich) regeln.push({ id: ich, type: 1, allow: '76800', deny: '0' });
  const adminRolle = await adminRolleId();
  if (adminRolle) regeln.push({ id: adminRolle, type: 0, allow: '76800', deny: '0' });

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name, type: 4, permission_overwrites: regeln,
  });
  return idAus(neu);
}

async function rolleFuer(name: string): Promise<string | null> {
  const vorhandene = await ruf(`/guilds/${SERVER}/roles`, 'GET');
  if (Array.isArray(vorhandene)) {
    const schon = (vorhandene as Array<{ id: string; name: string }>)
      .find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (schon) return schon.id;
  }
  const neu = await ruf(`/guilds/${SERVER}/roles`, 'POST', {
    name,
    permissions: '0',
    mentionable: true,
  });
  return idAus(neu);
}

/**
 * Der Kanal eines VIPs - vorhandener oder neu angelegter.
 *
 * Der Name folgt dem Muster "<name>-key". Discord erlaubt in Kanalnamen
 * keine Grossbuchstaben und keine Leerzeichen; was nicht hineinpasst, wird
 * zu einem Bindestrich.
 */
async function kanalFuer(
  name: string, ablage: Ablage, art: KanalArt = 'vip',
): Promise<string | null> {
  /*
   * Der Schluessel in der Ablage trennt beide Arten.
   *
   * Sonst zeigte "groupay" auf einen der beiden Kanaele, und der andere
   * waere jedes Mal neu angelegt worden.
   */
  const schluessel = art === 'manager'
    ? `manager:${name.toLowerCase()}` : name.toLowerCase();
  const vorhanden = ablage[schluessel]?.kanal
    ?? (art === 'vip' ? BEKANNTE_KANAELE[name.toLowerCase()] : undefined);

  /*
   * Gibt es den gemerkten Kanal ueberhaupt noch?
   *
   * Der Betreiber loescht Kanaele von Hand - das ist sein gutes Recht, und
   * hier stand danach eine Kennung, hinter der nichts mehr liegt. Der
   * Schluessel wurde dann erzeugt, ging aber ins Leere, und die Meldung
   * sprach von fehlenden Rechten. Also nachsehen, und wenn er weg ist,
   * einen neuen anlegen.
   *
   * Nur wenn Discord ausdruecklich "gibt es nicht" sagt. Bei einem
   * Netzausfall oder einer Sperre bliebe der Kanal sonst bestehen und wir
   * legten daneben einen zweiten an.
   */
  if (vorhanden) {
    const da = await ruf(`/channels/${vorhanden}`, 'GET');
    if (da) return vorhanden;
    if (letzterStatus !== 404) return vorhanden;
    delete ablage[schluessel];
  }

  /*
   * Der Kanalname.
   *
   * Discord nimmt in Kanalnamen keine Grossbuchstaben und keine Leerzeichen.
   * Umlaute nimmt es zwar, aber sie sehen in einer Kanalliste unruhig aus und
   * lassen sich schlecht tippen - deshalb werden sie ausgeschrieben:
   * "hörman" wird zu "hoerman-key" und nicht zu "h-rman-key", was beim
   * blossen Wegwerfen unbekannter Zeichen herauskaeme.
   */
  const UMLAUTE: Record<string, string> = {
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
    'å': 'a', 'æ': 'ae', 'ø': 'oe', 'é': 'e', 'è': 'e', 'ê': 'e',
    'á': 'a', 'à': 'a', 'â': 'a', 'í': 'i', 'ì': 'i', 'ó': 'o', 'ò': 'o',
    'ô': 'o', 'ú': 'u', 'ù': 'u', 'ñ': 'n', 'ç': 'c',
  };
  const rein = [...name.toLowerCase()]
    .map((z) => UMLAUTE[z] ?? z)
    .join('')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const kanalname = art === 'manager' ? `${rein}-manager-keys` : `${rein}-key`;
  /*
   * Der Bot traegt sich selbst als berechtigt ein.
   *
   * Die Kategorie sperrt @everyone aus - so soll es auch sein, die Kanaele
   * sind privat. Ein neu angelegter Kanal erbt diese Regel, und damit sperrt
   * er auch den Bot aus: er darf ihn anlegen, aber nicht hineinschreiben.
   * Genau das ist passiert.
   *
   * Beim Anlegen darf man Regeln mitgeben, ohne "Rollen verwalten" zu
   * besitzen - solange man die Rechte selbst hat. Der Bot hat sie serverweit,
   * also traegt er sie hier fuer sich ein: ansehen, schreiben, aufraeumen und
   * den Verlauf lesen.
   */
  const ich = await werBinIch();
  /*
   * Die Rolle heisst wie der Zugang - bei Managern mit Zusatz.
   *
   * "amar" bekommt die Rolle "amar", die Manager von Amar bekommen "amar
   * manager". So sieht man in der Mitgliederliste auf einen Blick, wer wofuer
   * da ist, und die Rechte lassen sich getrennt vergeben.
   */
  const rollenName = art === 'manager'
    ? `${name.toLowerCase()} manager` : name.toLowerCase();
  const eigeneRolle = await rolleFuer(rollenName);

  /*
   * Die Regeln des neuen Kanals - ausdruecklich, nicht geerbt.
   *
   * @everyone wird gesperrt: der Kanal ist privat, und wer ihn sehen darf,
   * steht darunter einzeln. Sich auf die Kategorie zu verlassen waere
   * bruechig - wer sie einmal umstellt, macht damit unbemerkt alle
   * Schluesselkanaele auf.
   *
   * Dazu drei, die hineinduerfen: der Bot (sonst kann er nicht schreiben),
   * die Rolle des VIPs (die er bekommt, sobald er auf den Server kommt) und
   * die Adminrolle, damit der Betreiber selbst hineinsieht.
   */
  const regeln: Array<Record<string, string | number>> = [
    // 1024 = Kanal ansehen. Fuer alle gesperrt.
    { id: SERVER, type: 0, allow: '0', deny: '1024' },
  ];
  // 1024 ansehen + 2048 schreiben + 8192 verwalten + 65536 Verlauf
  if (ich) regeln.push({ id: ich, type: 1, allow: '76800', deny: '0' });
  // Der VIP darf lesen, nicht schreiben - der Kanal ist eine Ablage, kein Chat.
  if (eigeneRolle) regeln.push({ id: eigeneRolle, type: 0, allow: '66560', deny: '0' });
  const adminRolle = await adminRolleId();
  if (adminRolle) regeln.push({ id: adminRolle, type: 0, allow: '76800', deny: '0' });

  const eltern = art === 'manager'
    ? (await kategorieFuer(MANAGER_KATEGORIE)) ?? KATEGORIE
    : KATEGORIE;

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name: kanalname,
    type: 0,                 // Textkanal
    parent_id: eltern,
    permission_overwrites: regeln,
  });
  const id = idAus(neu);
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
/**
 * Alles zu einem Zugang in Discord wieder entfernen.
 *
 * Der Betreiber hat einen VIP geloescht und gleich darauf neu angelegt -
 * und bekam einen zweiten Kanal daneben, waehrend der erste herrenlos
 * stehen blieb: "dann soll nicht ein neuer erstellt werden, sondern der
 * alte geloescht und der neue erstellt."
 *
 * Geloescht werden der Kanal, die Rolle und der Eintrag in der eigenen
 * Ablage. Schlaegt eines davon fehl, ist das kein Grund, den Zugang im
 * Werkzeug stehen zu lassen - der Zugang ist die Hauptsache, Discord die
 * Anzeige davon. Was nicht ging, steht im Rueckgabewert.
 */
export async function loescheZugang(
  username: string, art: KanalArt = 'vip',
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'nicht eingerichtet' };
  const name = username.trim().toLowerCase();
  if (!name) return { ok: false, grund: 'kein Name' };
  const schluessel = art === 'manager' ? `manager:${name}` : name;
  const rollenName = art === 'manager' ? `${name} manager` : name;

  const ablage = await lies();
  const offen: string[] = [];

  const kanal = ablage[schluessel]?.kanal
    ?? (art === 'vip' ? BEKANNTE_KANAELE[name] : undefined);
  if (kanal) {
    const weg = await ruf(`/channels/${kanal}`, 'DELETE');
    // 404 heisst: schon weg. Das ist kein Fehler, sondern das Ziel.
    if (!weg && letzterStatus !== 404) offen.push('Kanal');
  }

  /*
   * Die Rolle heisst wie der Zugang - so legt rolleFuer sie an.
   *
   * Gesucht wird sie ueber die Liste, weil ihre Kennung nirgends gemerkt
   * ist; sie hat nie eine gebraucht, solange nur angelegt wurde.
   */
  const rollen = await ruf(`/guilds/${SERVER}/roles`, 'GET');
  if (Array.isArray(rollen)) {
    const treffer = (rollen as Array<{ id: string; name: string; managed?: boolean }>)
      .find((r) => !r.managed && r.name.toLowerCase() === rollenName);
    if (treffer) {
      const weg = await ruf(`/guilds/${SERVER}/roles/${treffer.id}`, 'DELETE');
      if (!weg && letzterStatus !== 404) offen.push('Rolle');
    }
  }

  delete ablage[schluessel];
  await schreibe(ablage);

  return offen.length
    ? { ok: false, grund: `${offen.join(' und ')} blieb stehen` }
    : { ok: true };
}

export async function schickeSchluessel(
  name: string, schluessel: string, art: KanalArt = 'vip',
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };

  const ablage = await lies();
  const kanal = await kanalFuer(name, ablage, art);
  if (!kanal) return { ok: false, grund: 'kein-kanal' };

  const merkschluessel = art === 'manager'
    ? `manager:${name.toLowerCase()}` : name.toLowerCase();
  const alt = ablage[merkschluessel]?.nachricht;
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
      /*
       * Verdeckt, bis man draufklickt.
       *
       * Discord zeigt Text zwischen zwei senkrechten Strichen erst nach
       * einem Klick - genau das, was der Betreiber wollte: "so eine Art
       * Auge zum Aufklappen, falls man gerade am Streamen ist und
       * durchschaltet." Ein offen liegender Schluessel im Kanal ist
       * genau einen Szenenwechsel von der Oeffentlichkeit entfernt.
       */
      `||\`${schluessel}\`||`,
      '',
      '_Click the grey bar to reveal the key._',
      `Sign in at https://thecomphub.com/login/vip with the name \`${name}\`.`,
      '',
      '_This message is replaced whenever a new key is generated — the key '
      + 'above is always the valid one._',
    ].join('\n'),
  });

  const id = idAus(gesendet);
  if (!id) return { ok: false, grund: 'abgelehnt' };

  ablage[name.toLowerCase()] = { kanal, nachricht: id };
  await schreibe(ablage);
  return { ok: true };
}
