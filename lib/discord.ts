import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';
import { BEITRAEGE, FARBE, type Sprache, type Sichtbar } from './discordTexte';
import { alleZugaenge } from './vipZugaenge';
import { MARKE } from './marke';

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

/*
 * Nur eine fehlende Datei gilt als leer.
 *
 * Vorher wurde jeder Lesefehler zu einer leeren Zuordnung. Antwortete die
 * Ablage nicht, kannte der Bot keinen einzigen VIP-Kanal mehr, legte einen
 * zweiten an und schrieb danach eine Zuordnung zurueck, in der nur noch
 * dieser eine stand. Jetzt bricht der Vorgang ab und wird wiederholt.
 */
async function lies(): Promise<Ablage> {
  let text: string;
  try {
    text = await fs.readFile(DATEI, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw e;
  }
  const roh = JSON.parse(text) as Ablage;
  return roh && typeof roh === 'object' ? roh : {};
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
  weg: string, art: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT',
  koerper?: unknown,
): Promise<Record<string, unknown> | unknown[] | null> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
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

/**
 * Wie der Schluesselkanal zu einem Zugang heisst.
 *
 * Discord nimmt in Kanalnamen keine Grossbuchstaben und keine Leerzeichen.
 * Umlaute nimmt es zwar, aber sie sehen in einer Kanalliste unruhig aus und
 * lassen sich schlecht tippen - deshalb werden sie ausgeschrieben: "hörman"
 * wird zu "hoerman-key" und nicht zu "h-rman-key", was beim blossen Wegwerfen
 * unbekannter Zeichen herauskaeme.
 *
 * Steht hier fuer sich, weil zwei Stellen ihn brauchen: das Anlegen und das
 * Aufraeumen verwaister Kanaele - und die beiden muessen sich auf dasselbe
 * Ergebnis verlassen koennen.
 */
const UMLAUTE: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  'å': 'a', 'æ': 'ae', 'ø': 'oe', 'é': 'e', 'è': 'e', 'ê': 'e',
  'á': 'a', 'à': 'a', 'â': 'a', 'í': 'i', 'ì': 'i', 'ó': 'o', 'ò': 'o',
  'ô': 'o', 'ú': 'u', 'ù': 'u', 'ñ': 'n', 'ç': 'c',
};

function kanalname(name: string, art: KanalArt): string {
  const rein = [...name.toLowerCase()]
    .map((z) => UMLAUTE[z] ?? z)
    .join('')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return art === 'manager' ? `${rein}-manager-keys` : `${rein}-key`;
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
   * Steht der Kanal vielleicht schon da, nur ohne Eintrag bei uns?
   *
   * Genau das ist passiert: der Zugang "hörman" hatte laengst seinen
   * #hoerman-key, aber in der Ablage stand nichts dazu - und so entstand
   * daneben ein zweiter Kanal mit demselben Namen. Der Betreiber: "es kann
   * nicht sein, dass es zwei davon hat."
   *
   * Deshalb vor dem Anlegen immer erst in der Kanalliste nachsehen. Der
   * gefundene wird uebernommen und gemerkt; angelegt wird nur, was es
   * wirklich noch nicht gibt.
   */
  const wunschname = kanalname(name, art);
  const schonDa = (await alleKanaele())
    .find((k) => k.type === 0 && k.name === wunschname);
  if (schonDa) {
    // Die gemerkte Schluesselnachricht bleibt, falls es eine gab - nur der
    // Kanal wird richtiggestellt.
    ablage[schluessel] = { ...(ablage[schluessel] ?? {}), kanal: schonDa.id };
    await schreibe(ablage);
    return schonDa.id;
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
  const kanalname_ = wunschname;
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
    name: kanalname_,
    type: 0,                 // Textkanal
    parent_id: eltern,
    permission_overwrites: regeln,
  });
  const id = idAus(neu);
  if (!id) return null;

  ablage[schluessel] = { kanal: id };
  await schreibe(ablage);

  /*
   * Der passende Leitfaden kommt gleich mit hinein.
   *
   * Der eigene Kanal ist der eine Ort, den jeder Zugang mit Sicherheit
   * sieht - die Aushaenge in der Willkommensecke sieht er nur, wenn er
   * ueberhaupt auf den Server kommt. Also steht die Anleitung dort, wo auch
   * der Schluessel steht, und zwar einmal: nur beim Anlegen des Kanals, nicht
   * bei jedem neuen Schluessel.
   */
  /*
   * Die frische Rolle darf auch den passenden Leitfaden sehen.
   *
   * Sonst stuende ein neuer VIP vor einem gesperrten #vip-guide, bis der
   * Aufbau das naechste Mal laeuft - und ein Kanal, der beim ersten Blick
   * nicht da ist, wird nie wieder gesucht.
   */
  if (eigeneRolle) {
    await leitfadenFreigeben(eigeneRolle, art === 'manager' ? 'manager' : 'vip');
  }

  const leitfaden = art === 'manager' ? 'manager-guide' : 'vip-guide';
  const hinein = await ruf(`/channels/${id}/messages`, 'POST', {
    embeds: [alsEinbettung(leitfaden, 'en')],
    ...spracheKnopf(leitfaden),
  });
  const hid = idAus(hinein);
  if (hid) await anpinnen(id, hid);

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

/**
 * Kann Discord ueberhaupt Knopfdruecke bei uns abliefern?
 *
 * Ein Knopf unter einer Nachricht ist nur so lange ein Knopf, wie es eine
 * Stelle gibt, die den Druck beantwortet - Discord schickt ihn an die
 * "Interactions Endpoint URL" der Anwendung und prueft unsere Antwort mit
 * dem oeffentlichen Schluessel. Fehlt der, sagte jeder Knopf nur
 * "interaction failed". Dann lieber keinen zeigen.
 */
export function knoepfeMoeglich(): boolean {
  return Boolean(process.env.DISCORD_PUBLIC_KEY);
}

export async function schickeSchluessel(
  name: string, schluessel: string, art: KanalArt = 'vip',
  darfWechseln = false, darfEigenen = false, anmeldename = '',
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };

  const ablage = await lies();
  const kanal = await kanalFuer(name, ablage, art);
  if (!kanal) return { ok: false, grund: 'kein-kanal' };

  const merkschluessel = art === 'manager'
    ? `manager:${name.toLowerCase()}` : name.toLowerCase();

  /*
   * Alles weg, was nicht angepinnt ist - nicht nur die gemerkte Nachricht.
   *
   * Vorher wurde genau eine Kennung geloescht, und wenn die nicht mehr
   * stimmte, stand die neue Nachricht neben der alten. Der Betreiber hat
   * genau das gesehen, als er einem VIP das Recht auf den eigenen
   * Schluessel gab: "dann kommt diese Nachricht zweimal ... es soll immer
   * maximal einer von diesen Dings haben."
   *
   * Der angepinnte Leitfaden oben im Kanal bleibt dabei stehen.
   */
  await leerRaeumen(kanal, 20, true);

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
      /*
       * Der Name, mit dem man sich anmeldet - nicht der des Kanals.
       *
       * Bei einem Manager-Zugang sind das zwei verschiedene Dinge: der
       * Kanal heisst nach dem Streamer ("gripey"), angemeldet wird sich
       * aber mit dem Zugang ("gripey-managers"). Hier stand der
       * Kanalname, und damit ein Name, mit dem niemand hineinkam.
       */
      `Sign in at https://www.thecomphub.com/sign-in/vip with the name \`${
        anmeldename || name}\`.`,
      '',
      '_This message is replaced whenever a new key is generated — the key '
      + 'above is always the valid one._',
    ].join('\n'),
    /*
     * Das Panel darunter.
     *
     * Der Betreiber wollte den Wechsel auch von Discord aus: "mach eine
     * Art Panel fuer Discord, dass man im Discord sozusagen den Access
     * Key switchen kann ... aber das wird dann auch im Tool direkt
     * angepasst." Genau das tut der Knopf: er geht denselben Weg wie der
     * im Werkzeug, und danach steht hier wieder eine einzige Nachricht
     * mit dem einen gueltigen Schluessel.
     *
     * Er erscheint nur, wenn dieser Zugang seinen Schluessel selbst
     * wechseln darf. Ein Manager-Zugang darf es nie: mehrere teilen ihn
     * sich, und einer koennte damit die anderen mitten im Stream
     * aussperren.
     */
    ...(knoepfeMoeglich() && darfWechseln ? {
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: 'Generate a new key',
            emoji: { name: '🔑' },
            custom_id: `schluessel:${name.toLowerCase()}`,
          },
          /*
           * Der eigene Schluessel - nur fuer die, die es duerfen.
           *
           * Welche VIPs ihren Schluessel selbst bestimmen duerfen, hakt der
           * Betreiber im Werkzeug an; der Knopf hier zeigt genau diesen
           * Haken. Gedrueckt oeffnet er ein Eingabefenster, das nur der
           * Druckende sieht - der Schluessel geht also nie durch den Kanal.
           */
          ...(darfEigenen ? [{
            type: 2,
            style: 2,
            label: 'Set my own key',
            emoji: { name: '✏️' },
            custom_id: `eigenerschluessel:${name.toLowerCase()}`,
          }] : []),
        ],
      }],
    } : {}),
  });

  const id = idAus(gesendet);
  if (!id) return { ok: false, grund: 'abgelehnt' };

  /*
   * Gemerkt wird unter demselben Schluessel, unter dem der Kanal steht.
   *
   * Hier stand der blosse Name - und damit schrieb eine Manager-Nachricht
   * ihren Eintrag ueber den des Streamers: der VIP-Kanal von "amar" zeigte
   * danach auf den Manager-Kanal, und die naechste Schluesselnachricht fuer
   * Amar selbst waere im falschen Kanal gelandet.
   */
  ablage[merkschluessel] = { kanal, nachricht: id };
  await schreibe(ablage);
  return { ok: true };
}

/* ====================================================================== *
 *  Der Server selbst - Kategorien, Kanaele, Berechtigungen, Beitraege
 * ====================================================================== */

/**
 * Was ein Informationskanal erlaubt.
 *
 * Lesen ja, schreiben nein: die drei Kanaele sind Aushaenge und kein Chat.
 * Gefragt wird im Support, nicht unter dem Willkommenstext - sonst steht die
 * Anleitung nach einer Woche zwischen dreissig Rueckfragen.
 *
 *   66560 = Kanal ansehen (1024) + Verlauf lesen (65536)
 *   gesperrt: schreiben (2048) und die drei Wege, einen Thread aufzumachen
 *             (2^35 + 2^36 + 2^38) - sonst ginge der Chat eben daneben auf.
 */
const LESEN = '66560';
const NICHT_SCHREIBEN = String(2048 + 2 ** 35 + 2 ** 36 + 2 ** 38);

/** Alles, was der Bot und der Betreiber in einem Kanal brauchen. */
const VOLLZUGRIFF = '76800';

interface RoherKanal {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  topic?: string | null;
}

/**
 * Alle Rollen des Servers, klein geschrieben: Name -> Kennung.
 *
 * Ueber den Namen und nicht ueber gemerkte Kennungen, weil die Rollen zu
 * verschiedenen Zeiten entstanden sind - ein Teil von Hand, ein Teil von
 * rolleFuer(). Gemeinsam haben sie nur, wie sie heissen.
 */
async function rollenListe(): Promise<Map<string, string>> {
  const roh = await ruf(`/guilds/${SERVER}/roles`, 'GET');
  const raus = new Map<string, string>();
  if (!Array.isArray(roh)) return raus;
  for (const r of roh as Array<{ id: string; name: string; managed?: boolean }>) {
    if (!r.managed) raus.set(r.name.toLowerCase(), r.id);
  }
  return raus;
}

/**
 * Welche Rollen zu den VIPs gehoeren und welche zu den Managern.
 *
 * Der Betreiber wollte die Leitfaeden getrennt sichtbar: "beim VIP Guide kann
 * der Kanal gesperrt sein, viel nur VIPs ... bei Manager Guide fuer nur
 * Manager." Also muss der Aufbau wissen, welche Rolle wofuer steht.
 *
 * Die Zuordnung kommt aus der Zugangsdatei, nicht aus den Rollennamen allein:
 * dort steht, welcher Zugang ein Manager ist. Dazu die beiden Sammelrollen,
 * die der Betreiber von Hand vergeben kann, ohne fuer jeden einen eigenen
 * Zugang anzulegen.
 */
async function zugangsRollen(): Promise<{ vip: string[]; manager: string[] }> {
  const rollen = await rollenListe();
  const vip: string[] = [];
  const manager: string[] = [];
  /*
   * Der Rollenname muss nicht Zeichen fuer Zeichen dem Zugang entsprechen.
   *
   * Der Zugang heisst "aussie-antics", die Rolle auf dem Server "AussieAntics"
   * - von Hand angelegt, lange bevor es die Zugaenge gab. Ein strenger
   * Vergleich haette diesen VIP vor einem gesperrten #vip-guide stehen lassen.
   * Verglichen wird deshalb ohne Bindestriche, Punkte und Leerzeichen.
   */
  const nackt = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nachNackt = new Map<string, string>();
  for (const [n, id] of rollen) {
    if (!nachNackt.has(nackt(n))) nachNackt.set(nackt(n), id);
  }

  const nimm = (liste: string[], name: string) => {
    const id = rollen.get(name) ?? nachNackt.get(nackt(name));
    if (id && !liste.includes(id)) liste.push(id);
  };

  nimm(vip, 'vip streamer');
  // Die Rolle fuer VIPs, die keine Streamer sind (seit 24.9.2026).
  nimm(vip, 'vip');
  nimm(manager, 'vip manager');

  for (const z of await alleZugaenge()) {
    const fuer = (z.verwaltet ?? '').trim();
    if (fuer) nimm(manager, `${fuer.toLowerCase()} manager`);
    else nimm(vip, z.username.toLowerCase());
  }

  /*
   * Und jede Rolle, die auf " manager" endet.
   *
   * Ein Sicherheitsnetz: wer die Rolle von Hand angelegt oder umbenannt hat,
   * soll den Leitfaden trotzdem sehen. Andersherum waere es schlimmer - ein
   * Manager, der vor einem gesperrten Kanal steht, fragt nach.
   */
  for (const [name, id] of rollen) {
    if (name.endsWith(' manager') && !manager.includes(id)) manager.push(id);
  }

  return { vip, manager };
}

/**
 * Einer Rolle den passenden Leitfaden zeigen.
 *
 * Ein einzelner Eintrag im Kanal, kein Neusetzen aller Regeln: die uebrigen
 * Rollen, die dort schon stehen, sollen bleiben.
 */
async function leitfadenFreigeben(rolle: string, sichtbar: Sichtbar): Promise<void> {
  const beitrag = Object.values(BEITRAEGE).find((b) => b.sichtbar === sichtbar);
  if (!beitrag) return;
  const kanaele = await alleKanaele();
  const k = kanaele.find((x) => x.type === 0 && gleich(x.name, beitrag.kanal));
  if (!k) return;
  await ruf(`/channels/${k.id}/permissions/${rolle}`, 'PUT', {
    type: 0, allow: LESEN, deny: NICHT_SCHREIBEN,
  });
}

/** Die Kanalliste des Servers - einmal je Aufbau geholt. */
async function alleKanaele(): Promise<RoherKanal[]> {
  const k = await ruf(`/guilds/${SERVER}/channels`, 'GET');
  return Array.isArray(k) ? (k as RoherKanal[]) : [];
}

const gleich = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Die Nachricht zu einem Beitrag - als Einbettung, nicht als blosser Text.
 *
 * Ein Text darf bei Discord zweitausend Zeichen haben, eine Einbettung
 * viertausend. Die Leitfaeden liegen darueber, und sie in zwei Nachrichten zu
 * zerlegen hiesse, beim naechsten Aufbau zwei Nachrichten zu ersetzen und
 * eine davon irgendwann zu vergessen.
 */
