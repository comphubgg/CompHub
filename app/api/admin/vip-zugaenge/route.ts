import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from '@/lib/ablageFs';
import path from 'path';
import crypto from 'crypto';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { verankereProfi } from '@/lib/profiVerankern';
import { modName } from '@/lib/modName';
import { DATEN_ORT } from '@/lib/datenOrt';
import { schickeSchluessel, loescheZugang, discordDa } from '@/lib/discord';
import {
  neuerSchluessel, praefixTaugt, schluesselTaugt, schonVergeben,
} from '@/lib/zugangsSchluessel';

// VIP-Zugaenge anlegen und verwalten.
//
//   GET                          -> alle Zugaenge, mit Schluessel
//   GET ?name=…                  -> nur der Schluessel eines Zugangs
//   POST { name }                -> anlegen, gibt den Schluessel genau einmal
//   POST { name, neuerSchluessel } -> einen neuen Schluessel erzeugen
//   PATCH { name, aktiv }        -> stilllegen oder wieder freigeben
//   DELETE ?name=…               -> endgueltig entfernen
//
// Warum ohne E-Mail: der Betreiber wollte Zugaenge vergeben koennen, ohne
// dass die andere Seite etwas tun muss. Ein Name genuegt, den Schluessel
// erzeugt der Server. Die gewoehnliche Anmeldung bleibt davon unberuehrt -
// dort geht weiterhin nur die E-Mail-Adresse.
//
// Zu den Schluesseln: sie sind hier abrufbar. Ich hatte sie zunaechst nur
// einmal beim Anlegen herausgegeben, damit sie nicht ueber jede offene
// Verwaltungsseite mitgehen - der Betreiber wollte es ausdruecklich anders,
// weil er einem Nutzer seinen Schluessel auch spaeter noch nennen koennen
// muss, ohne ihn zu erneuern.
//
// Sie gehen deshalb nur an eine als Admin angemeldete Anfrage heraus, und
// die Oberflaeche zeigt sie erst auf Klick, nicht von sich aus.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'vip-users.json');
const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

interface Zugang {
  username: string;
  accessKey: string;
  status: 'active' | 'disabled';
  createdAt: string;
  /*
   * Dieselben Felder wie bei einem gewoehnlichen Konto.
   *
   * Der Betreiber wollte diese Zugaenge in derselben Liste sehen und
   * genauso behandeln koennen - Rolle vergeben, VIP befristen, sperren.
   * Also tragen sie dieselben Angaben; nur der Weg hinein ist ein anderer
   * (Name und Schluessel statt Adresse und Passwort).
   */
  rolle?: 'admin' | 'manager' | 'pro';
  rechte?: string[];
  epicId?: string;
  vipBis?: number;
  /** Darf dieser VIP seinen Schluessel selbst wechseln? Siehe lib/vipZugaenge.ts. */
  darfSchluessel?: boolean;
  /** Fuer wen dieser Zugang die Overlays verwaltet. Siehe lib/vipZugaenge.ts. */
  verwaltet?: string;
  /** Welche Namen diesen Manager-Zugang benutzen duerfen. Siehe lib/vipZugaenge.ts. */
  mods?: string[];
}

/**
 * Eine Namensliste aus dem, was die Oberflaeche schickt.
 *
 * Sie kommt als Text - Komma, Semikolon oder Zeilenumbruch, wie es sich beim
 * Tippen ergibt. Doppelte fliegen raus, ohne Ruecksicht auf Gross- und
 * Kleinschreibung: "Marc" und "marc" sind derselbe Mensch, und zwei Eintraege
 * dafuer waeren nur eine Gelegenheit, den falschen zu loeschen.
 */
function namensListe(roh: unknown): string[] {
  const stuecke = Array.isArray(roh)
    ? roh.map((x) => String(x))
    : String(roh ?? '').split(/[,;\n]+/);
  const raus: string[] = [];
  for (const s of stuecke) {
    const name = modName(s);
    if (!name) continue;
    if (raus.some((x) => x.toLowerCase() === name.toLowerCase())) continue;
    raus.push(name);
    if (raus.length >= 30) break;
  }
  return raus;
}

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin') return true;
  }
  // Der Betreiber selbst - oder ein Zugang, dem die Adminrolle
  // gegeben wurde. Beides zaehlt gleich.
  const vipName = vipAus(laden.get(VIP_COOKIE)?.value);
  if (!vipName) return false;
  if (istBetreiber(laden.get(VIP_COOKIE)?.value)) return true;
  return rechteVon(await zugangNach(vipName)).rolle === 'admin';
}

