import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { verankereProfi } from '@/lib/profiVerankern';
import { DATEN_ORT } from '@/lib/datenOrt';
import { schickeSchluessel, discordDa } from '@/lib/discord';
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
  const discord = await schickeSchluessel(name, schluessel);

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
  if (typeof koerper.darfSchluessel === 'boolean') {
    if (koerper.darfSchluessel) daten.users[i].darfSchluessel = true;
    else delete daten.users[i].darfSchluessel;
  }

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
  const uebrig = daten.users.filter((u) => u.username.toLowerCase() !== name);
  if (uebrig.length === daten.users.length) {
    return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  }

  await schreibe({ users: uebrig });
  return NextResponse.json({ ok: true });
}