function alsEinbettung(schluessel: string, sprache: Sprache) {
  const b = BEITRAEGE[schluessel];
  return {
    title: b.titel[sprache],
    description: b.text[sprache],
    color: FARBE,
  };
}

/**
 * Der Knopf, der dieselbe Nachricht auf Deutsch zeigt.
 *
 * Nur fuer den, der drueckt. Discord kann eine Nachricht auf Klick nicht
 * umschreiben, ohne sie fuer alle zu aendern - und der englische Text ist
 * der Hauptext, "Englisch ist so das Wichtigste".
 */
function spracheKnopf(schluessel: string) {
  if (!knoepfeMoeglich()) return {};
  return {
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 2,
        // Englisch beschriftet, obwohl er auf Deutsch umschaltet - so wie
        // ein Sprachwahlknopf ueberall: er nennt das Ziel in der Sprache der
        // Seite. Der Betreiber: "einfach auf Deutsch lesen, auf Englisch
        // geschrieben."
        label: 'Read in German',
        custom_id: `sprache:de:${schluessel}`,
      }],
    }],
  };
}

/**
 * Eine Nachricht anpinnen - und die Notiz darueber wieder wegnehmen.
 *
 * Discord schreibt beim Anpinnen von selbst eine Systemzeile in den Kanal
 * ("CompHub pinned a message"). In einem Kanal, in dem genau ein Aushang
 * stehen soll, ist das die Haelfte des Inhalts. Sie traegt den Typ 6 und
 * laesst sich wie jede andere Nachricht loeschen.
 */
async function anpinnen(kanal: string, nachricht: string): Promise<void> {
  const ok = await ruf(`/channels/${kanal}/pins/${nachricht}`, 'PUT');
  if (!ok) return;
  const neueste = await ruf(`/channels/${kanal}/messages?limit=3`, 'GET');
  if (!Array.isArray(neueste)) return;
  for (const m of neueste as Array<{ id: string; type: number }>) {
    if (m.type === 6) await ruf(`/channels/${kanal}/messages/${m.id}`, 'DELETE');
  }
}

/**
 * Alle Nachrichten aus einem Kanal entfernen.
 *
 * Einzeln und nicht im Bund: der Sammelweg von Discord nimmt nur
 * Nachrichten, die juenger als vierzehn Tage sind, und die alten
 * Willkommensnachrichten sind das nicht. Zwischen den Loeschungen eine
 * kurze Pause, weil Discord beim Entfernen alter Nachrichten streng
 * begrenzt.
 */
async function leerRaeumen(
  kanal: string, hoechstens = 50, angepinnteBehalten = false,
): Promise<number> {
  const n = await ruf(`/channels/${kanal}/messages?limit=${hoechstens}`, 'GET');
  if (!Array.isArray(n)) return 0;
  let weg = 0;
  for (const m of n as Array<{ id: string; pinned?: boolean }>) {
    /*
     * Angepinntes bleibt, wo es gewuenscht ist.
     *
     * In einem Schluesselkanal steht der Leitfaden angepinnt oben; nur die
     * Schluesselnachricht darunter soll weichen. In den Aushangkanaelen ist
     * es umgekehrt - dort ist die angepinnte Nachricht genau die, die
     * ersetzt wird.
     */
    if (angepinnteBehalten && m.pinned) continue;
    const ok = await ruf(`/channels/${kanal}/messages/${m.id}`, 'DELETE');
    if (ok || letzterStatus === 404) weg += 1;
    await new Promise((r) => setTimeout(r, 350));
  }
  return weg;
}

/**
 * Einen Informationskanal anlegen oder zurechtruecken.
 *
 * Die Regeln werden bei jedem Aufbau neu gesetzt, auch bei einem Kanal, den
 * es schon gab. Das ist Absicht: wer einmal von Hand etwas aufgemacht hat,
 * soll es beim naechsten Aufbau wieder zu haben - sonst ist der Aufbau eine
 * Empfehlung und keine Festlegung.
 */
async function infoKanal(
  name: string, thema: string, kategorie: string | null, vorhandene: RoherKanal[],
  sichtbar: Sichtbar = 'alle', darfSehen: string[] = [],
): Promise<string | null> {
  const ich = await werBinIch();
  const adminRolle = await adminRolleId();
  /*
   * Wer den Kanal sehen darf.
   *
   * Bei "alle" sieht @everyone ihn und darf nur nicht schreiben. Sonst ist er
   * fuer @everyone ganz zu (1024 gesperrt), und die genannten Rollen bekommen
   * das Ansehen einzeln - schreiben duerfen auch sie nicht, ein Aushang ist
   * kein Chat.
   */
  const regeln: Array<Record<string, string | number>> = [
    sichtbar === 'alle'
      ? { id: SERVER, type: 0, allow: LESEN, deny: NICHT_SCHREIBEN }
      : { id: SERVER, type: 0, allow: '0', deny: String(1024 + Number(NICHT_SCHREIBEN)) },
  ];
  if (sichtbar !== 'alle') {
    for (const rolle of darfSehen) {
      regeln.push({ id: rolle, type: 0, allow: LESEN, deny: NICHT_SCHREIBEN });
    }
  }
  if (ich) regeln.push({ id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' });
  if (adminRolle) {
    regeln.push({ id: adminRolle, type: 0, allow: VOLLZUGRIFF, deny: '0' });
  }

  const schon = vorhandene.find((k) => k.type === 0 && gleich(k.name, name));
  if (schon) {
    await ruf(`/channels/${schon.id}`, 'PATCH', {
      topic: thema,
      ...(kategorie ? { parent_id: kategorie } : {}),
      permission_overwrites: regeln,
    });
    return schon.id;
  }

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name,
    type: 0,
    topic: thema,
    ...(kategorie ? { parent_id: kategorie } : {}),
    permission_overwrites: regeln,
  });
  return idAus(neu);
}

/**
 * Eine Zeile des Berichts.
 *
 * Getrennt in festen Satz und veraenderlichen Teil, weil die Oberflaeche
 * zweisprachig laeuft: "text" geht durch die Uebersetzung, "wert" ist ein
 * Kanalname oder eine Zahl und bleibt, wie er ist. Stuende hier ein fertiger
 * Satz mit eingesetztem Namen, waere er in der englischen Ansicht deutsch.
 */
export interface AufbauZeile { text: string; wert?: string }

export interface AufbauBericht {
  ok: boolean;
  /** Was getan wurde - Zeile fuer Zeile, damit der Admin es nachlesen kann. */
  schritte: AufbauZeile[];
  /** Was nicht ging. Leer heisst: alles ging. */
  fehler: AufbauZeile[];
}

/**
 * Den Discord-Server einrichten.
 *
 * Der Betreiber wollte das nicht erklaert, sondern getan bekommen: "Du
 * kannst das ja selber alles erstellen im Discord. Mach das vielleicht auch.
 * Du erstellst eine Welcome Post, loescht die aktuelle Welcome Post. Du
 * erstellst 'n Support ... Du erstellst alle neue Kategorien. Du machst
 * alles simpel, nicht zu viel Neues."
 *
 * Darum ist dieser Weg beliebig oft gangbar und veraendert nie mehr als
 * noetig: vorhandene Kategorien werden benutzt, nicht ersetzt; die
 * Schluesselkanaele und die privaten Notizen des Betreibers bleiben
 * unberuehrt. Was entsteht, ist eine Kategorie fuer den Support und drei
 * Aushaenge - Willkommen, VIP-Leitfaden, Manager-Leitfaden -, jeder
 * schreibgeschuetzt und jeder mit einem Knopf fuer die deutsche Fassung.
 */
export async function richteServerEin(
  { altesLoeschen = true }: { altesLoeschen?: boolean } = {},
): Promise<AufbauBericht> {
  const schritte: AufbauZeile[] = [];
  const fehler: AufbauZeile[] = [];
  if (!discordDa()) {
    return {
      ok: false, schritte, fehler: [{ text: 'Kein Bot-Token hinterlegt.' }],
    };
  }

  let kanaele = await alleKanaele();
  if (!kanaele.length) {
    return {
      ok: false, schritte, fehler: [{ text: 'Die Kanalliste kam nicht.' }],
    };
  }
  const kategorien = () => kanaele.filter((k) => k.type === 4);

  /* ------------------------------------------------------------ Support
   *
   * Er hat den Kanal schon - "das hab ich eigentlich schon, kannst Du
   * eigentlich in die passive Kategorie da machen". Also keine zweite
   * Support-Ecke daneben, sondern eine Kategorie, in die der vorhandene
   * Kanal einzieht. Gab es eine Ticket-Kategorie, wird sie dazu umbenannt:
   * zwei Kategorien fuer dieselbe Sache waeren genau das "zu viel Neues",
   * das er nicht wollte.
   */
  let support = kategorien().find((k) => gleich(k.name, 'Support'))?.id ?? null;
  if (!support) {
    const tickets = kategorien().find((k) => gleich(k.name, 'tickets'));
    if (tickets) {
      const ok = await ruf(`/channels/${tickets.id}`, 'PATCH', { name: 'Support' });
      if (ok) {
        support = tickets.id;
        schritte.push({ text: 'Kategorie umbenannt', wert: 'tickets → Support' });
      }
    }
  }
  if (!support) {
    support = await kategorieFuer('Support');
    if (support) schritte.push({ text: 'Kategorie angelegt', wert: 'Support' });
  }
  if (!support) {
    fehler.push({ text: 'Die Support-Kategorie ließ sich nicht anlegen.' });
  }

  /*
   * Der Support steht auch den Managern offen.
   *
   * Bisher sah ihn nur die Rolle "VIP STREAMER" - ein Manager stand davor wie
   * vor einer verschlossenen Tuer, obwohl er derjenige ist, der waehrend des
   * Streams etwas braucht. Der Betreiber: "dann supporte das auch einmal fuer
   * die Manager geben."
   *
   * Ansehen und Verlauf lesen; ob geschrieben werden darf, bleibt wie es ist -
   * die Tickets laufen ueber den Knopf im Kanal, nicht ueber Zurufe.
   */
  const supportRollen = await zugangsRollen();
  if (support) {
    const kanal = kanaele.find((k) => k.type === 0 && gleich(k.name, 'support'));
    if (kanal) {
      /*
       * Nur die VIP-Rollen.
       *
       * Die Manager haben ihren eigenen Kanal mit ihren eigenen Anliegen -
       * was dort besprochen wird, geht die Streamer nichts an, und
       * umgekehrt. Wer beides ist, traegt beide Rollen und sieht beides.
       */
      let dazu = 0;
      for (const rolle of supportRollen.vip) {
        const ok = await ruf(`/channels/${kanal.id}/permissions/${rolle}`, 'PUT', {
          type: 0, allow: LESEN, deny: '0',
        });
        if (ok) dazu += 1;
      }
      if (dazu) {
        schritte.push({ text: 'Support geöffnet für', wert: `${dazu} Rollen` });
      }
    }
  }

  if (support) {
    for (const name of ['support', 'transkriptionen']) {
      const k = kanaele.find((x) => x.type === 0 && gleich(x.name, name));
      if (!k || k.parent_id === support) continue;
      const ok = await ruf(`/channels/${k.id}`, 'PATCH', { parent_id: support });
      if (ok) {
        schritte.push({
          text: 'Kanal liegt jetzt unter "Support"', wert: `#${k.name}`,
        });
      } else {
        fehler.push({ text: 'Kanal ließ sich nicht verschieben', wert: `#${k.name}` });
      }
    }
  }

  /* ------------------------------------------------------- Die Aushaenge
   *
   * Sie kommen in die Kategorie, in der der Willkommenskanal schon liegt.
   * Eine eigene dafuer anzulegen hiesse, zwei Ecken fuer dasselbe zu haben.
   */
  const wk = kanaele.find((k) => k.type === 0 && gleich(k.name, 'welcome'));
  let info = wk?.parent_id ?? null;
  if (!info) {
    info = kategorien().find((k) => gleich(k.name, 'welcome'))?.id
      ?? await kategorieFuer('Welcome');
    if (info) schritte.push({ text: 'Kategorie für die Aushänge bereit.' });
  }

  /*
   * Die beiden Sammelrollen, damit es sie ueberhaupt gibt.
   *
   * "VIP STREAMER" hatte der Betreiber schon; das Gegenstueck fuer die
   * Manager fehlte. Beide tragen keinerlei Rechte auf Serverebene - was sie
   * duerfen, entscheidet allein die Regel im Kanal.
   */
  const vorherVipManager = (await rollenListe()).has('vip manager');
  await rolleFuer('VIP MANAGER');
  if (!vorherVipManager) {
    schritte.push({ text: 'Rolle angelegt', wert: 'VIP MANAGER' });
  }

  const rollen = await zugangsRollen();
  schritte.push({
    text: 'Rollen für die Leitfäden gefunden',
    wert: `${rollen.vip.length} VIP, ${rollen.manager.length} Manager`,
  });

  const ablage = await lies();

  for (const schluessel of Object.keys(BEITRAEGE)) {
    const b = BEITRAEGE[schluessel];
    kanaele = await alleKanaele();
    const kanal = await infoKanal(
      b.kanal, b.thema, info, kanaele, b.sichtbar,
      b.sichtbar === 'vip' ? rollen.vip
        : b.sichtbar === 'manager' ? rollen.manager : []);
    if (!kanal) {
      fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: `#${b.kanal}` });
      continue;
    }

    /*
     * Das Alte weg, dann das Neue.
     *
     * Beim Willkommenskanal ist das ausdruecklich gewuenscht ("loescht die
     * aktuelle Welcome Post"); bei den beiden Leitfaeden sind die
     * Nachrichten ohnehin unsere eigenen aus einem frueheren Aufbau. Wer
     * den Aufbau ohne Loeschen laufen laesst, bekommt den neuen Text
     * darunter gestellt und raeumt selbst auf.
     */
    if (altesLoeschen) {
      const weg = await leerRaeumen(kanal);
      if (weg) {
        schritte.push({
          text: 'Alte Nachrichten entfernt', wert: `#${b.kanal} (${weg})`,
        });
      }
    }

    const gesendet = await ruf(`/channels/${kanal}/messages`, 'POST', {
      embeds: [alsEinbettung(schluessel, 'en')],
      ...spracheKnopf(schluessel),
    });
    const id = idAus(gesendet);
    if (!id) {
      fehler.push({ text: 'Der Text wurde abgelehnt', wert: `#${b.kanal}` });
      continue;
    }
    // Angepinnt, damit er auch in einem Jahr oben steht.
    await anpinnen(kanal, id);
    ablage[`post:${schluessel}`] = { kanal, nachricht: id };
    schritte.push({ text: 'Aushang steht', wert: `#${b.kanal}` });
  }

  await schreibe(ablage);

  /*
   * Das Ticket-Panel im Support-Kanal.
   *
   * Zum Schluss, weil es den Kanal voraussetzt, den der Aufbau eben erst an
   * seinen Platz geschoben hat.
   */
  /*
   * Die Interaktions-Adresse eintragen - falls sie noch fehlt.
   *
   * Ohne sie liefert Discord jeden Knopfdruck an einen dauerhaft verbundenen
   * Bot aus, findet keinen und meldet nach drei Sekunden "die Anwendung hat
   * nicht rechtzeitig reagiert". Genau davor stand der Betreiber, und er
   * schloss daraus, der Bot muesse rund um die Uhr laufen - was gerade nicht
   * noetig ist, sobald diese Adresse steht.
   *
   * Sie laesst sich mit dem Bot-Token selbst setzen; das Portal ist dafuer
   * nicht noetig. Discord prueft sie beim Setzen mit einem unterschriebenen
   * Anklopfversuch - geht es durch, funktioniert sie auch.
   */
  if (knoepfeMoeglich()) {
    const wo = process.env.WERKZEUG_URL || 'https://www.thecomphub.com';
    const ziel = `${wo.replace(/\/+$/, '')}/api/discord/interaktion`;
    const jetzt = await ruf('/applications/@me', 'GET');
    const gesetzt = (jetzt && !Array.isArray(jetzt))
      ? String(jetzt.interactions_endpoint_url ?? '') : '';
    if (gesetzt !== ziel) {
      const ok = await ruf('/applications/@me', 'PATCH', {
        interactions_endpoint_url: ziel,
      });
      schritte.push(ok
        ? { text: 'Interaktions-Adresse eingetragen', wert: ziel }
        : { text: 'Interaktions-Adresse abgelehnt', wert: ziel });
    }
  }

  const panel = await ticketPanel();
  schritte.push(panel.ok
    ? { text: 'Ticket-Panel steht', wert: '#support' }
    : { text: 'Ticket-Panel blieb aus', wert: panel.grund });

  /*
   * Und der Support fuer die Manager - eigener Kanal, eigene Liste.
   *
   * Nur fuer die Managerrollen sichtbar: was dort besprochen wird, geht die
   * Streamer nichts an, und umgekehrt.
   */
  kanaele = await alleKanaele();
  const mSupport = await infoKanal(
    'manager-support', 'Support for VIP managers', support, kanaele,
    'manager', rollen.manager);
  if (mSupport) {
    /*
     * Hier darf geschrieben werden - anders als in den Aushaengen. Das
     * Ticket entsteht zwar in einem eigenen Kanal, aber wer nur kurz etwas
     * fragen will, soll nicht vor einem stummen Kanal stehen.
     */
    for (const rolle of rollen.manager) {
      await ruf(`/channels/${mSupport}/permissions/${rolle}`, 'PUT', {
        type: 0, allow: LESEN, deny: '0',
      });
    }
    const mPanel = await ticketPanel('manager-support', true);
    schritte.push(mPanel.ok
      ? { text: 'Ticket-Panel steht', wert: '#manager-support' }
      : { text: 'Ticket-Panel blieb aus', wert: mPanel.grund });
  } else {
    fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: '#manager-support' });
  }

  // Update-Kanaele, Get-Access und der Admin-Bereich - siehe unten.
  await richteUpdatesEin(schritte, fehler);
  await richteZugangEin(schritte, fehler);
  await richteAdminEin(schritte, fehler);

  if (!knoepfeMoeglich()) {
    schritte.push({
      text: 'Ohne DISCORD_PUBLIC_KEY gibt es keine Knöpfe — weder für Deutsch '
        + 'noch für den Schlüsselwechsel. Sie erscheinen, sobald der Schlüssel '
        + 'hinterlegt und die Interactions-URL eingetragen ist.',
    });
  }

  return { ok: fehler.length === 0, schritte, fehler };
}