async function lies(): Promise<{ users: Zugang[] }> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8'));
  } catch {
    return { users: [] };
  }
}

async function schreibe(daten: { users: Zugang[] }) {
  await fs.writeFile(DATEI, JSON.stringify(daten, null, 2), 'utf8');
}

/*
 * Das Erzeugen und Pruefen von Schluesseln steht in lib/zugangsSchluessel.ts.
 *
 * Es gibt inzwischen drei Wege zu einem Schluessel - erzeugen, von Hand
 * setzen, und der VIP selbst - und alle drei muessen dieselben Regeln
 * haben. Stuenden sie in den Routen, waere in einer Woche der eine Weg
 * strenger als der andere, und der laxere entschiede, was moeglich ist.
 */

export async function GET(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const { users } = await lies();

  // Ein einzelner Schluessel - die Oberflaeche holt ihn erst auf Klick.
  const einzeln = (new URL(request.url).searchParams.get('name') ?? '')
    .trim().toLowerCase();
  if (einzeln) {
    const u = users.find((x) => x.username.toLowerCase() === einzeln);
    if (!u) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
    return NextResponse.json({ ok: true, name: u.username, schluessel: u.accessKey });
  }

  return NextResponse.json({
    ok: true,
    zugaenge: users.map((u) => ({
      name: u.username,
      schluessel: u.accessKey,
      aktiv: u.status === 'active',
      angelegt: u.createdAt,
      rolle: u.rolle ?? null,
      rechte: u.rechte ?? [],
      epicId: u.epicId ?? null,
      vipBis: u.vipBis ?? null,
      darfSchluessel: Boolean(u.darfSchluessel),
      // Wessen Overlays dieser Zugang betreut - bei einem Manager.
      verwaltet: u.verwaltet ?? null,
      // Und wer ihn benutzen darf.
      mods: u.mods ?? [],
      // Ein Zugangskonto ist immer VIP - das ist sein Zweck. Eine Frist
      // schraenkt das nur zusaetzlich ein.
      vip: u.vipBis === undefined || u.vipBis === 0 || u.vipBis > Date.now(),
    })),
  });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const name = String(koerper.name ?? '').trim();
  /*
   * Fuer wen dieser Zugang die Overlays verwaltet.
   *
   * Steht hier ein Name, entsteht ein Manager-Zugang: mehrere Leute teilen
   * ihn sich und betreuen damit die Overlays eines Streamers. Der Zugang
   * bekommt seinen eigenen Discord-Kanal in einer eigenen Kategorie und
   * eine eigene Rolle, und er darf nur an die Overlays - nichts sonst.
   */
  const verwaltet = String(koerper.verwaltet ?? '').trim();

  /*
   * Der Name - und eine Meldung, die sagt, was wirklich fehlt.
   *
   * Vorher galt hier "a-z" und die Meldung lautete "drei bis
   * vierundzwanzig Zeichen, ohne Leerzeichen". Wer "hoerman" mit Umlaut
   * eintippte, bekam also einen Satz, der auf seinen Namen gar nicht
   * zutraf: sechs Zeichen, kein Leerzeichen - und trotzdem abgelehnt. Man
   * sucht dann an der falschen Stelle.
   *
   * Umlaute gehen jetzt, und ueberhaupt Buchstaben aus anderen Schriften:
   * die Szene heisst nicht durchgehend englisch. Gesperrt bleiben nur
   * Leerzeichen (beim Kopieren nicht von einem Umbruch zu unterscheiden)
   * und Zeichen, die in einer Adresse etwas bedeuten.
   */
  if (name.length < 3 || name.length > 24) {
    return NextResponse.json(
      { fehler: 'Der Name braucht drei bis vierundzwanzig Zeichen.' },
      { status: 400 });
  }
  if (/\s/.test(name)) {
    return NextResponse.json(
      { fehler: 'Im Namen darf kein Leerzeichen stehen.' }, { status: 400 });
  }
  if (!/^[\p{L}\p{N}_.-]+$/u.test(name)) {
    return NextResponse.json({
      fehler: 'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und '
        + 'Unterstrich. Umlaute gehen, Sonderzeichen wie @ oder / nicht.',
    }, { status: 400 });
  }

  const daten = await lies();

  /*
   * Ein Manager braucht jemanden, den es gibt.
   *
   * Sonst entstuende ein Zugang, der auf eine leere Ablage zeigt - er
   * koennte sich anmelden und saehe nichts, ohne dass irgendwo stuende,
   * warum.
   */
  if (verwaltet) {
    const wen = verwaltet.toLowerCase();
    const da = wen === 'betreiber'
      || daten.users.some((u) => u.username.toLowerCase() === wen);
    if (!da) {
      return NextResponse.json(
        { fehler: 'Für diesen Namen gibt es keinen Zugang.' }, { status: 400 });
    }
  }

  const i = daten.users.findIndex(
    (u) => u.username.toLowerCase() === name.toLowerCase());

  /*
   * Drei Moeglichkeiten, und sie schliessen einander aus.
   *
   *   schluessel  - von Hand gesetzt, gilt genau so wie eingetippt
   *   praefix     - die ersten Zeichen selbst gewaehlt, der Rest zufaellig
   *   nichts      - wie bisher, zwoelf zufaellige Zeichen
   *
   * Der Vergleich beim Anmelden geht Zeichen fuer Zeichen, deshalb bleibt
   * ein selbst gesetzter Schluessel unangetastet - auch in der
   * Gross- und Kleinschreibung.
   */
  const vorgabe = String(koerper.schluessel ?? '').trim();
  const praefix = String(koerper.praefix ?? '').trim();

  if (vorgabe) {
    const einwand = schluesselTaugt(vorgabe);
    if (einwand) return NextResponse.json({ fehler: einwand }, { status: 400 });
    if (schonVergeben(vorgabe, daten.users, name)) {
      return NextResponse.json(
        { fehler: 'Diesen Schlüssel hat schon jemand anderes.' }, { status: 409 });
    }
  } else if (praefix) {
    const einwand = praefixTaugt(praefix);
    if (einwand) return NextResponse.json({ fehler: einwand }, { status: 400 });
  }

  let schluessel = vorgabe || neuerSchluessel(praefix);
  // Bei einem selbst gewaehlten Anfang kann der Zufall theoretisch auf einen
  // vorhandenen treffen. Dann eben noch einmal.
  for (let versuch = 0; !vorgabe && schonVergeben(schluessel, daten.users, name)
    && versuch < 5; versuch += 1) {
    schluessel = neuerSchluessel(praefix);
  }

  if (i >= 0) {
    // Es gibt ihn schon - dann nur, wenn ausdruecklich ein neuer Schluessel
    // gewuenscht ist. Sonst waere ein Vertipper ein stiller Ueberschreiber.
    if (!koerper.neuerSchluessel) {
      return NextResponse.json(
        { fehler: 'Diesen Namen gibt es schon.' }, { status: 409 });
    }
    daten.users[i].accessKey = schluessel;
    daten.users[i].status = 'active';
  } else {
    daten.users.push({
      username: name,
      accessKey: schluessel,
      status: 'active',
      createdAt: new Date().toISOString(),
      /*
       * Ein Manager kommt fertig eingerichtet zur Welt.
       *
       * Rolle "manager", das Recht auf die Overlays und der Name dessen,
       * fuer den er arbeitet. Ohne das muesste der Betreiber nach jedem
       * Anlegen noch dreimal klicken, und bis dahin waere der Zugang ein
       * Konto ohne Zweck.
       *
       * Den eigenen Schluessel darf er nicht wechseln: mehrere Leute teilen
       * ihn sich, und einer koennte damit die anderen aussperren. Das bleibt
       * beim Betreiber.
       */
      ...(verwaltet ? {
        rolle: 'manager' as const,
        rechte: ['overlays'],
        verwaltet,
        darfSchluessel: false,
        mods: namensListe(koerper.mods),
      } : {}),
    });
  }

  await schreibe(daten);

  /*
   * Und ab damit nach Discord.
   *
   * Der Betreiber fuehrt fuer jeden VIP einen eigenen Kanal. Dort soll immer
   * genau ein Schluessel stehen, naemlich der gueltige - die vorherige
   * Nachricht wird deshalb geloescht. Einen neuen VIP legt der Bot samt
   * Kanal an.
   *
   * Bewusst nach dem Speichern und ohne die Antwort davon abhaengig zu
   * machen: der Schluessel ist zu diesem Zeitpunkt erzeugt und gilt. Ginge
   * das Werkzeug daran kaputt, dass Discord gerade nicht erreichbar ist,
   * waere das der schlechtere Handel. Was schiefging, steht als Hinweis
   * daneben, damit es nicht unbemerkt bleibt.
   */
  /*
   * Bekommt die Nachricht einen Knopf zum Selbstwechseln?
   *
   * Jeder VIP - der Kanal ist privat, und der Knopf ist der Weg zurueck,
   * wenn der Zugang selbst nicht mehr geht. Ein Manager-Zugang nie: mehrere
   * Leute teilen ihn sich, und einer koennte damit die anderen mitten im
   * Stream aussperren.
   */
  const discord = await schickeSchluessel(
    verwaltet || name, schluessel, verwaltet ? 'manager' : 'vip',
    !verwaltet);

  /*
   * Der Schluessel geht genau hier heraus, ein einziges Mal. Die Oberflaeche
   * zeigt ihn dem Admin zum Weitergeben; danach ist er nur noch in der
   * Datei.
   */
  return NextResponse.json({
    ok: true,
    name,
    schluessel,
    discord: discord.ok ? 'gesendet'
      : discordDa() ? `nicht gesendet: ${discord.grund}` : null,
  });
}