/**
 * Den deutschen Text zu einem Beitrag - fuer den Knopf unter der Nachricht.
 *
 * Liegt hier und nicht in der Route, damit die Route nichts ueber den Aufbau
 * der Texte wissen muss.
 */
export function beitragEinbettung(schluessel: string, sprache: Sprache) {
  if (!BEITRAEGE[schluessel]) return null;
  return alsEinbettung(schluessel, sprache);
}

/**
 * Welcher Kanal zu diesem Zugang gehoert - soweit wir es gemerkt haben.
 *
 * Gebraucht von der Knopf-Route: sie muss wissen, ob ein Druck wirklich aus
 * dem Kanal kam, zu dem der Knopf gehoert. Angelegt wird hier nichts - wer
 * keinen Kanal hat, bekommt null.
 */
export async function gemerkterKanal(
  name: string, art: KanalArt = 'vip',
): Promise<string | null> {
  const klein = name.trim().toLowerCase();
  if (!klein) return null;
  // Nur lesend: antwortet die Ablage nicht, bleiben die fest bekannten.
  let ablage: Ablage = {};
  try { ablage = await lies(); } catch { /* siehe unten */ }
  const schluessel = art === 'manager' ? `manager:${klein}` : klein;
  return ablage[schluessel]?.kanal
    ?? (art === 'vip' ? BEKANNTE_KANAELE[klein] ?? null : null);
}

/**
 * Alle Schluesselkanaele in Ordnung bringen.
 *
 * Der Betreiber hat die Schluessel eine Zeit lang selbst in die Kanaele
 * geschrieben, bevor es den Bot gab: "es gibt noch ein paar Kanaele, wo ich
 * es noch reingeschrieben habe als normaler User. Es soll immer der Bot drin
 * sein." Von Hand geschriebene Nachrichten kann der Bot spaeter nicht
 * ersetzen - er weiss nichts von ihnen -, und so standen in manchen Kanaelen
 * zwei Schluessel untereinander.
 *
 * Dieser Weg raeumt jeden Kanal leer und schreibt den gueltigen Schluessel
 * neu hinein, vom Bot, mit dem Knopf darunter. Der Schluessel selbst bleibt
 * derselbe - "neu aufschreiben", nicht "neu erzeugen"; ein neuer Schluessel
 * haette jeden VIP mitten im Betrieb ausgesperrt.
 *
 * Nebenbei werden die Rechte im Kanal richtiggestellt. Die alten Kanaele
 * gaben der Rolle nur "Kanal ansehen" und nicht "Verlauf lesen" - wer
 * hineinsah, fand den Kanal leer, weil die Schluesselnachricht vor seinem
 * Besuch geschrieben wurde. Genau das war der Grund, warum ueberhaupt jemand
 * anfing, Schluessel von Hand nachzureichen.
 */
export async function schluesselAufraeumen(): Promise<AufbauBericht> {
  const schritte: AufbauZeile[] = [];
  const fehler: AufbauZeile[] = [];
  if (!discordDa()) {
    return {
      ok: false, schritte, fehler: [{ text: 'Kein Bot-Token hinterlegt.' }],
    };
  }

  const ich = await werBinIch();
  const adminRolle = await adminRolleId();
  const rollen = await rollenListe();
  const nackt = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nachNackt = new Map<string, string>();
  for (const [n, id] of rollen) {
    if (!nachNackt.has(nackt(n))) nachNackt.set(nackt(n), id);
  }

  for (const z of await alleZugaenge()) {
    const fuer = (z.verwaltet ?? '').trim();
    const art: KanalArt = fuer ? 'manager' : 'vip';
    const ziel = fuer || z.username;

    const ablage = await lies();
    const kanal = await kanalFuer(ziel, ablage, art);
    if (!kanal) {
      fehler.push({ text: 'Kein Kanal', wert: z.username });
      continue;
    }

    /*
     * Die Rechte neu setzen - ausdruecklich und vollstaendig.
     *
     * Ansehen allein genuegt nicht: ohne "Verlauf lesen" (65536) sieht der
     * VIP einen leeren Kanal. Schreiben darf er nicht, der Kanal ist eine
     * Ablage.
     */
    const rollenName = art === 'manager'
      ? `${ziel.toLowerCase()} manager` : ziel.toLowerCase();
    const eigene = rollen.get(rollenName) ?? nachNackt.get(nackt(rollenName));
    const regeln: Array<Record<string, string | number>> = [
      { id: SERVER, type: 0, allow: '0', deny: '1024' },
    ];
    if (ich) regeln.push({ id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' });
    if (eigene) regeln.push({ id: eigene, type: 0, allow: LESEN, deny: '2048' });
    if (adminRolle) {
      regeln.push({ id: adminRolle, type: 0, allow: VOLLZUGRIFF, deny: '0' });
    }
    await ruf(`/channels/${kanal}`, 'PATCH', { permission_overwrites: regeln });

    // Angepinntes bleibt stehen: der Leitfaden oben im Kanal soll nicht mitgehen.
    const weg = await leerRaeumen(kanal, 50, true);

    /*
     * Und der Schluessel neu.
     *
     * Der Knopf darunter steht jedem VIP zu, nicht nur denen mit dem Recht
     * im Werkzeug: der Kanal ist privat, und genau dafuer ist er da - "wenn
     * er zum Beispiel grade keinen Access hat auf seinen Account, dann kann
     * er's ueber den Discord machen". Ein Manager-Zugang bekommt ihn nie.
     */
    const hin = await schickeSchluessel(
      ziel, z.accessKey, art, art === 'vip',
      art === 'vip' && Boolean(z.darfSchluessel), z.username);
    if (hin.ok) {
      schritte.push({
        text: 'Schlüssel neu geschrieben',
        wert: `${z.username}${weg ? ` (${weg} alte entfernt)` : ''}`,
      });
    } else {
      fehler.push({ text: 'Schlüssel blieb aus', wert: `${z.username} — ${hin.grund}` });
    }
  }

  /*
   * Und die Kanaele, zu denen es keinen Zugang mehr gibt.
   *
   * Sie stammen aus der Zeit, in der das Loeschen den Kanal noch stehen
   * liess. Der Betreiber hat sie ausdruecklich freigegeben: "wenn es diese
   * Nutzer nicht mehr gibt, diese VIPs, dann kannst Du auch deren Channel
   * loeschen."
   *
   * Angefasst wird nur, was eindeutig ein Schluesselkanal ist - "<name>-key"
   * oder "<name>-manager-keys" - und wozu kein Zugang mehr gehoert. Alles
   * andere auf dem Server bleibt unberuehrt, auch wenn es leer aussieht.
   */
  const erwartet = new Set<string>();
  for (const z of await alleZugaenge()) {
    const fuer = (z.verwaltet ?? '').trim();
    erwartet.add(kanalname(fuer || z.username, fuer ? 'manager' : 'vip'));
  }

  /*
   * Und Dopplungen.
   *
   * Zwei Kanaele mit demselben Namen sind immer ein Fehler - Discord laesst
   * sie zu, aber niemand weiss dann, in welchem der gueltige Schluessel
   * steht. Behalten wird der, auf den unsere Ablage zeigt; gibt es keinen
   * solchen, der aelteste, weil dort die Leute schon drin sind.
   */
  const ablageJetzt = await lies();
  const gemerkt = new Set(Object.values(ablageJetzt).map((e) => e.kanal));
  const nachNamen = new Map<string, RoherKanal[]>();
  for (const k of await alleKanaele()) {
    if (k.type !== 0) continue;
    if (!nachNamen.has(k.name)) nachNamen.set(k.name, []);
    nachNamen.get(k.name)!.push(k);
  }
  for (const [name, gleiche] of nachNamen) {
    if (gleiche.length < 2) continue;
    if (!name.endsWith('-key') && !name.endsWith('-manager-keys')) continue;
    // Discord vergibt Kennungen aufsteigend - die kleinste ist die aelteste.
    const sortiert = [...gleiche].sort((a, b) => (a.id < b.id ? -1 : 1));
    const behalten = sortiert.find((k) => gemerkt.has(k.id)) ?? sortiert[0];
    for (const k of sortiert) {
      if (k.id === behalten.id) continue;
      const weg = await ruf(`/channels/${k.id}`, 'DELETE');
      if (weg || letzterStatus === 404) {
        schritte.push({ text: 'Doppelter Kanal entfernt', wert: `#${k.name}` });
      } else {
        fehler.push({ text: 'Doppelter Kanal blieb stehen', wert: `#${k.name}` });
      }
    }
  }

  for (const k of await alleKanaele()) {
    if (k.type !== 0) continue;
    const istSchluesselkanal = k.name.endsWith('-key')
      || k.name.endsWith('-manager-keys');
    if (!istSchluesselkanal || erwartet.has(k.name)) continue;
    const weg = await ruf(`/channels/${k.id}`, 'DELETE');
    if (weg || letzterStatus === 404) {
      schritte.push({ text: 'Verwaister Kanal entfernt', wert: `#${k.name}` });
    } else {
      fehler.push({ text: 'Verwaister Kanal blieb stehen', wert: `#${k.name}` });
    }
  }

  if (!knoepfeMoeglich()) {
    schritte.push({
      text: 'Ohne DISCORD_PUBLIC_KEY gibt es keine Knöpfe — weder für Deutsch '
        + 'noch für den Schlüsselwechsel. Sie erscheinen, sobald der Schlüssel '
        + 'hinterlegt und die Interactions-URL eingetragen ist.',
    });
  }

  return { ok: fehler.length === 0, schritte, fehler };
}

/* ====================================================================== *
 *  Support - Tickets im eigenen Bot
 * ====================================================================== */

/*
 * Warum ein eigenes Ticketsystem.
 *
 * Der Betreiber hatte ein fremdes Bot-Werkzeug dafuer und wollte es lieber
 * selbst haben: "Du kannst auch ueber meinen Bot in den Support Creator
 * Ticket System einbauen ... dann sieht's ein bisschen geiler aus, alles von
 * mir persoenlich, nicht von 'nem anderen Bot." Und es soll ausdruecklich
 * auch den VIP-Managern offenstehen.
 *
 * Es laeuft ueber dieselbe Interaktions-Adresse wie die uebrigen Knoepfe -
 * kein zweiter Bot, kein dauerhaft laufendes Programm, keine Kosten.
 */

/**
 * Wofuer jemand Hilfe braucht.
 *
 * Der Betreiber wollte, dass man vorher sagt, worum es geht: "wo man
 * entscheiden kann, was fuer Support Sie brauchen." Das spart die erste
 * Rueckfrage und sortiert die Kanaele - an "ticket-marc" sieht man nicht, ob
 * es brennt oder ob jemand eine Idee hat.
 *
 * Der Wert ist die Kennung, die im Knopfdruck zurueckkommt; er darf sich
 * deshalb nicht mehr aendern.
 */
export interface TicketArt {
  wert: string; titel: string; was: string; emoji: string;
}

/**
 * Die Anliegen eines VIPs.
 *
 * Ein Streamer fragt nach anderen Dingen als jemand, der waehrend des Streams
 * seine Overlays betreut - der Betreiber wollte das getrennt: "natuerlich gibt
 * es da nicht die gleichen Sachen wie fuer die VIPs."
 */
export const TICKET_ARTEN: TicketArt[] = [
  { wert: 'kaputt', emoji: '🐛', titel: 'Something is broken',
    was: 'A page does not load, a button does nothing, an overlay is blank.' },
  { wert: 'zahlen', emoji: '📊', titel: 'Wrong or missing numbers',
    was: 'A stat looks wrong, a cup is missing, a player is not found.' },
  { wert: 'overlay', emoji: '🖼️', titel: 'Overlay or stream graphics',
    was: 'It should look different, show something else, or fit your layout.' },
  { wert: 'zugang', emoji: '🔑', titel: 'Access or key',
    was: 'You cannot sign in, or you need a key for a manager.' },
  { wert: 'wunsch', emoji: '✨', titel: 'Something new',
    was: 'A page only for you, a feature, an idea. Ask for anything.' },
  { wert: 'sonst', emoji: '💬', titel: 'Something else',
    was: 'Anything that does not fit above.' },
];

/**
 * Die Anliegen eines VIP-Managers.
 *
 * Enger gefasst, weil sein Zugang enger ist: er kommt an die Overlays eines
 * Streamers und sonst nichts. Was er dort erlebt - ein Overlay, das im Stream
 * nicht nachzieht, ein Spieler, der sich nicht einfuegen laesst, ein Name, der
 * nicht eingetragen ist -, steht hier und nirgends sonst.
 */
export const TICKET_ARTEN_MANAGER: TicketArt[] = [
  { wert: 'obs', emoji: '📺', titel: 'Overlay does not update on stream',
    was: 'You changed something and OBS still shows the old state.' },
  { wert: 'spieler', emoji: '👥', titel: 'A player is missing',
    was: 'Someone cannot be added, or the wrong duo shows up.' },
  { wert: 'anmelden', emoji: '🔑', titel: 'Cannot sign in',
    was: 'Your name is not registered, or the key does not work.' },
  { wert: 'aussehen', emoji: '🖼️', titel: 'Overlay should look different',
    was: 'Other columns, other colours, another layout for the stream.' },
  { wert: 'wunsch', emoji: '✨', titel: 'Idea for the tool',
    was: 'Something that would make your work during a stream easier.' },
  { wert: 'sonst', emoji: '💬', titel: 'Something else',
    was: 'Anything that does not fit above.' },
];

/** Wie ein Ticketkanal heisst. Ein Kanal je Person, nicht je Anliegen. */
function ticketName(nutzer: string, fuerManager = false): string {
  const rein = [...nutzer.toLowerCase()]
    .map((z) => UMLAUTE[z] ?? z)
    .join('')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  /*
   * Zwei Vorsilben, damit dieselbe Person beides offen haben kann.
   *
   * Wer als Streamer eine kaputte Seite meldet und zugleich als Manager ein
   * Overlay bespricht, soll dafuer nicht denselben Kanal benutzen muessen.
   */
  return `${fuerManager ? 'mticket' : 'ticket'}-${rein || 'support'}`;
}

/**
 * Das Panel im Support-Kanal.
 *
 * Eine Nachricht mit einem Knopf, mehr nicht. Sie wird bei jedem Aufbau
 * ersetzt, damit dort nie zwei stehen.
 */
export async function ticketPanel(
  kanalName = 'support', fuerManager = false,
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };
  const kanaele = await alleKanaele();
  const support = kanaele.find((k) => k.type === 0 && gleich(k.name, kanalName));
  if (!support) return { ok: false, grund: 'kein-kanal' };

  const arten = fuerManager ? TICKET_ARTEN_MANAGER : TICKET_ARTEN;
  const merk = fuerManager ? 'ticket:panel:manager' : 'ticket:panel';

  const ablage = await lies();
  const alt = ablage[merk]?.nachricht;
  if (alt) await ruf(`/channels/${support.id}/messages/${alt}`, 'DELETE');

  const gesendet = await ruf(`/channels/${support.id}/messages`, 'POST', {
    embeds: [{
      title: fuerManager ? 'Manager support' : 'Support',
      description: [
        fuerManager
          ? 'Something in the way while you are looking after a stream? Pick '
            + 'it below and you get your own private channel. Only you and '
            + 'Juanito can see it.'
          : 'Pick what you need below and you get your own private channel. '
            + 'Only you and Juanito can see it.',
        '',
        ...arten.map((a) => `${a.emoji} **${a.titel}** — ${a.was}`),
        '',
        'Not everything is possible and nothing is instant, but you always get '
        + 'a straight yes or no.',
      ].join('\n'),
      color: FARBE,
    }],
    ...(knoepfeMoeglich() ? {
      components: [{
        type: 1,
        components: [{
          /*
           * Eine Auswahlliste statt eines Knopfes.
           *
           * Ein Knopf haette dieselbe Frage im Kanal noch einmal gestellt.
           * So steht die Antwort schon fest, bevor der Kanal entsteht.
           */
          type: 3,
          custom_id: fuerManager ? 'ticket:art:manager' : 'ticket:art',
          placeholder: 'What do you need?',
          min_values: 1,
          max_values: 1,
          options: arten.map((a) => ({
            label: a.titel,
            value: a.wert,
            description: a.was.slice(0, 100),
            emoji: { name: a.emoji },
          })),
        }],
      }],
    } : {}),
  });

  const id = idAus(gesendet);
  if (!id) return { ok: false, grund: 'abgelehnt' };
  ablage[merk] = { kanal: support.id, nachricht: id };
  await schreibe(ablage);
  return { ok: true };
}

/**
 * Ein Ticket aufmachen - oder das vorhandene nennen.
 *
 * Ein Kanal je Person: wer zweimal drueckt, bekommt keinen zweiten, sondern
 * den Hinweis auf seinen offenen. Sonst haette der Betreiber nach einer Woche
 * dreissig Kanaele fuer dieselben drei Leute.
 */
export async function ticketOeffnen(
  nutzerId: string, nutzerName: string, art = 'sonst', fuerManager = false,
  /** Eigene Begruessung - fuer ein Gespraech, das der Admin anstoesst. */
  anlass?: { titel: string; text: string },
): Promise<{ ok: boolean; kanal?: string; schonDa?: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };

  const name = ticketName(nutzerName, fuerManager);
  const kanaele = await alleKanaele();
  const schon = kanaele.find((k) => k.type === 0 && k.name === name);
  if (schon) return { ok: true, kanal: schon.id, schonDa: true };

  const support = kanaele.find((k) => k.type === 0
    && gleich(k.name, fuerManager ? 'manager-support' : 'support'));
  const kategorie = support?.parent_id ?? await kategorieFuer('Support');

  const ich = await werBinIch();
  const adminRolle = await adminRolleId();
  const regeln: Array<Record<string, string | number>> = [
    { id: SERVER, type: 0, allow: '0', deny: '1024' },
    // 1024 ansehen + 2048 schreiben + 65536 Verlauf - der Ticketkanal ist
    // ein Gespraech, kein Aushang.
    { id: nutzerId, type: 1, allow: '68608', deny: '0' },
  ];
  if (ich) regeln.push({ id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' });
  if (adminRolle) {
    regeln.push({ id: adminRolle, type: 0, allow: VOLLZUGRIFF, deny: '0' });
  }

  const gewaehlt = (fuerManager ? TICKET_ARTEN_MANAGER : TICKET_ARTEN)
    .find((a) => a.wert === art);

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name,
    type: 0,
    ...(kategorie ? { parent_id: kategorie } : {}),
    topic: `Support — ${nutzerName} — ${
      TICKET_ARTEN.find((a) => a.wert === art)?.titel ?? 'Something else'}`,
    permission_overwrites: regeln,
  });
  const id = idAus(neu);
  if (!id) return { ok: false, grund: 'abgelehnt' };

  await ruf(`/channels/${id}/messages`, 'POST', {
    content: `<@${nutzerId}>`,
    allowed_mentions: { users: [nutzerId] },
    embeds: [{
      title: anlass?.titel ?? (gewaehlt ? `${gewaehlt.emoji} ${gewaehlt.titel}` : 'How can I help?'),
      description: anlass ? `${anlass.text}\n\nPress **Close** when you are done.` : [
        'Write what you need — a screenshot helps more than a description.',
        '',
        'Useful things to mention: which page, which cup, and what you '
        + 'expected to see instead.',
        '',
        'Press **Close** when you are done.',
      ].join('\n'),
      color: FARBE,
    }],
    ...(knoepfeMoeglich() ? {
      components: [{
        type: 1,
        components: [{
          type: 2, style: 4, label: 'Close', custom_id: 'ticket:zu',
        }],
      }],
    } : {}),
  });

  return { ok: true, kanal: id };
}

/**
 * Ein Ticket schliessen.
 *
 * Vorher wandert der Verlauf als Textdatei in den Archivkanal - ein
 * geschlossenes Ticket soll nachlesbar bleiben, ohne dass der Kanal stehen
 * bleibt.
 *
 * Ob im Verlauf etwas steht, haengt an einer Einstellung, die nicht hier
 * getroffen wird: ohne die Berechtigung "Message Content" gibt Discord einem
 * Bot den Text fremder Nachrichten nicht heraus, und das Archiv enthaelt dann
 * nur Absender und Zeit. Das steht dann auch so in der Datei, statt eine
 * leere Aufzeichnung als vollstaendig auszugeben.
 */
export async function ticketSchliessen(
  kanal: string,
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };

  const wer = await ruf(`/channels/${kanal}`, 'GET');
  const name = (wer && !Array.isArray(wer) && typeof wer.name === 'string')
    ? wer.name : 'ticket';
  if (!name.startsWith('ticket-') && !name.startsWith('mticket-') && !name.startsWith('chat-')) {
    return { ok: false, grund: 'kein-ticket' };
  }

  const roh = await ruf(`/channels/${kanal}/messages?limit=100`, 'GET');
  const zeilen: string[] = [`# ${name}`, ''];
  let leer = 0;
  if (Array.isArray(roh)) {
    const nachrichten = [...roh as Array<{
      content?: string; timestamp?: string;
      author?: { username?: string; bot?: boolean };
    }>].reverse();
    for (const m of nachrichten) {
      const wann = (m.timestamp ?? '').slice(0, 19).replace('T', ' ');
      const text = (m.content ?? '').trim();
      if (!text) leer += 1;
      zeilen.push(`[${wann}] ${m.author?.username ?? '?'}: ${text || '(—)'}`);
    }
  }
  if (leer) {
    zeilen.push('');
    zeilen.push(`(${leer} Nachricht(en) ohne Text — dem Bot fehlt die `
      + 'Berechtigung "Message Content".)');
  }

  const archiv = (await alleKanaele())
    .find((k) => k.type === 0 && gleich(k.name, 'transkriptionen'));
  if (archiv) {
    /*
     * Als Datei, nicht als Nachricht.
     *
     * Ein langes Gespraech sprengt sonst die zweitausend Zeichen, die eine
     * Discord-Nachricht fasst - und eine abgeschnittene Aufzeichnung ist
     * schlimmer als keine.
     */
    const form = new FormData();
    form.append('payload_json', JSON.stringify({
      content: `Ticket geschlossen: **${name}**`,
    }));
    form.append('files[0]', new Blob([zeilen.join('\n')], { type: 'text/plain' }),
      `${name}.txt`);
    const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
    await fetch(`${API}/channels/${archiv.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}` },
      body: form,
    }).catch(() => null);
  }

  const weg = await ruf(`/channels/${kanal}`, 'DELETE');
  if (!weg && letzterStatus !== 404) return { ok: false, grund: 'nicht geloescht' };
  return { ok: true };
}

/* ==================================================================== */
/* ============================================ Updates und Zugang ==== */
/* ==================================================================== */

/*
 * Der Betreiber will den Server zu einem offenen Community-Discord ausbauen:
 *
 *   - Update-Kanaele: "es gibt VIP Updates, es gibt Manager Updates und es
 *     gibt fuer jeden Update ... ein kleiner Bericht, was updated wurde".
 *   - Get Access: "wenn zum Beispiel ein VIP sich als VIP registrieren will,
 *     kann er dort irgendwas druecken ... nachher muss er da Sachen
 *     ausfuellen, wie seine Social Media, wieso er genau Access will ... das
 *     wird in einen Admin-Channel geschickt ... und dann kann ich Decline
 *     oder Accept nehmen." Bei Decline eine DM mit Grund, bei Accept
 *     Schluessel, Konto, Kanal, Rolle und DM - alles von selbst.
 *
 * Ein Server genuegt: Sichtbarkeit regeln die Rollen, die Anfragen sieht
 * nur der Admin. Nichts hier laeuft dauerhaft - jeder Knopf kommt als
 * Anfrage ueber die Interactions-Adresse (app/api/discord/interaktion).
 */

const UPDATE_KANAELE = { alle: 'updates', vip: 'vip-updates', manager: 'manager-updates' } as const;
export type UpdateZiel = keyof typeof UPDATE_KANAELE;
export type UpdateArt = 'neu' | 'behoben' | 'geaendert';

const ZUGANG_PANEL = 'get-access';
const ZUGANG_ANFRAGEN = 'access-requests';

/** Die Kanaele fuer Updates und Zugang anlegen - Teil des Server-Aufbaus. */
export async function richteUpdatesEin(
  schritte: AufbauZeile[], fehler: AufbauZeile[],
): Promise<void> {
  const kanaele = await alleKanaele();
  const kategorie = await kategorieFuer('Updates');
  const rollen = await zugangsRollen();
  const plan: Array<[UpdateZiel, string, Sichtbar, string[]]> = [
    ['alle', 'What is new on CompHub - for everyone', 'alle', []],
    ['vip', 'Updates that only VIPs get', 'vip', rollen.vip],
    ['manager', 'Updates for managers', 'manager', rollen.manager],
  ];
  for (const [ziel, thema, sichtbar, darf] of plan) {
    const id = await infoKanal(UPDATE_KANAELE[ziel], thema, kategorie, kanaele, sichtbar, darf);
    if (id) schritte.push({ text: 'Update-Kanal steht', wert: `#${UPDATE_KANAELE[ziel]}` });
    else fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: `#${UPDATE_KANAELE[ziel]}` });
  }
}

/**
 * Ein Update in den passenden Kanal - Titel, Datum, kurz was es ist.
 *
 * Der Betreiber: "dann schreibst du mal der Bug, der Titel, Datum, nachher
 * beschrieben, kurz, was es ist. Und schickst das an den Channel."
 */
export async function schickeUpdate(
  { ziel, art, titel, text }: { ziel: UpdateZiel; art: UpdateArt; titel: string; text: string },
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };
  let kanaele = await alleKanaele();
  let kanal = kanaele.find((k) => k.type === 0 && gleich(k.name, UPDATE_KANAELE[ziel]));
  if (!kanal) {
    await richteUpdatesEin([], []);
    kanaele = await alleKanaele();
    kanal = kanaele.find((k) => k.type === 0 && gleich(k.name, UPDATE_KANAELE[ziel]));
  }
  if (!kanal) return { ok: false, grund: 'kein-kanal' };
  const vorsatz = art === 'neu' ? 'NEW' : art === 'behoben' ? 'FIXED' : 'CHANGED';
  const gesendet = await ruf(`/channels/${kanal.id}/messages`, 'POST', {
    embeds: [{
      title: `${vorsatz} · ${titel}`.slice(0, 256),
      description: text.slice(0, 4000),
      color: FARBE,
      footer: { text: new Date().toISOString().slice(0, 10) },
    }],
  });
  return idAus(gesendet) ? { ok: true } : { ok: false, grund: 'abgelehnt' };
}

/* ------------------------------------------------------------- Admin */

/*
 * Der Admin-Bereich: nur der Betreiber (Admin-Rolle) und der Bot sehen ihn.
 *
 *   #admin-log       nach jeder Aufgabe ein Bericht - "egal wie unnoetig"
 *   #admin-aufgaben  eine gepflegte Liste der offenen Aufgaben (eine
 *                    Nachricht, die fortgeschrieben wird)
 *   #admin-alarm     was von selbst schiefgeht: der stuendliche Lauf,
 *                    veraltete Staende, die Ablage
 */
const ADMIN_KANAELE = { log: 'admin-log', aufgaben: 'admin-aufgaben', alarm: 'admin-alarm' } as const;

export async function richteAdminEin(
  schritte: AufbauZeile[], fehler: AufbauZeile[],
): Promise<void> {
  const kanaele = await alleKanaele();
  const kategorie = await kategorieFuer('Admin');
  const plan: Array<[keyof typeof ADMIN_KANAELE, string]> = [
    ['log', 'Every task, every fix - the full log'],
    ['aufgaben', 'Open tasks - one message, kept up to date'],
    ['alarm', 'Alerts: hourly run, stale data, storage'],
  ];
  for (const [k, thema] of plan) {
    // "manager" mit leerer Rollenliste heisst: nur Admin und Bot.
    const id = await infoKanal(ADMIN_KANAELE[k], thema, kategorie, kanaele, 'manager', []);
    if (id) schritte.push({ text: 'Admin-Kanal steht', wert: `#${ADMIN_KANAELE[k]}` });
    else fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: `#${ADMIN_KANAELE[k]}` });
  }
  // Das Werkzeug: #admin-tools mit den Knoepfen und der Befehl /comphub.
  const werkzeug = await werkzeugEinrichten();
  (werkzeug.ok ? schritte : fehler).push({ text: 'Admin-Werkzeug', wert: werkzeug.text });
}

/* ------------------------------------------------------------ Zugang */

export type ZugangArt = 'vip' | 'manager';

/*
 * Zwei Arten VIP.
 *
 * Der Betreiber (24.9.2026): "es gibt ja die VIP-Streamer-Rolle, und dann
 * mach noch eine eigene VIP-Rolle, die nicht Streamer sind, sondern einfach
 * VIPs. Dann kann ich immer entscheiden, wenn ich eine Request akzeptiere, ob
 * er ein VIP ist oder VIP-Streamer." Beide sehen dieselben Kanaele (Guide,
 * VIP-Updates, Support).
 */
export type VipStufe = 'vip' | 'streamer';
const STUFE_NAME: Record<VipStufe, string> = { vip: 'VIP', streamer: 'VIP Streamer' };