/**
 * Rolle, Rechte, Epic-Konto und VIP-Frist eines Zugangs setzen.
 *
 * Eigener Weg (PUT), damit er sich nicht mit dem Anlegen und dem
 * Stilllegen ins Gehege kommt.
 */
export async function PUT(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const name = String(koerper.name ?? '').trim().toLowerCase();

  const daten = await lies();
  const i = daten.users.findIndex((u) => u.username.toLowerCase() === name);
  if (i < 0) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  const roh = koerper.rolle;
  if (roh !== null && roh !== undefined
      && roh !== 'admin' && roh !== 'manager' && roh !== 'pro') {
    return NextResponse.json({ fehler: 'unbekannte Rolle' }, { status: 400 });
  }
  if (roh === null) delete daten.users[i].rolle;
  else if (roh) daten.users[i].rolle = roh;

  // Die Bereiche gelten nur fuer Manager - sonst waeren sie eine Falle.
  if (roh === 'manager' && Array.isArray(koerper.bereiche)) {
    daten.users[i].rechte = (koerper.bereiche as unknown[])
      .map((x) => String(x)).slice(0, 20);
  } else if (roh !== 'manager') {
    delete daten.users[i].rechte;
  }

  /*
   * Darf dieser Zugang seinen Schluessel selbst aendern?
   *
   * Nur der Admin setzt das, und nur hier - im Selbstbedienungsweg wird es
   * ausschliesslich gelesen. Sonst koennte sich jemand das Recht, das er
   * gerade ausuebt, im selben Zug selbst verlaengern.
   */
  /*
   * Die Namensliste eines Manager-Zugangs.
   *
   * Sie wird nur angefasst, wenn wirklich etwas geschickt wurde - sonst
   * loeschte ein Klick auf "Rolle setzen" nebenbei alle Namen.
   */
  if (koerper.mods !== undefined) {
    const liste = namensListe(koerper.mods);
    if (liste.length) daten.users[i].mods = liste;
    else delete daten.users[i].mods;
  }

  const rechtVorher = Boolean(daten.users[i].darfSchluessel);
  if (typeof koerper.darfSchluessel === 'boolean') {
    if (koerper.darfSchluessel) daten.users[i].darfSchluessel = true;
    else delete daten.users[i].darfSchluessel;
  }
  const rechtNachher = Boolean(daten.users[i].darfSchluessel);

  if (typeof koerper.epicId === 'string') {
    const epic = koerper.epicId.trim().toLowerCase();
    if (epic && !/^[0-9a-f]{32}$/.test(epic)) {
      return NextResponse.json(
        { fehler: 'Eine Epic-Konto-Id sind 32 Zeichen aus 0-9 und a-f.' },
        { status: 400 });
    }
    if (epic) daten.users[i].epicId = epic;
    /*
     * Und die Id gleich als feste Kennung verankern.
     *
     * Ohne das haengt die Zuordnung weiter am Namen - und den aendert ein
     * Profi, wann er will. Ist noch kein Profil zu dieser Id da, entsteht
     * eines mit dem heutigen Namen als Anzeigenamen; ein vorhandenes wird
     * nie angeruehrt.
     */
    if (epic) await verankereProfi(epic);
    else delete daten.users[i].epicId;
  }

  const tage = koerper.vipTage;
  if (tage !== undefined) {
    if (tage !== null && (typeof tage !== 'number' || tage < 0 || tage > 730)) {
      return NextResponse.json(
        { fehler: 'Die Dauer muss zwischen 0 und 730 Tagen liegen.' },
        { status: 400 });
    }
    if (tage === null) delete daten.users[i].vipBis;
    else if (tage === 0) daten.users[i].vipBis = 0;
    else daten.users[i].vipBis = Date.now() + tage * 86_400_000;
  }

  await schreibe(daten);

  /*
   * Hat sich das Wechselrecht geaendert, muss die Nachricht in Discord
   * nachziehen.
   *
   * Darunter steht der Knopf "Generate a new key" - oder eben nicht. Bliebe
   * die alte Nachricht stehen, haette ein Zugang einen Knopf, der ihm
   * verweigert wird, oder keinen, obwohl er duerfte. Der Schluessel selbst
   * bleibt dabei derselbe; es wird nur neu geschrieben.
   */
  if (rechtVorher !== rechtNachher && !(daten.users[i].verwaltet ?? '').trim()) {
    await schickeSchluessel(
      daten.users[i].username, daten.users[i].accessKey, 'vip', true);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const name = String(koerper.name ?? '').trim().toLowerCase();

  const daten = await lies();
  const i = daten.users.findIndex((u) => u.username.toLowerCase() === name);
  if (i < 0) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  daten.users[i].status = koerper.aktiv ? 'active' : 'disabled';
  await schreibe(daten);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const name = (new URL(request.url).searchParams.get('name') ?? '')
    .trim().toLowerCase();

  const daten = await lies();
  /*
   * Erst nachsehen, was da geloescht wird - danach steht es nicht mehr drin.
   *
   * Bei einem Manager-Zugang liegt der Kanal nicht unter seinem eigenen
   * Namen, sondern unter dem des Streamers: "groupay-managers" wohnt in
   * "#groupay-manager-keys". Ohne diesen Blick suchte das Aufraeumen einen
   * Kanal "#groupay-managers-key", fand nichts und liess den echten stehen.
   */
  const weg = daten.users.find((u) => u.username.toLowerCase() === name);
  const uebrig = daten.users.filter((u) => u.username.toLowerCase() !== name);
  if (uebrig.length === daten.users.length) {
    return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  }

  await schreibe({ users: uebrig });

  /*
   * Und in Discord ebenfalls aufraeumen.
   *
   * Sonst bleiben Kanal und Rolle stehen, und wer denselben Namen spaeter
   * wieder anlegt, bekommt einen zweiten Kanal daneben. Genau das ist dem
   * Betreiber passiert.
   */
  const fuer = (weg?.verwaltet ?? '').trim();
  const discord = fuer
    ? await loescheZugang(fuer, 'manager')
    : await loescheZugang(name);

  return NextResponse.json({
    ok: true,
    discord: discord.ok ? 'aufgeraeumt'
      : discordDa() ? `nicht aufgeraeumt: ${discord.grund}` : null,
  });
}