export interface ZugangAnfrage {
  id: string;
  nutzerId: string;
  nutzerName: string;
  art: ZugangArt;
  /** Der gewuenschte Zugangsname (ohne Leerzeichen). */
  name: string;
  socials: string;
  grund: string;
  /** Bei Managern: fuer welchen Streamer. */
  streamer?: string;
  kanal?: string;
  nachricht?: string;
  status: 'offen' | 'angenommen' | 'abgelehnt' | 'gescheitert' | 'geloescht';
  /** Bei VIPs: als VIP oder als VIP Streamer angenommen. */
  stufe?: VipStufe;
  /** Die wievielte Anfrage dieser Person das ist (1 = die erste). */
  nummer?: number;
  zeit: string;
  entschieden?: string;
  von?: string;
  ergebnis?: string;
}

const ANFRAGEN_DATEI = path.join(DATEN_ORT, 'discord-anfragen.json');

/*
 * Die abgelegten Anfragen - oder ein Fehler, wenn die Ablage nicht antwortet.
 *
 * Nicht mehr "leer bei jedem Fehler": am 24.9.2026 antwortete Supabase
 * nicht, die Anfrage von Pollo kam nie in der Ablage an, und Accept meldete
 * "This request no longer exists". Wer die Anfrage braucht, nimmt jetzt
 * anfrageFinden(): zuerst die Ablage, sonst die Discord-Nachricht selbst.
 */
async function liesAnfragen(): Promise<Record<string, ZugangAnfrage>> {
  let text: string;
  try {
    text = await fs.readFile(ANFRAGEN_DATEI, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(text) as Record<string, ZugangAnfrage>;
}

/** Die Anfragen, oder null, wenn die Ablage gerade nicht antwortet. */
async function anfragenOderNichts(): Promise<Record<string, ZugangAnfrage> | null> {
  try { return await liesAnfragen(); } catch { return null; }
}

/** Die Nachricht, an der ein Knopf haengt - so, wie Discord sie mitschickt. */
export interface KnopfNachricht {
  id?: string; channel_id?: string; content?: string;
  embeds?: Array<{
    title?: string;
    fields?: Array<{ name?: string; value?: string }>;
    footer?: { text?: string };
  }>;
}

/**
 * Eine Anfrage aus ihrer Discord-Nachricht zurueckgewinnen.
 *
 * In der Nachricht steht alles, was eine Entscheidung braucht: wer (die
 * Erwaehnung), welcher Zugangsname, welche Art, und die Kennung unten. Fehlt
 * die Anfrage in der Ablage, weil die beim Eingang nicht antwortete, geht es
 * damit trotzdem.
 */
export function anfrageAusNachricht(m?: KnopfNachricht | null): ZugangAnfrage | null {
  const e = m?.embeds?.[0];
  if (!m?.id || !e) return null;
  const feld = (n: string) => String(e.fields?.find((f) => f.name === n)?.value ?? '').trim();
  const nutzerId = /<@!?(\d+)>/.exec(feld('Discord'))?.[1] ?? /<@!?(\d+)>/.exec(m.content ?? '')?.[1];
  const id = /Request\s+(\S+)/.exec(e.footer?.text ?? '')?.[1];
  const name = feld('Access name');
  if (!nutzerId || !id || !name) return null;
  const art: ZugangArt = /^manager/i.test(e.title ?? '') ? 'manager' : 'vip';
  const ohneStrich = (x: string) => (x === '—' ? '' : x);
  return {
    id, nutzerId, art, name,
    nutzerName: /\(([^)]+)\)/.exec(feld('Discord'))?.[1] ?? name,
    socials: ohneStrich(feld('Socials')),
    grund: ohneStrich(feld('Why')),
    ...(art === 'manager' ? { streamer: feld('Manages') } : {}),
    kanal: m.channel_id, nachricht: m.id,
    status: 'offen', zeit: new Date().toISOString(),
  };
}

/**
 * Die Knoepfe unter einer Anfrage, je nach Stand.
 *
 * Offen: Accept, Decline, Chat, Message. Danach bleiben Chat und Message -
 * der Betreiber will auch nach der Entscheidung noch mit der Person reden
 * koennen -, und nach einem Accept kommt "Delete access" dazu.
 */
function anfrageKnoepfe(a: Pick<ZugangAnfrage, 'id' | 'status' | 'art'>) {
  if (!knoepfeMoeglich()) return [];
  const { id, status: stand, art } = a;
  const k: Array<Record<string, unknown>> = [];
  if (stand === 'offen') {
    if (art === 'vip') {
      // Beim Annehmen gleich entscheiden: VIP oder VIP Streamer.
      k.push({ type: 2, style: 3, label: 'Accept as VIP', custom_id: `zugang:ok:${id}:vip` });
      k.push({ type: 2, style: 3, label: 'Accept as VIP Streamer', custom_id: `zugang:ok:${id}:streamer` });
    } else {
      k.push({ type: 2, style: 3, label: 'Accept', custom_id: `zugang:ok:${id}` });
    }
    k.push({ type: 2, style: 4, label: 'Decline', custom_id: `zugang:nein:${id}` });
  }
  k.push({ type: 2, style: 2, label: 'Chat', custom_id: `zugang:chat:${id}` });
  k.push({ type: 2, style: 2, label: 'Message as CompHub', custom_id: `zugang:dm:${id}` });
  if (stand === 'angenommen') {
    // Spaeter umstufen, ohne den Zugang anzufassen.
    if (art === 'vip') {
      k.push({ type: 2, style: 1, label: 'Make VIP', custom_id: `zugang:stufe:${id}:vip` });
      k.push({ type: 2, style: 1, label: 'Make VIP Streamer', custom_id: `zugang:stufe:${id}:streamer` });
    }
    k.push({ type: 2, style: 4, label: 'Delete access', custom_id: `zugang:weg:${id}` });
  }
  return [{ type: 1, components: k }];
}

/** Wann die Anfrage einging - aus der Kennung der Nachricht, sonst aus der Ablage. */
function anfrageSeit(a: ZugangAnfrage): number {
  if (a.nachricht && /^\d{15,}$/.test(a.nachricht)) {
    return Number((BigInt(a.nachricht) >> BigInt(22)) + BigInt(1420070400000));
  }
  return Date.parse(a.zeit) || 0;
}

/*
 * Die Rolle "VIP" - bei Bedarf angelegt, mit denselben Kanalfreigaben wie
 * VIP STREAMER: ueberall, wo VIP STREAMER etwas sehen darf, darf VIP es auch.
 * Legt der Bot sie selbst an, steht sie unter seiner eigenen Rolle - dann
 * darf er sie auch vergeben.
 */
async function vipRolleBereit(): Promise<string | null> {
  const rollen = await rollenListe();
  const id = rollen.get('vip') ?? await rolleFuer('VIP');
  const streamer = rollen.get('vip streamer');
  if (!id || !streamer) return id;
  const kanaele = await ruf(`/guilds/${SERVER}/channels`, 'GET');
  if (!Array.isArray(kanaele)) return id;
  for (const k of kanaele as Array<{
    id: string; permission_overwrites?: Array<{ id: string; allow: string; deny: string }>;
  }>) {
    const vorlage = k.permission_overwrites?.find((o) => o.id === streamer);
    if (!vorlage) continue;
    const schon = k.permission_overwrites?.find((o) => o.id === id);
    if (schon && schon.allow === vorlage.allow && schon.deny === vorlage.deny) continue;
    await ruf(`/channels/${k.id}/permissions/${id}`, 'PUT', { type: 0, allow: vorlage.allow, deny: vorlage.deny });
  }
  return id;
}

/*
 * Eine Rolle vergeben und merken, wenn Discord ablehnt.
 *
 * Ein Bot darf nur Rollen vergeben, die unter seiner eigenen stehen. Am
 * 24.9.2026 stand "VIP STREAMER" ueber "CompHub" - AIR bekam deshalb nur
 * seine eigene Rolle und sah weder Support noch Guide, ohne dass es jemand
 * erfuhr. Jetzt steht die Absage in der Antwort an den Admin.
 */
async function rolleGeben(nutzerId: string, rolle: string, name: string, fehler: string[]) {
  const erg = await ruf(`/guilds/${SERVER}/members/${nutzerId}/roles/${rolle}`, 'PUT');
  if (erg === null) fehler.push(name);
}
const ROLLEN_HINWEIS = (fehler: string[]) => (fehler.length
  ? ` Discord refused the role${fehler.length > 1 ? 's' : ''} ${fehler.join(', ')}: in Server Settings > Roles, `
    + 'drag the CompHub role above them, then press the button again.'
  : '');
async function schreibeAnfragen(a: Record<string, ZugangAnfrage>): Promise<void> {
  await fs.mkdir(path.dirname(ANFRAGEN_DATEI), { recursive: true });
  await fs.writeFile(ANFRAGEN_DATEI, JSON.stringify(a, null, 2));
}

/**
 * Eine Anfrage festhalten, wenn es geht.
 *
 * Nur wenn die Liste vorher wirklich gelesen wurde - sonst stuende danach
 * allein diese eine darin. Scheitert das Schreiben, geht es trotzdem weiter:
 * die Nachricht in Discord traegt alles, was spaeter gebraucht wird.
 */
async function anfrageMerken(liste: Record<string, ZugangAnfrage> | null, a: ZugangAnfrage) {
  if (!liste) return;
  liste[a.id] = a;
  try { await schreibeAnfragen(liste); } catch (e) {
    console.error('[discord] Anfrage nicht abgelegt:', (e as Error).message);
  }
}

/** Die Anfrage zu dieser Kennung: aus der Ablage, sonst aus der Nachricht. */
async function anfrageFinden(id: string, ausNachricht?: ZugangAnfrage | null) {
  const liste = await anfragenOderNichts();
  const gespeichert = liste?.[id];
  // Der Stand steht in der Ablage; fehlt sie, gilt die Nachricht - an der
  // haengen ja genau die Knoepfe, die zum jeweiligen Stand passen.
  const a = gespeichert ?? (ausNachricht && ausNachricht.id === id ? ausNachricht : null);
  return { liste, a };
}

/** Der Aushang mit dem Knopf und der private Kanal fuer die Anfragen. */
export async function richteZugangEin(
  schritte: AufbauZeile[], fehler: AufbauZeile[],
): Promise<void> {
  const kanaele = await alleKanaele();
  const kategorie = await kategorieFuer('Access');
  const panel = await infoKanal(ZUGANG_PANEL, 'Ask for VIP or manager access', kategorie, kanaele, 'alle', []);
  const anfragen = await infoKanal(ZUGANG_ANFRAGEN, 'Access requests - only the admin sees this', kategorie, kanaele, 'manager', []);
  if (!panel) { fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: `#${ZUGANG_PANEL}` }); return; }
  if (!anfragen) fehler.push({ text: 'Kanal ließ sich nicht anlegen', wert: `#${ZUGANG_ANFRAGEN}` });

  const ablage = await lies();
  const alt = ablage['zugang:panel']?.nachricht;
  if (alt) await ruf(`/channels/${panel}/messages/${alt}`, 'DELETE');
  const gesendet = await ruf(`/channels/${panel}/messages`, 'POST', {
    embeds: [{
      title: 'Get access',
      description: [
        '**VIP access** is for pro players, streamers and creators: your own '
        + 'private channel, overlays, and the VIP views on thecomphub.com.',
        '**Manager access** is for people who run the overlays for a VIP.',
        '',
        'Press a button, fill in your socials and why you want access. Juanito '
        + 'reads every request and you get a direct message with the answer - '
        + 'accepted or declined, always with a reason.',
      ].join('\n'),
      color: FARBE,
    }],
    ...(knoepfeMoeglich() ? {
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Get VIP access', custom_id: 'zugang:anfragen:vip' },
          { type: 2, style: 2, label: 'Get manager access', custom_id: 'zugang:anfragen:manager' },
        ],
      }],
    } : {}),
  });
  const id = idAus(gesendet);
  if (!id) { fehler.push({ text: 'Der Text wurde abgelehnt', wert: `#${ZUGANG_PANEL}` }); return; }
  ablage['zugang:panel'] = { kanal: panel, nachricht: id };
  await schreibe(ablage);
  schritte.push({ text: 'Get-Access-Aushang steht', wert: `#${ZUGANG_PANEL}` });
}

/** Das Eingabefenster nach dem Knopf. */
export function zugangFormular(art: ZugangArt) {
  const feld = (custom_id: string, label: string, style: 1 | 2, placeholder: string, required = true, max = 400) => ({
    type: 1, components: [{ type: 4, custom_id, label, style, placeholder, required, max_length: max, min_length: required ? 2 : 0 }],
  });
  return {
    type: 9,
    data: {
      custom_id: `zugang:formular:${art}`,
      title: art === 'vip' ? 'VIP access' : 'Manager access',
      components: [
        feld('name', 'Your name (as it should appear)', 1, 'e.g. Malibuca', true, 24),
        ...(art === 'manager' ? [feld('streamer', 'Streamer you manage', 1, 'the VIP name', true, 24)] : []),
        feld('socials', 'Your socials (name or link, one per line)', 2, 'Twitch: ...\nX: ...\nTikTok: ...\nYouTube: ...'),
        feld('grund', 'Why do you want access?', 2, 'A few sentences are enough.', true, 800),
      ],
    },
  };
}

/** Den Wunschnamen in einen Zugangsnamen bringen - wie in der Verwaltung. */
function zugangsName(roh: string): string {
  const rein = roh.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_.-]/gu, '');
  return rein.slice(0, 24);
}

/**
 * Eine Anfrage ablegen und dem Admin zeigen - mit Accept und Decline.
 */
export async function zugangAnfrage(
  { nutzerId, nutzerName, art, felder }: {
    nutzerId: string; nutzerName: string; art: ZugangArt; felder: Record<string, string>;
  },
): Promise<{ ok: boolean; grund?: string }> {
  if (!discordDa()) return { ok: false, grund: 'kein-token' };
  const name = zugangsName(felder.name ?? '');
  if (name.length < 3) return { ok: false, grund: 'name' };

  const kanaele = await alleKanaele();
  let anfragenKanal = kanaele.find((k) => k.type === 0 && gleich(k.name, ZUGANG_ANFRAGEN))?.id ?? null;
  if (!anfragenKanal) {
    await richteZugangEin([], []);
    anfragenKanal = (await alleKanaele()).find((k) => k.type === 0 && gleich(k.name, ZUGANG_ANFRAGEN))?.id ?? null;
  }
  if (!anfragenKanal) return { ok: false, grund: 'kein-kanal' };

  // Antwortet die Ablage nicht, geht die Anfrage trotzdem durch - die
  // Nachricht mit den Knoepfen traegt alles Noetige (anfrageAusNachricht).
  const anfragen = await anfragenOderNichts();
  // Eine offene Anfrage je Person und Art - kein Stapel derselben Bitte.
  const offen = Object.values(anfragen ?? {}).find((a) => a.nutzerId === nutzerId && a.art === art && a.status === 'offen');
  if (offen) return { ok: false, grund: 'schon-offen' };

  /*
   * Die wievielte Anfrage ist das?
   *
   * Der Betreiber (24.9.2026): "wenn er nochmal eine Request schickt, soll
   * ich sehen, dass es seine zweite ist - dritte, vierte, fuenfte". Gezaehlt
   * wird ueber das Discord-Konto: in der Ablage und in den letzten hundert
   * Nachrichten des Anfragen-Kanals, damit auch Anfragen zaehlen, die die
   * Ablage waehrend eines Ausfalls nie gesehen hat.
   */
  const frueher = new Set(Object.values(anfragen ?? {}).filter((x) => x.nutzerId === nutzerId).map((x) => x.id));
  const alte = await ruf(`/channels/${anfragenKanal}/messages?limit=100`, 'GET');
  if (Array.isArray(alte)) {
    for (const m of alte as KnopfNachricht[]) {
      const z = anfrageAusNachricht(m);
      if (z && z.nutzerId === nutzerId) frueher.add(z.id);
    }
  }
  const nummer = frueher.size + 1;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const anfrage: ZugangAnfrage = {
    id, nutzerId, nutzerName, art, name,
    socials: (felder.socials ?? '').trim().slice(0, 800),
    grund: (felder.grund ?? '').trim().slice(0, 1200),
    ...(art === 'manager' ? { streamer: zugangsName(felder.streamer ?? '') } : {}),
    status: 'offen', zeit: new Date().toISOString(), nummer,
  };

  const gesendet = await ruf(`/channels/${anfragenKanal}/messages`, 'POST', {
    content: `New ${art === 'vip' ? 'VIP' : 'manager'} request from <@${nutzerId}>`
      + (nummer > 1 ? ` · **${ordnungszahl(nummer)} request**` : ''),
    embeds: [{
      title: `${art === 'vip' ? 'VIP' : 'Manager'} access · ${name}`,
      color: FARBE,
      fields: [
        { name: 'Discord', value: `<@${nutzerId}> (${nutzerName})`, inline: true },
        { name: 'Access name', value: name, inline: true },
        { name: 'Request', value: nummer > 1 ? `${ordnungszahl(nummer)} from this person` : 'first', inline: true },
        ...(anfrage.streamer ? [{ name: 'Manages', value: anfrage.streamer, inline: true }] : []),
        { name: 'Socials', value: anfrage.socials || '—' },
        { name: 'Why', value: anfrage.grund || '—' },
      ],
      footer: { text: `Request ${id}` },
    }],
    components: anfrageKnoepfe({ id, status: 'offen', art }),
  });
  const nachricht = idAus(gesendet);
  if (!nachricht) return { ok: false, grund: 'abgelehnt' };
  anfrage.kanal = anfragenKanal;
  anfrage.nachricht = nachricht;
  await anfrageMerken(anfragen, anfrage);
  return { ok: true };
}

/** Eine Direktnachricht - oder false, wenn die Person keine annimmt. */
async function direktnachricht(nutzerId: string, inhalt: Record<string, unknown>): Promise<boolean> {
  const dm = await ruf('/users/@me/channels', 'POST', { recipient_id: nutzerId });
  const kanal = idAus(dm);
  if (!kanal) return false;
  const ok = Boolean(idAus(await ruf(`/channels/${kanal}/messages`, 'POST', inhalt)));
  // Merken, damit die Antworten spaeter unter "DM inbox" zu sehen sind.
  if (ok) await dmMerken(nutzerId, kanal);
  return ok;
}

/** Die Anfrage-Nachricht nach der Entscheidung ohne Knoepfe, mit Ergebnis. */
async function anfrageAbschliessen(a: ZugangAnfrage, zeile: string): Promise<void> {
  if (!a.kanal || !a.nachricht) return;
  await ruf(`/channels/${a.kanal}/messages/${a.nachricht}`, 'PATCH', {
    content: zeile,
    components: anfrageKnoepfe(a),
  });
}

/**
 * Annehmen: Zugang anlegen, Kanal und Rolle, Schluessel hinein, Rolle an
 * die Person, Direktnachricht. Oder ablehnen: Direktnachricht mit Grund.
 */
export async function zugangEntscheiden(
  id: string, angenommen: boolean, von: string, grund = '',
  ausNachricht?: ZugangAnfrage | null, stufe: VipStufe = 'streamer',
  /**
   * Wie lange der Zugang gilt - beim Annehmen gewaehlt ("Infinity oder ein
   * spezielles Datum", der Betreiber am 25.9.2026). Ohne: unbegrenzt.
   */
  bis: number | null = null,
): Promise<{ ok: boolean; text: string }> {
  const { liste: anfragen, a } = await anfrageFinden(id, ausNachricht);
  if (!a) return { ok: false, text: 'I cannot find this request - neither in storage nor in the message.' };
  if (a.status !== 'offen') return { ok: false, text: `Already decided: ${a.status}.` };

  if (!angenommen) {
    a.status = 'abgelehnt'; a.entschieden = new Date().toISOString(); a.von = von; a.ergebnis = grund;
    await anfrageMerken(anfragen, a);
    const dm = await direktnachricht(a.nutzerId, {
      embeds: [{
        title: `Your ${a.art === 'vip' ? 'VIP' : 'manager'} request was declined`,
        description: `**Reason:** ${grund}\n\nYou can ask again later in #${ZUGANG_PANEL}.`,
        color: FARBE,
      }],
    });
    await anfrageAbschliessen(a, `Declined by ${von} · ${grund}${dm ? '' : ' · (DM could not be delivered)'}`);
    return { ok: true, text: dm ? 'Declined - the person got a DM with your reason.' : 'Declined - but the DM could not be delivered (closed DMs).' };
  }

  /* --------------------------------------------------------- Anlegen */
  // Erst pruefen, ob die Kanal-Zuordnung lesbar ist. Sonst stuende gleich ein
  // Zugang ohne Schluesselnachricht da, und ein zweiter Klick liefe in
  // "gibt es schon". Wirft hier etwas, ist noch nichts angelegt.
  await lies();
  const { neuerSchluessel, schonVergeben } = await import('./zugangsSchluessel');
  const { alleZugaenge: zugaenge, schreibeZugaenge } = await import('./vipZugaenge');
  const users = await zugaenge();
  const name = a.name;
  const streamer = (a.streamer ?? '').trim();
  if (a.art === 'manager') {
    const da = streamer && users.some((u) => u.username.toLowerCase() === streamer.toLowerCase());
    if (!da) return { ok: false, text: `No VIP named "${streamer || '?'}" - a manager access needs an existing VIP. Decline or create the VIP first.` };
  }
  /*
   * Gibt es den Zugang schon, kommt es darauf an, seit wann.
   *
   * Entstand er erst nach dieser Anfrage, war es ein Accept derselben
   * Anfrage, das mittendrin abbrach (so bei Pollo am 24.9.2026: Zugang
   * angelegt, dann antwortete die Ablage nicht mehr - kein Kanal, keine
   * Rolle). Dann geht es dort weiter. Aelter heisst: ein anderer VIP traegt
   * den Namen, und dessen Schluessel gibt es hier nicht.
   */
  const vorhanden = users.find((u) => u.username.toLowerCase() === name.toLowerCase());
  let schluessel: string;
  if (vorhanden) {
    if (!(Date.parse(vorhanden.createdAt || '') >= anfrageSeit(a))) {
      return { ok: false, text: `There is already an access named "${name}". Create it by hand in the admin panel or decline.` };
    }
    schluessel = vorhanden.accessKey;
    vorhanden.discordId = a.nutzerId; vorhanden.discordName = a.nutzerName;
    if (a.art === 'vip') vorhanden.stufe = stufe;
    await schreibeZugaenge(users);
  } else {
    schluessel = neuerSchluessel('');
    for (let i = 0; schonVergeben(schluessel, users, name) && i < 5; i += 1) schluessel = neuerSchluessel('');
    users.push({
      username: name, accessKey: schluessel, status: 'active', createdAt: new Date().toISOString(),
      // Wer das ist - fuer Chat, Frist und Loeschen im VIP-Panel.
      discordId: a.nutzerId, discordName: a.nutzerName,
      ...(a.art === 'vip' ? { stufe } : {}),
      ...(a.art === 'manager' ? { rolle: 'manager' as const, rechte: ['overlays'], verwaltet: streamer, darfSchluessel: false, mods: [name] } : {}),
    });
    await schreibeZugaenge(users);
  }

  const kanalArt: KanalArt = a.art === 'manager' ? 'manager' : 'vip';
  const hin = await schickeSchluessel(a.art === 'manager' ? streamer : name, schluessel, kanalArt, a.art === 'vip', false, name);

  // Rollen: die eigene des Zugangs und die Sammelrolle - VIP oder VIP
  // Streamer, wie beim Annehmen gewaehlt.
  const rollen = await rollenListe();
  const eigenName = a.art === 'manager' ? `${streamer} manager` : name;
  const eigene = await rolleFuer(eigenName);
  const sammel = a.art === 'manager' ? rollen.get('vip manager') ?? null
    : stufe === 'vip' ? await vipRolleBereit() : rollen.get('vip streamer') ?? null;
  const sammelName = a.art === 'manager' ? 'VIP MANAGER' : stufe === 'vip' ? 'VIP' : 'VIP STREAMER';
  const rollenFehler: string[] = [];
  if (eigene) await rolleGeben(a.nutzerId, eigene, eigenName, rollenFehler);
  if (sammel) await rolleGeben(a.nutzerId, sammel, sammelName, rollenFehler);
  if (a.art === 'vip') a.stufe = stufe;

  const kanal = await gemerkterKanal(a.art === 'manager' ? streamer : name, kanalArt);
  a.status = 'angenommen'; a.entschieden = new Date().toISOString(); a.von = von;
  a.ergebnis = hin.ok ? 'Schluessel im Kanal' : `Schluessel nicht gesendet: ${hin.grund}`;
  await anfrageMerken(anfragen, a);

  /*
   * Die Person gleich im eigenen Kanal markieren.
   *
   * Der Betreiber: "wenn sie einen Access Key bekommen, sollst du ihn auch
   * immer gleich markieren." Die Direktnachricht kommt nicht immer an
   * (geschlossene DMs) - eine Erwaehnung im Kanal schon.
   */
  if (kanal && hin.ok) {
    await ruf(`/channels/${kanal}/messages`, 'POST', {
      content: `<@${a.nutzerId}> your access is ready - the key is right above.`,
      allowed_mentions: { users: [a.nutzerId] },
    });
  }

  const dm = await direktnachricht(a.nutzerId, {
    embeds: [{
      title: `Welcome - your ${a.art === 'vip' ? 'VIP' : 'manager'} access is ready`,
      description: [
        `Your access name is **${name}**.`,
        kanal ? `Your key is waiting in your private channel <#${kanal}> on the CompHub server.` : 'Your key is in your private channel on the CompHub server.',
        'Sign in at https://www.thecomphub.com/sign-in/vip with the access name and the key.',
      ].join('\n'),
      color: FARBE,
    }],
  });
  const alsWas = a.art === 'vip' ? ` as ${STUFE_NAME[stufe]}` : '';
  // Die Laufzeit gleich mit setzen - vipFrist schreibt sie und meldet sie per DM.
  const frist = bis ? await vipFrist(name, bis) : null;
  const bisText = bis ? ` · until ${TAG_EN(bis)}` : ' · unlimited';
  await anfrageAbschliessen(a, `Accepted by ${von} · access "${name}"${alsWas}${bisText}${kanal ? ` · <#${kanal}>` : ''}${dm ? '' : ' · (DM could not be delivered)'}`);
  return {
    ok: true,
    text: `Accepted${alsWas} - access "${name}" ${vorhanden ? 'finished' : 'created'}${kanal ? `, key in <#${kanal}>` : ''}`
      + `${dm ? ', DM sent.' : ', but the DM could not be delivered (closed DMs).'}${ROLLEN_HINWEIS(rollenFehler)}`
      + (frist ? ` ${frist.text}` : ' No end date.'),
  };
}

/** Einen angenommenen VIP umstufen: VIP oder VIP Streamer. */
export async function zugangStufe(
  id: string, stufe: VipStufe, ausNachricht?: ZugangAnfrage | null,
): Promise<{ ok: boolean; text: string }> {
  const { liste, a } = await anfrageFinden(id, ausNachricht);
  if (!a) return { ok: false, text: 'I cannot find this request.' };
  if (a.art !== 'vip') return { ok: false, text: 'Only VIP accesses have this choice.' };
  const rollen = await rollenListe();
  const ziel = stufe === 'vip' ? await vipRolleBereit() : rollen.get('vip streamer') ?? null;
  const andere = stufe === 'vip' ? rollen.get('vip streamer') : rollen.get('vip');
  const fehler: string[] = [];
  if (ziel) await rolleGeben(a.nutzerId, ziel, stufe === 'vip' ? 'VIP' : 'VIP STREAMER', fehler);
  if (andere && !fehler.length) {
    const weg = await ruf(`/guilds/${SERVER}/members/${a.nutzerId}/roles/${andere}`, 'DELETE');
    if (weg === null) fehler.push(stufe === 'vip' ? 'VIP STREAMER (remove)' : 'VIP (remove)');
  }
  a.stufe = stufe;
  await anfrageMerken(liste, a);
  if (fehler.length) return { ok: false, text: `Not done.${ROLLEN_HINWEIS(fehler)}` };
  return { ok: true, text: `Done - ${a.name} is now ${STUFE_NAME[stufe]}.` };
}

/**
 * Ein Gespraech mit der Person, die angefragt hat.
 *
 * Der Betreiber: "einen Chat eroeffnen, ein Ticket-Chat, dass er automatisch
 * markiert wird ... und ich kann darueber schreiben, ja okay, aber das und
 * das erwarte ich." Ein privater Ticketkanal wie beim Support, nur von hier
 * aus geoeffnet und mit passender Begruessung.
 */
export async function zugangChat(
  id: string, ausNachricht?: ZugangAnfrage | null,
): Promise<{ ok: boolean; text: string }> {
  const { a } = await anfrageFinden(id, ausNachricht);
  if (!a) return { ok: false, text: 'I cannot find this request.' };
  const erg = await ticketOeffnen(a.nutzerId, a.nutzerName, 'zugang', a.art === 'manager', {
    titel: `About your ${a.art === 'vip' ? 'VIP' : 'manager'} access request`,
    text: `Juanito would like to talk to you about your request for **${a.name}**. Just reply here.`,
  });
  if (!erg.ok || !erg.kanal) return { ok: false, text: 'The chat could not be opened.' };
  return { ok: true, text: erg.schonDa ? `There is already a chat: <#${erg.kanal}>` : `Chat open: <#${erg.kanal}>` };
}

/**
 * Eine Nachricht im Namen von CompHub.
 *
 * Der Betreiber schreibt den Text, der Bot schickt ihn - als
 * Direktnachricht, und wenn die Person keine annimmt, in ihren eigenen
 * Kanal (oder ein Gespraech) mit Erwaehnung.
 */
export async function zugangNachricht(
  id: string, text: string, ausNachricht?: ZugangAnfrage | null,
): Promise<{ ok: boolean; text: string }> {
  const { a } = await anfrageFinden(id, ausNachricht);
  if (!a) return { ok: false, text: 'I cannot find this request.' };
  const inhalt = {
    embeds: [{ title: 'Message from CompHub', description: text.slice(0, 3900), color: FARBE }],
  };
  if (await direktnachricht(a.nutzerId, inhalt)) return { ok: true, text: 'Sent as a direct message from CompHub.' };

  const kanal = await gemerkterKanal(a.art === 'manager' ? (a.streamer ?? a.name) : a.name,
    a.art === 'manager' ? 'manager' : 'vip');
  const ziel = kanal ?? (await ticketOeffnen(a.nutzerId, a.nutzerName, 'zugang', a.art === 'manager', {
    titel: 'Message from CompHub', text: 'You have a message from CompHub below.',
  })).kanal;
  if (!ziel) return { ok: false, text: 'Direct messages are closed and no channel could be used.' };
  const hin = await ruf(`/channels/${ziel}/messages`, 'POST', {
    content: `<@${a.nutzerId}>`, allowed_mentions: { users: [a.nutzerId] }, ...inhalt,
  });
  return idAus(hin)
    ? { ok: true, text: `DMs are closed - posted in <#${ziel}> with a mention instead.` }
    : { ok: false, text: 'The message could not be delivered.' };
}

/**
 * Einen Zugang wieder loeschen - mit Grund.
 *
 * Der Zugang faellt aus der Liste (Anmeldung geht nicht mehr), die Rollen
 * werden abgenommen, die Person bekommt den Grund als Direktnachricht. Der
 * Kanal mit dem Verlauf bleibt stehen; sehen kann ihn die Person ohne die
 * Rolle nicht mehr.
 */
export async function zugangLoeschen(
  id: string, grund: string, von: string, ausNachricht?: ZugangAnfrage | null,
): Promise<{ ok: boolean; text: string }> {
  const { liste, a } = await anfrageFinden(id, ausNachricht);
  if (!a) return { ok: false, text: 'I cannot find this request.' };
  const { alleZugaenge, schreibeZugaenge } = await import('./vipZugaenge');
  // Streng gelesen: antwortet die Ablage nicht, wirft das hier - eine leere
  // Liste zurueckzuschreiben wuerde sonst jeden Zugang loeschen.
  const users = await alleZugaenge();
  const rest = users.filter((u) => u.username.toLowerCase() !== a.name.toLowerCase());
  const hatteZugang = rest.length !== users.length;
  if (hatteZugang) await schreibeZugaenge(rest);

  const rollen = await rollenListe();
  const streamer = (a.streamer ?? '').trim();
  for (const r of [
    rollen.get((a.art === 'manager' ? `${streamer} manager` : a.name).toLowerCase()),
    ...(a.art === 'manager' ? [rollen.get('vip manager')] : [rollen.get('vip streamer'), rollen.get('vip')]),
  ]) {
    if (r) await ruf(`/guilds/${SERVER}/members/${a.nutzerId}/roles/${r}`, 'DELETE');
  }

  const dm = await direktnachricht(a.nutzerId, {
    embeds: [{
      title: `Your ${a.art === 'vip' ? 'VIP' : 'manager'} access was removed`,
      description: `**Reason:** ${grund}\n\nYou can ask again later in #${ZUGANG_PANEL}.`,
      color: FARBE,
    }],
  });
  a.status = 'geloescht'; a.entschieden = new Date().toISOString(); a.von = von; a.ergebnis = grund;
  await anfrageMerken(liste, a);
  await anfrageAbschliessen(a, `Access deleted by ${von} · ${grund}${dm ? '' : ' · (DM could not be delivered)'}`);
  return {
    ok: true,
    text: `${hatteZugang ? `Access "${a.name}" deleted` : `There was no access named "${a.name}" (anymore)`}`
      + `, roles removed${dm ? ', DM with your reason sent.' : ' - the DM could not be delivered.'}`,
  };
}

/** Darf diese Person Anfragen entscheiden? Admin-Rolle oder Betreiber-Konto. */
export async function darfEntscheiden(nutzer: { id?: string; username?: string } | undefined, rollen: string[]): Promise<boolean> {
  const admin = await adminRolleId();
  if (admin && rollen.includes(admin)) return true;
  const erlaubt = (process.env.ALLOWED_DISCORD_USERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const name = (nutzer?.username ?? '').toLowerCase();
  return Boolean(name && erlaubt.includes(name));
}

/* ---------------------------------------------------------- Einladung */

/**
 * Der Einladungslink fuer "Join our Discord" auf der Seite.
 *
 * Eine dauerhafte Einladung in den Get-Access-Kanal, einmal angelegt und
 * gemerkt. Ohne Bot-Token gibt es keinen Link - dann zeigt die Seite den
 * Kasten nicht.
 */
export async function einladung(): Promise<string | null> {
  // Eine selbst gewaehlte Einladung (DISCORD_EINLADUNG) geht immer vor.
  const eigene = (process.env.DISCORD_EINLADUNG ?? '').trim();
  if (/^https?:\/\//.test(eigene)) return eigene;
  if (einladungGemerkt) return einladungGemerkt;
  /*
   * Die feste Einladung aus lib/marke ist der Boden: was auch immer mit
   * der Ablage oder dem Bot ist, eine Tuer auf den Server gibt es immer.
   * Alles Weitere kann sie nur bestaetigen, nicht wegnehmen.
   */
  try {
    if (!discordDa()) return MARKE.discord;
    const ablage = await lies();
    const gemerkt = ablage['einladung']?.nachricht;
    if (gemerkt) return (einladungGemerkt = `https://discord.gg/${gemerkt}`);
    const kanaele = await alleKanaele();
    const ziel = kanaele.find((k) => k.type === 0 && gleich(k.name, ZUGANG_PANEL))
      ?? kanaele.find((k) => k.type === 0 && /welcome|willkommen|general|allgemein/i.test(k.name))
      ?? kanaele.find((k) => k.type === 0);
    if (!ziel) return MARKE.discord;
    const neu = await ruf(`/channels/${ziel.id}/invites`, 'POST', { max_age: 0, max_uses: 0, unique: false });
    const code = neu && typeof (neu as Record<string, unknown>).code === 'string' ? String((neu as Record<string, unknown>).code) : null;
    if (!code) return MARKE.discord;
    einladungGemerkt = `https://discord.gg/${code}`;
    ablage['einladung'] = { kanal: ziel.id, nachricht: code };
    // Laesst sich der Code nicht merken (Ablage weg), bleibt er im Speicher
    // dieses Vorgangs - ein neuer Vorgang legt notfalls noch einen an,
    // dauerhafte Einladungen kosten nichts.
    try { await schreibe(ablage); } catch { /* siehe oben */ }
    return einladungGemerkt;
  } catch {
    return MARKE.discord;
  }
}
/** Die Einladung dieses Vorgangs - einmal geholt, dann gemerkt. */
let einladungGemerkt: string | null = null;

/* =============================================================== VIP-Panel */

/** "2nd", "3rd", "11th" ... */
function ordnungszahl(n: number): string {
  const r10 = n % 10, r100 = n % 100;
  const endung = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${n}${endung}`;
}

export interface VipZeile {
  name: string;
  art: 'vip' | 'manager' | 'pro';
  stufe: VipStufe | null;
  discordId: string | null;
  discordName: string | null;
  /** Wie viele Anfragen dieses Discord-Konto bisher gestellt hat. */
  anfragen: number;
  angelegt: string;
  vipBis: number | null;
  fristLoescht: boolean;
  aktiv: boolean;
  /** Wessen Overlays ein Manager betreut. */
  verwaltet: string | null;
}

/*
 * Alle Zugaenge fuer das VIP-Panel.
 *
 * Der Betreiber (24.9.2026): "ein Panel im Admin-Bereich, wo ich jeden
 * aufgelisteten VIP sehe", mit Loeschen (begruendet), Chat und einer Frist.
 * Das Discord-Konto steht am Zugang (seit dem Annehmen ueber Discord) oder in
 * seiner angenommenen Anfrage; aeltere Zugaenge verknuepft der Admin von Hand.
 */
export async function vipUebersicht(): Promise<VipZeile[]> {
  const { alleZugaenge } = await import('./vipZugaenge');
  const users = await alleZugaenge();
  const liste = Object.values((await anfragenOderNichts()) ?? {});
  return users.filter((u) => u.rolle !== 'admin').map((u) => {
    const eigene = liste
      .filter((a) => a.name.toLowerCase() === u.username.toLowerCase() && a.status === 'angenommen')
      .sort((a, b) => (a.entschieden ?? '').localeCompare(b.entschieden ?? ''))
      .pop();
    const discordId = u.discordId ?? eigene?.nutzerId ?? null;
    return {
      name: u.username,
      art: u.rolle === 'manager' ? 'manager' as const : u.rolle === 'pro' ? 'pro' as const : 'vip' as const,
      stufe: u.stufe ?? eigene?.stufe ?? null,
      discordId,
      discordName: u.discordName ?? eigene?.nutzerName ?? null,
      anfragen: discordId ? liste.filter((a) => a.nutzerId === discordId).length : 0,
      angelegt: u.createdAt,
      vipBis: u.vipBis ?? null,
      fristLoescht: Boolean(u.fristLoescht),
      aktiv: u.status === 'active',
      verwaltet: u.verwaltet ?? null,
    };
  });
}

/** Mitglieder des Servers zum Verknuepfen - Suche nach Namen. */
export async function mitgliederSuchen(q: string): Promise<Array<{ id: string; name: string; anzeige: string }>> {
  const text = q.trim();
  if (text.length < 2) return [];
  const roh = await ruf(`/guilds/${SERVER}/members/search?query=${encodeURIComponent(text)}&limit=10`, 'GET');
  if (!Array.isArray(roh)) return [];
  return (roh as Array<{ user?: { id?: string; username?: string; global_name?: string }; nick?: string }>)
    .filter((m) => m.user?.id)
    .map((m) => ({
      id: m.user!.id!, name: m.user!.username ?? '',
      anzeige: m.nick || m.user!.global_name || m.user!.username || '',
    }));
}

/** Einen Zugang mit einem Discord-Konto verknuepfen. */
export async function vipVerknuepfen(name: string, discordId: string, discordName: string) {
  const { alleZugaenge, schreibeZugaenge } = await import('./vipZugaenge');
  const users = await alleZugaenge();
  const u = users.find((x) => x.username.toLowerCase() === name.toLowerCase());
  if (!u) return { ok: false, text: 'This access does not exist.' };
  u.discordId = discordId; u.discordName = discordName;
  await schreibeZugaenge(users);
  return { ok: true, text: `Linked to ${discordName}.` };
}

async function zeileZu(name: string): Promise<VipZeile | null> {
  return (await vipUebersicht()).find((z) => z.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Ein Gespraech mit einem VIP - ueber den Bot, nicht privat. */
export async function vipChat(name: string): Promise<{ ok: boolean; text: string; kanal?: string }> {
  const z = await zeileZu(name);
  if (!z) return { ok: false, text: 'This access does not exist.' };
  if (!z.discordId) return { ok: false, text: 'Not linked to a Discord account yet.' };
  const erg = await ticketOeffnen(z.discordId, z.discordName ?? z.name, 'zugang', z.art === 'manager', {
    titel: 'A message from CompHub',
    text: `Juanito would like to talk to you about your CompHub access **${z.name}**. Just reply here.`,
  });
  if (!erg.ok || !erg.kanal) return { ok: false, text: 'The channel could not be created.' };
  return { ok: true, text: erg.schonDa ? 'There is already an open chat.' : 'Chat created.', kanal: erg.kanal };
}

const TAG_EN = (ms: number) => new Date(ms).toLocaleDateString('en-GB',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });

/*
 * Eine Frist setzen - mit Nachricht vom Bot.
 *
 * Der Betreiber: "Set a Time, wie lange die VIP noch gueltig ist ... das wird
 * dann natuerlich ueber DMs vom Bot geschrieben ... wenn diese Zeit
 * abgelaufen ist, wird der Account geloescht." bis = null heisst ohne Ende.
 */
export async function vipFrist(name: string, bis: number | null): Promise<{ ok: boolean; text: string }> {
  const { alleZugaenge, schreibeZugaenge } = await import('./vipZugaenge');
  const users = await alleZugaenge();
  const u = users.find((x) => x.username.toLowerCase() === name.toLowerCase());
  if (!u) return { ok: false, text: 'This access does not exist.' };
  if (bis === null) { delete u.vipBis; delete u.fristLoescht; } else { u.vipBis = bis; u.fristLoescht = true; }
  await schreibeZugaenge(users);

  const z = await zeileZu(name);
  const was = z?.art === 'manager' ? 'manager' : z?.stufe === 'vip' ? 'VIP' : 'VIP Streamer';
  const dm = z?.discordId ? await direktnachricht(z.discordId, {
    embeds: [{
      title: 'Your CompHub access',
      description: bis === null
        ? `Your ${was} access **${u.username}** no longer has an end date.`
        : `Your ${was} access **${u.username}** is valid until **${TAG_EN(bis)}**.\n\nAfter that date it will be removed automatically. If you would like to keep it, just reply to Juanito in the CompHub server.`,
      color: FARBE,
    }],
  }) : false;
  return {
    ok: true,
    text: (bis === null ? 'End date removed' : `Valid until ${TAG_EN(bis)}`)
      + (z?.discordId ? (dm ? ' · DM sent.' : ' · the DM could not be delivered (closed DMs).') : ' · no DM: not linked to Discord.'),
  };
}

/*
 * Einen Zugang loeschen - mit Grund, der als DM geht.
 *
 * Danach ist die Anmeldung weg, die Rollen und der Schluesselkanal ebenso
 * (wie beim Loeschen unter "Konten").
 */
export async function vipLoeschen(
  name: string, grund: string, ablauf = false,
): Promise<{ ok: boolean; text: string }> {
  const z = await zeileZu(name);
  const { alleZugaenge, schreibeZugaenge } = await import('./vipZugaenge');
  const users = await alleZugaenge();
  const weg = users.find((x) => x.username.toLowerCase() === name.toLowerCase());
  if (!weg || !z) return { ok: false, text: 'This access does not exist.' };

  let dm = false;
  if (z.discordId) {
    const was = z.art === 'manager' ? 'manager' : z.stufe === 'vip' ? 'VIP' : 'VIP Streamer';
    dm = await direktnachricht(z.discordId, {
      embeds: [{
        title: ablauf ? `Your ${was} access has ended` : `Your ${was} access was removed`,
        description: `${ablauf ? `Your access period ended on ${TAG_EN(weg.vipBis ?? Date.now())}.` : `**Reason:** ${grund}`}`
          + `\n\nYou can ask again any time in #${ZUGANG_PANEL}.`,
        color: FARBE,
      }],
    });
    // Die Sammelrollen abnehmen; Kanal und eigene Rolle raeumt loescheZugang.
    const rollen = await rollenListe();
    for (const r of [rollen.get('vip'), rollen.get('vip streamer'), rollen.get('vip manager')]) {
      if (r) await ruf(`/guilds/${SERVER}/members/${z.discordId}/roles/${r}`, 'DELETE');
    }
  }
  await schreibeZugaenge(users.filter((x) => x !== weg));
  const fuer = (weg.verwaltet ?? '').trim();
  await (fuer ? loescheZugang(fuer, 'manager') : loescheZugang(weg.username));
  return {
    ok: true,
    text: `Access "${weg.username}" deleted`
      + (z.discordId ? (dm ? ', reason sent as a DM.' : ', but the DM could not be delivered.') : ' (not linked to Discord, no DM).'),
  };
}

/** Was im Panel eine Frist hat und abgelaufen ist: loeschen. Liefert die Namen. */
export async function abgelaufeneVipsLoeschen(): Promise<string[]> {
  const { alleZugaenge } = await import('./vipZugaenge');
  const faellig = (await alleZugaenge()).filter((u) => u.fristLoescht && typeof u.vipBis === 'number'
    && u.vipBis > 0 && u.vipBis <= Date.now());
  const weg: string[] = [];
  for (const u of faellig) {
    const erg = await vipLoeschen(u.username, 'The access period ended.', true);
    if (erg.ok) weg.push(u.username);
  }
  return weg;
}

/* ==================================================================== */
/* ================================================== Admin-Werkzeug == */
/* ==================================================================== */

/*
 * Das Werkzeug des Betreibers im Admin-Bereich.
 *
 * Der Betreiber (25.9.2026): "ein Admin-Tool unter Admin im Discord, wo ich
 * Buttons habe. Um Create the Chat, nachher kann ich dann User auswaehlen,
 * mit wem oder mehrere User ... Dann werden die speziellen User in die
 * Kategorie hinzugefuegt und in den einzelnen Chat ... ich kann ja mehrere
 * Chats gleichzeitig haben." Und: alles, was er ueber einen Befehl schreibt,
 * soll "als CompHub" erscheinen - "er schreibt im Discord, im Chat als
 * CompHub, nicht ueber Privatnachrichten". Direktnachrichten gibt es weiter,
 * und was die Leute dort antworten, will er sehen koennen.
 *
 * Alles im Discord ist englisch.
 */

const WERKZEUG_KANAL = 'admin-tools';
const DM_KANAL = 'admin-dms';
const CHAT_KATEGORIE = 'Chats';
const DM_DATEI = path.join(DATEN_ORT, 'discord-dms.json');

/** Vorlagen fuer Nachrichten als CompHub. */
export const VORLAGEN: Record<string, { name: string; text: string; zeitraum?: boolean }> = {
  temporary_vip: {
    name: 'Temporary VIP access',
    text: 'You have been temporarily granted VIP access. Please note that this status will only '
      + 'remain active for a limited time. VIP status is strictly reserved for active content '
      + 'creators and streamers. An exception was made in this case, as you do not currently '
      + 'produce content.',
    zeitraum: true,
  },
};

const TAG_KURZ = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
};

/*
 * Ein Zeitraum aus einer Eingabe: ein Datum ("25.10.2026", "2026-10-25")
 * oder eine Dauer ("1 month", "2 weeks", "30 days", auch deutsch).
 * Ergebnis: das Enddatum und die fette Zeile unter der Nachricht.
 */
export function zeitraumVon(eingabe: string, jetzt = Date.now()): { bis: number; zeile: string } | null {
  const e = eingabe.trim().toLowerCase();
  if (!e) return null;
  let bis: number | null = null;
  let dauer = '';
  const datum = e.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/) ?? null;
  const iso = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (datum) {
    const j = Number(datum[3]) < 100 ? 2000 + Number(datum[3]) : Number(datum[3]);
    bis = Date.UTC(j, Number(datum[2]) - 1, Number(datum[1]), 23, 59);
  } else if (iso) {
    bis = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 23, 59);
  } else {
    const m = e.match(/^(\d+)\s*(day|days|tag|tage|week|weeks|woche|wochen|month|months|monat|monate|year|years|jahr|jahre)$/);
    if (!m) return null;
    const n = Number(m[1]);
    const d = new Date(jetzt);
    if (/^(day|tag)/.test(m[2])) d.setUTCDate(d.getUTCDate() + n);
    else if (/^(week|woche)/.test(m[2])) d.setUTCDate(d.getUTCDate() + 7 * n);
    else if (/^(month|monat)/.test(m[2])) d.setUTCMonth(d.getUTCMonth() + n);
    else d.setUTCFullYear(d.getUTCFullYear() + n);
    bis = d.getTime();
    const einheit = /^(day|tag)/.test(m[2]) ? 'day' : /^(week|woche)/.test(m[2]) ? 'week'
      : /^(month|monat)/.test(m[2]) ? 'month' : 'year';
    dauer = ` (${n} ${einheit}${n === 1 ? '' : 's'})`;
  }
  if (!bis || !Number.isFinite(bis) || bis <= jetzt) return null;
  return { bis, zeile: `**Access period: ${TAG_KURZ(jetzt)} – ${TAG_KURZ(bis)}${dauer}**` };
}

/** Der Text einer Vorlage, mit dem Zeitraum fett darunter. */
export function vorlagenText(vorlage: string, zeitraum?: string): { ok: boolean; text: string } {
  const v = VORLAGEN[vorlage];
  if (!v) return { ok: false, text: 'Unknown template.' };
  if (!v.zeitraum) return { ok: true, text: v.text };
  const z = zeitraum ? zeitraumVon(zeitraum) : null;
  if (!z) return { ok: false, text: 'This template needs a period - a date like 25.10.2026 or a duration like 1 month.' };
  return { ok: true, text: `${v.text}\n\n${z.zeile}` };
}

/* ------------------------------------------------ Slash-Befehl /comphub */

/**
 * Den Befehl /comphub anmelden (nur auf dem CompHub-Server, nur fuer Admins).
 * Ein Gildenbefehl steht sofort bereit, ein globaler erst nach bis zu einer
 * Stunde.
 */
export async function befehleEinrichten(): Promise<{ ok: boolean; text: string }> {
  if (!discordDa()) return { ok: false, text: 'no bot token' };
  const app = await ruf('/applications/@me', 'GET');
  const appId = app && !Array.isArray(app) && typeof app.id === 'string' ? app.id : process.env.DISCORD_APP_ID;
  if (!appId) return { ok: false, text: 'application id unknown' };
  const antwort = await ruf(`/applications/${appId}/guilds/${SERVER}/commands`, 'PUT', [{
    name: 'comphub',
    description: 'Post a message as CompHub in this channel',
    type: 1,
    default_member_permissions: '8',
    dm_permission: false,
    options: [
      { type: 3, name: 'message', description: 'What CompHub should write', required: false, max_length: 1900 },
      {
        type: 3, name: 'template', description: 'A prepared message', required: false,
        choices: Object.entries(VORLAGEN).map(([value, v]) => ({ name: v.name, value })),
      },
      { type: 3, name: 'period', description: 'For templates: until a date (25.10.2026) or a duration (1 month)', required: false },
    ],
  }]);
  return Array.isArray(antwort)
    ? { ok: true, text: '/comphub registered' }
    : { ok: false, text: `registering /comphub failed (${letzterStatus})` };
}

/** Eine Nachricht als CompHub in einen Kanal. */
export async function alsCompHub(kanal: string, text: string, erwaehnen: string[] = []): Promise<boolean> {
  const inhalt = erwaehnen.length ? `${erwaehnen.map((u) => `<@${u}>`).join(' ')}\n${text}` : text;
  const antwort = await ruf(`/channels/${kanal}/messages`, 'POST', {
    content: inhalt.slice(0, 2000),
    allowed_mentions: { users: erwaehnen },
  });
  return Boolean(idAus(antwort));
}

/* ---------------------------------------------------------------- Chats */

async function mitgliedName(id: string): Promise<string> {
  const m = await ruf(`/guilds/${SERVER}/members/${id}`, 'GET');
  if (m && !Array.isArray(m)) {
    const u = (m.user ?? {}) as { global_name?: string; username?: string };
    return String(m.nick || u.global_name || u.username || id);
  }
  return id;
}

/**
 * Einen Chat mit einem oder mehreren Mitgliedern aufmachen.
 *
 * Ein eigener Kanal in der Kategorie "Chats" (die entsteht, wenn es sie
 * noch nicht gibt). Sehen koennen ihn nur die Gewaehlten, der Admin und der
 * Bot. Oben steht eine angepinnte Einleitung. Gibt es fuer genau diese
 * Leute schon einen Chat, wird er wiederverwendet.
 */
export async function chatErstellen(
  nutzerIds: string[],
): Promise<{ ok: boolean; kanal?: string; text: string }> {
  if (!discordDa()) return { ok: false, text: 'no bot token' };
  const ids = [...new Set(nutzerIds)].filter((x) => /^\d{5,25}$/.test(x)).slice(0, 10);
  if (!ids.length) return { ok: false, text: 'Pick at least one member.' };
  const namen = await Promise.all(ids.map(mitgliedName));
  const kanalName = `chat-${namen.map((n) => [...n.toLowerCase()].map((z) => UMLAUTE[z] ?? z).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'member').join('-')}`.slice(0, 90);

  const kanaele = await alleKanaele();
  const schon = kanaele.find((k) => k.type === 0 && k.name === kanalName);
  if (schon) return { ok: true, kanal: schon.id, text: `There already is a chat with them: <#${schon.id}>` };

  const kategorie = await kategorieFuer(CHAT_KATEGORIE);
  const ich = await werBinIch();
  const adminRolle = await adminRolleId();
  const regeln: Array<Record<string, string | number>> = [
    { id: SERVER, type: 0, allow: '0', deny: '1024' },
    ...ids.map((id) => ({ id, type: 1, allow: '68608', deny: '0' })),
  ];
  if (ich) regeln.push({ id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' });
  if (adminRolle) regeln.push({ id: adminRolle, type: 0, allow: VOLLZUGRIFF, deny: '0' });

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name: kanalName, type: 0,
    ...(kategorie ? { parent_id: kategorie } : {}),
    topic: `Private chat with ${namen.join(', ')} - CompHub`,
    permission_overwrites: regeln,
  });
  const kanal = idAus(neu);
  if (!kanal) return { ok: false, text: `The channel could not be created (${letzterStatus}).` };

  const einleitung = await ruf(`/channels/${kanal}/messages`, 'POST', {
    content: ids.map((u) => `<@${u}>`).join(' '),
    allowed_mentions: { users: ids },
    embeds: [{
      title: 'CompHub',
      description: [
        `Hi ${namen.join(', ')}, welcome to your private channel with the CompHub team.`,
        '',
        'Only you and CompHub can see this channel. We will write to you here, and you can '
        + 'answer or ask anything right in this channel - no direct messages needed.',
        '',
        'Thank you for being part of CompHub.',
      ].join('\n'),
      color: FARBE,
    }],
    ...(knoepfeMoeglich() ? {
      components: [{ type: 1, components: [{ type: 2, style: 4, label: 'Close chat', custom_id: 'chat:zu' }] }],
    } : {}),
  });
  const einleitungId = idAus(einleitung);
  if (einleitungId) await anpinnen(kanal, einleitungId);
  return { ok: true, kanal, text: `Chat ready: <#${kanal}>` };
}

/**
 * Eine Nachricht als CompHub an ein Mitglied - in seinen Chat, nicht als DM.
 * Gibt es noch keinen Chat mit ihm, entsteht er.
 */
export async function nachrichtAnMitglied(nutzerId: string, text: string): Promise<{ ok: boolean; text: string }> {
  const chat = await chatErstellen([nutzerId]);
  if (!chat.ok || !chat.kanal) return { ok: false, text: chat.text };
  const ok = await alsCompHub(chat.kanal, text, [nutzerId]);
  return ok ? { ok: true, text: `Sent as CompHub in <#${chat.kanal}>.` } : { ok: false, text: 'The message could not be posted.' };
}

/* ------------------------------------------------------ Direktnachrichten */

interface DmEintrag { kanal: string; name?: string; zuletzt?: string }

async function liesDms(): Promise<Record<string, DmEintrag>> {
  try { return JSON.parse(await fs.readFile(DM_DATEI, 'utf8')) as Record<string, DmEintrag>; }
  catch (e) {
    // Nur "gibt es noch nicht" ist leer - ein Ausfall der Ablage ist ein Fehler.
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw e;
  }
}

/** Den DM-Kanal zu einem Mitglied merken - fuer die Einsicht in Antworten. */
async function dmMerken(nutzerId: string, kanal: string): Promise<void> {
  try {
    const d = await liesDms();
    if (d[nutzerId]?.kanal === kanal) return;
    d[nutzerId] = { ...d[nutzerId], kanal };
    await fs.mkdir(path.dirname(DM_DATEI), { recursive: true });
    await fs.writeFile(DM_DATEI, JSON.stringify(d, null, 1), 'utf8');
  } catch { /* Merken ist Zugabe - die DM selbst ist schon raus */ }
}

/**
 * Was in den Direktnachrichten des Bots neu ist, in #admin-dms spiegeln.
 *
 * Der Betreiber: "Ich will eigentlich sozusagen, wie der Account mir
 * gehoert, dass ich die Privatnachrichten sehen kann." Ein Bot kann seine
 * DM-Kanaele nicht auflisten; bekannt sind die, in die er selbst einmal
 * geschrieben hat. Deren neue Nachrichten - beide Seiten - landen hier.
 */
export async function dmsSpiegeln(): Promise<{ ok: boolean; text: string }> {
  if (!discordDa()) return { ok: false, text: 'no bot token' };
  const dms = await liesDms();
  const eintraege = Object.entries(dms);
  if (!eintraege.length) return { ok: true, text: 'No direct message conversations are known yet.' };

  const kanaele = await alleKanaele();
  const ziel = kanaele.find((k) => k.type === 0 && gleich(k.name, DM_KANAL))?.id
    ?? await infoKanal(DM_KANAL, 'Direct messages to the CompHub bot - both sides', await kategorieFuer('Admin'), kanaele, 'manager', []);
  if (!ziel) return { ok: false, text: `#${DM_KANAL} could not be created.` };

  let neu = 0;
  for (const [nutzerId, e] of eintraege) {
    const roh = await ruf(`/channels/${e.kanal}/messages?limit=50${e.zuletzt ? `&after=${e.zuletzt}` : ''}`, 'GET');
    if (!Array.isArray(roh) || !roh.length) continue;
    const nachrichten = [...roh as Array<{
      id: string; content?: string; timestamp?: string;
      author?: { id?: string; username?: string; bot?: boolean };
      embeds?: Array<{ title?: string; description?: string }>;
    }>].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const zeilen = nachrichten.map((m) => {
      const wann = (m.timestamp ?? '').slice(0, 16).replace('T', ' ');
      const wer = m.author?.bot ? 'CompHub' : (m.author?.username ?? '?');
      const text = (m.content || m.embeds?.map((x) => [x.title, x.description].filter(Boolean).join(': ')).join(' / ') || '(attachment)')
        .replace(/\s+/g, ' ').slice(0, 300);
      return `\`${wann}\` **${wer}:** ${text}`;
    });
    const beschreibung = zeilen.join('\n').slice(0, 3900);
    await ruf(`/channels/${ziel}/messages`, 'POST', {
      embeds: [{ title: `Direct messages with ${e.name ?? nutzerId}`, description: `<@${nutzerId}>\n${beschreibung}`, color: FARBE }],
      allowed_mentions: { parse: [] },
    });
    e.zuletzt = nachrichten[nachrichten.length - 1].id;
    neu += nachrichten.length;
  }
  try { await fs.writeFile(DM_DATEI, JSON.stringify(dms, null, 1), 'utf8'); } catch { /* beim naechsten Mal */ }
  return { ok: true, text: neu ? `${neu} new message(s) mirrored to <#${ziel}>.` : 'No new direct messages.' };
}

/* ------------------------------------------------------------ Das Panel */

/** #admin-tools anlegen und das Panel mit den Knoepfen hineinstellen. */
export async function werkzeugEinrichten(): Promise<{ ok: boolean; text: string }> {
  if (!discordDa()) return { ok: false, text: 'no bot token' };
  const kanaele = await alleKanaele();
  const kategorie = await kategorieFuer('Admin');
  const kanal = kanaele.find((k) => k.type === 0 && gleich(k.name, WERKZEUG_KANAL))?.id
    ?? await infoKanal(WERKZEUG_KANAL, 'Admin tools: chats, messages as CompHub, direct messages', kategorie, kanaele, 'manager', []);
  if (!kanal) return { ok: false, text: `#${WERKZEUG_KANAL} could not be created.` };

  /*
   * Das alte Panel suchen und ersetzen - im Kanal selbst, nicht in der
   * Ablage. So geht das auch, wenn Supabase gerade nicht antwortet (am
   * 25.9.2026 scheiterte der erste Aufbau genau daran).
   */
  const ich = await werBinIch();
  const vorhanden = await ruf(`/channels/${kanal}/messages?limit=50`, 'GET');
  if (Array.isArray(vorhanden)) {
    for (const m of vorhanden as Array<{ id: string; author?: { id?: string }; embeds?: Array<{ title?: string }> }>) {
      if (m.author?.id === ich && m.embeds?.some((e) => e.title === 'Admin tools')) {
        await ruf(`/channels/${kanal}/messages/${m.id}`, 'DELETE');
      }
    }
  }
  const gesendet = await ruf(`/channels/${kanal}/messages`, 'POST', {
    embeds: [{
      title: 'Admin tools',
      description: [
        '💬 **Create chat** - pick one or more members; they get a private channel under *Chats* with you.',
        '✉️ **Message as CompHub** - pick a member and write, or use a template; it is posted in their chat as CompHub.',
        '📥 **DM inbox** - mirror what people answered to the bot in direct messages into #admin-dms.',
        '',
        'In any channel: **/comphub** posts your text as CompHub (templates and a period included).',
      ].join('\n'),
      color: FARBE,
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Create chat', custom_id: 'werkzeug:chat', emoji: { name: '💬' } },
        { type: 2, style: 2, label: 'Message as CompHub', custom_id: 'werkzeug:nachricht', emoji: { name: '✉️' } },
        { type: 2, style: 2, label: 'DM inbox', custom_id: 'werkzeug:dms', emoji: { name: '📥' } },
      ],
    }],
  });
  const id = idAus(gesendet);
  if (!id) return { ok: false, text: 'The panel could not be posted.' };
  await anpinnen(kanal, id);
  const befehl = await befehleEinrichten();
  return { ok: true, text: `Panel in <#${kanal}> · ${befehl.text}` };
}
