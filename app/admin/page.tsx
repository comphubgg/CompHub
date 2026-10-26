'use client';

// Das Dashboard nach dem Einloggen.
//
// Vorher war das eine ausladende Seite: eine bildschirmfuellende Warnung als
// Tuersteher, darunter drei ineinander verschachtelte Kartenebenen mit
// Eckenradien von zweiunddreissig Pixeln, eine Verwaltung fuer YouTube,
// Twitter, Instagram und TikTok, eine Uebersicht, die zwei bereits sichtbare
// Angaben wiederholte, und ein Kasten "Support", hinter dem nichts lag.
//
// Geblieben ist, was man hier wirklich tut: Namen und Twitch-Kanal pflegen,
// den Zugangsschluessel holen, in die Werkzeuge springen, den Chat mitlesen.
// Die uebrigen Netzwerke sind ersatzlos entfallen - ausdruecklich gewuenscht:
// niemand soll hier seine Konten ausstellen, der Chat genuegt. Der
// Twitch-Kanal bleibt allein deshalb stehen, weil der Chat eine Adresse
// braucht.
//
// Ausserdem war das Speichern kaputt: die Funktion dafuer stand im Code, aber
// kein Knopf rief sie auf. Wer seinen Namen aenderte, verlor die Aenderung
// beim naechsten Laden. Jetzt gibt es den Knopf, und er meldet, was er tat.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import T from '@/app/components/T';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import { bereichVonPfad } from '@/lib/rechte';
import Nutzungszahlen from '@/app/components/Nutzungszahlen';
import Fusszeile from '@/app/components/Fusszeile';
import MeinArchiv from './MeinArchiv';
import KontoInhalt from '../account/KontoInhalt';
import AdminZentrale from './AdminZentrale';
import Klappbar from './Klappbar';
import OfflineSeiten from './OfflineSeiten';
import Ebenen from './Ebenen';
type ProfileData = {
  displayName: string;
  avatarUrl: string | null;
  twitchChatEnabled: boolean;
  /** Nur noch der Twitch-Kanal, und der allein wegen des Chats. */
  socials: { twitch: string };
  /** Freiwillige Adresse fuer Rueckfragen - siehe app/api/profile. */
  email?: string;
};

const DEFAULT_PROFILE: ProfileData = {
  displayName: '',
  avatarUrl: null,
  twitchChatEnabled: true,
  socials: { twitch: '' },
  email: '',
};

interface Ziel { href: string; titel: string; text: string }

/**
 * Die Werkzeuge, die nur der Admin sieht.
 *
 * Bewusst als eigener Block unter dem Schnellzugriff, nicht dazwischen
 * gemischt: was hier steht, veraendert die Inhalte des ganzen Werkzeugs -
 * Karten, Beitraege, Prognosen. Kommt spaeter etwas dazu, gehoert es in diese
 * Liste und sonst nirgendwohin.
 */
/*
 * Die Verwaltungsbereiche.
 *
 * Dieselbe Liste zum Anhaken steht in lib/rechte.ts - zweimal gepflegt
 * waeren sie in einer Woche auseinandergelaufen. Getrennt bleibt nur die
 * Kontoverwaltung: die ist nicht vergebbar.
 */
const NUR_ADMIN: Ziel[] = [
  // Wer gerade da ist und wer sich wann angemeldet hat. Nur Angemeldete und
  // nur mit Namen - die Besuchszahlen unten zaehlen dagegen Browser.
  { href: '/admin/live', titel: 'Live',
    text: 'Wer gerade da ist und wann sich wer angemeldet hat' },
  { href: '/admin/accounts', titel: 'Konten', text: 'Rollen und VIP vergeben' },
  // Jeder VIP-Zugang mit Frist, Chat und Loeschen - der Betreiber wollte
  // dafuer ein eigenes Panel (24.9.2026).
  { href: '/admin/vip-access', titel: 'VIP-Zugänge', text: 'Frist, Chat und Löschen je VIP' },
  /*
   * Der Kontowechsel als eigene Seite.
   *
   * Er steckte in der Zugangsliste unter "Konten", zwischen Schluesseln,
   * Rollen und Fristen - und war dort nicht zu finden. Der Betreiber wollte
   * eine eigene: "kann ich einfach den User anklicken und dann switche ich
   * automatisch."
   */
  { href: '/admin/switch', titel: 'Konto wechseln',
    text: 'Sehen, was ein VIP oder Manager sieht' },
  // Wer Bereiche zumachen darf, koennte sich damit selbst den Weg zurueck
  // verbauen - deshalb nur der Admin, so wie bei den Konten.
  { href: '/admin/sections', titel: 'Sections',
    text: 'Bereiche auf Standby oder Offline stellen' },
  // Wer auf der Startseite steht - eine Auswahl, keine Rechtevergabe.
  { href: '/admin/vips', titel: 'VIPs',
    text: 'Wer auf der Startseite gezeigt wird' },
  // Client-Id und Secret der Anmeldedienste - Geheimnisse, also nur Admin.
  { href: '/admin/services', titel: 'Anmeldedienste',
    text: 'Twitch, Discord und Google einrichten' },
  // Die Maps ohne Landepunkte aus dem Archiv: Formen, Teams und Leaderboard je Karte von Hand (13.10.2026).
  { href: '/admin/alte-maps', titel: 'Alte Maps',
    text: 'Karten von Hand pflegen: Formen, Teams, Leaderboard' },
];

const ADMIN_ZIELE: Ziel[] = [
  { href: '/maps', titel: 'Karten', text: 'Turnierkarten bauen' },
  { href: '/admin/tweets', titel: 'Beiträge', text: 'Statistik-Posts erstellen' },
  { href: '/admin/tiktok', titel: 'TikTok', text: 'Das tägliche Video zum Herunterladen' },
  { href: '/admin/plakate', titel: 'Plakate', text: 'Bild und Text für Spieler, Standings, Finals und Top 5' },
  { href: '/admin/predictions', titel: 'Prognosen', text: 'Vorhersagen zeichnen' },
  { href: '/admin/replays', titel: 'Replays', text: 'Turnier-Replays nachsehen' },
  // Das Zonen-Bild zum Posten und je Game Zonen und Kills (29.9.2026: "sag
  // mir mal, wo ich diese Map an sich machen kann ... Das soll auch im
  // Admin-Dashboard eigentlich sein").
  { href: '/admin/replay', titel: 'Zonen & Games', text: 'Zonen-Bild bauen, Kills und Zonen je Game' },
  { href: '/admin/players', titel: 'Player Center', text: 'Flaggen und @-Konten pflegen' },
  { href: '/admin/orgs', titel: 'E-Sports-Teams', text: 'Organisationen, Spieler und Logos' },
  { href: '/admin/assets', titel: 'Bildvorrat', text: 'Logos und Grafiken ablegen' },
  { href: '/admin/archive', titel: 'Archiv', text: 'Fotos und Videos zu Events und Spielern' },
  /*
   * Der Posteingang.
   *
   * Er stand in lib/rechte.ts als vergebbarer Bereich, fehlte hier aber in
   * der Kachelliste - weder der Admin noch ein Manager mit dem Recht
   * "Kontakt" kam ueber die Oberflaeche dorthin. Wer die Adresse nicht
   * auswendig wusste, las die Meldungen aus dem Kontaktformular nie.
   */
  { href: '/admin/contact', titel: 'Kontakt', text: 'Meldungen aus dem Formular lesen' },
];

export default function AdminDashboardPage() {
  const t = useT();
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [accountStatus, setAccountStatus] = useState('');
  /**
   * Fuer wen dieser Zugang die Overlays betreut - sonst leer.
   *
   * Ein Manager-Zugang gehoert nicht einer Person: mehrere teilen ihn sich.
   * Ein Profilbild, eine Adresse oder ein Twitch-Chat waeren dort nicht
   * "seine", sondern die aller - deshalb faellt beides weg, und die Overlays
   * heissen nach dem Streamer statt "meine".
   */
  const [verwaltet, setVerwaltet] = useState('');
  const [currentHost, setCurrentHost] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [fehler, setFehler] = useState('');
  const [schluesselOffen, setSchluesselOffen] = useState(false);

  /*
   * Den eigenen Schluessel selbst wechseln - wenn der Admin es erlaubt hat.
   *
   * Ob das erlaubt ist, entscheidet der Server; hier wird nur gefragt. Ein
   * ausgeblendeter Knopf schuetzt nichts, deshalb prueft die Schnittstelle
   * das Recht noch einmal, wenn es darauf ankommt.
   */
  const [darfWechseln, setDarfWechseln] = useState(false);
  const [wechselOffen, setWechselOffen] = useState(false);
  const [eigenerWunsch, setEigenerWunsch] = useState('');
  const [wechselStand, setWechselStand] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [istAdmin, setIstAdmin] = useState(false);
  const [rolle, setRolle] = useState<string | null>(null);
  const [eigeneRechte, setEigeneRechte] = useState<string[]>([]);
  const zugang = useZugang();
  const [warnungWeg, setWarnungWeg] = useState(false);
  /** Dashboard oder Kontodaten - /account?tab=konto oeffnet gleich die Kontodaten. */
  const [tab, setTab] = useState<'dashboard' | 'konto'>('dashboard');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('tab') === 'konto' || window.location.hash === '#konto') setTab('konto');
  }, []);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (res) => {
        if (!res.ok) throw new Error(t('Nicht angemeldet'));
        const json = await res.json();
        const geladen: ProfileData = json.profile || DEFAULT_PROFILE;
        setProfile(geladen);
        letzteFassung.current = JSON.stringify(geladen);
        setAccountStatus(json.accountStatus || 'Normal User');
        setVerwaltet(String(json.verwaltet ?? ''));
        setAccessKey(json.accessKey || '');
      })
      .catch(() => {})
      .finally(() => setLaedt(false));

    /*
     * Die Auskunft nennt jetzt auch die Rolle und die angehakten Bereiche.
     * Vorher kannte sie nur den alten VIP-Schluessel - wer die Rolle am
     * CompHub-Konto hatte, sah seine Kacheln nicht.
     */
    fetch('/api/auth/check-admin', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setIstAdmin(json?.isAdmin === true);
        setRolle(json?.rolle ?? null);
        setEigeneRechte(Array.isArray(json?.rechte) ? json.rechte : []);
      })
      .catch(() => setIstAdmin(false));

    setCurrentHost(window.location.hostname);
  }, []);

  /**
   * Ablegen, ohne dass jemand darum bitten muss.
   *
   * Ein Knopf zum Speichern ist hier eine Zumutung: es sind zwei Angaben, und
   * wer den Knopf uebersieht, verliert sie beim naechsten Laden - genau das
   * war vorher der Fall. Geschrieben wird deshalb von selbst, kurz nachdem das
   * Tippen aufhoert. Die Wartezeit ist nicht Zierde, sondern verhindert einen
   * Schreibvorgang je Tastendruck.
   *
   * Abgelegt wird beim Konto, nicht im Browser: wer sich woanders anmeldet,
   * findet seinen Kanal wieder vor.
   */
  const uhr = useRef<number | null>(null);
  const letzteFassung = useRef<string>('');

  const sichern = useCallback(async (stand: ProfileData) => {
    setSpeichert(true); setFehler('');
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: stand }),
      });
      if (!res.ok) throw new Error(t('Speichern fehlgeschlagen'));
      letzteFassung.current = JSON.stringify(stand);
      setMeldung(t('Gespeichert'));
    } catch {
      setFehler(t('Nicht gespeichert — beim nächsten Tippen versuche ich es erneut.'));
    } finally {
      setSpeichert(false);
    }
  }, []);

  const aendere = (teil: Partial<ProfileData>) => {
    setMeldung(''); setFehler('');
    setProfile((prev) => {
      const neu = { ...prev, ...teil };
      if (uhr.current) window.clearTimeout(uhr.current);
      uhr.current = window.setTimeout(() => {
        // Nur schreiben, wenn sich wirklich etwas geaendert hat.
        if (JSON.stringify(neu) !== letzteFassung.current) void sichern(neu);
      }, 700);
      return neu;
    });
  };

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const j = await (await fetch('/api/vip-schluessel')).json();
        setDarfWechseln(Boolean(j?.darf));
      } catch { /* dann eben ohne den Knopf */ }
    });
  }, []);

  /**
   * Einen neuen Schluessel setzen - leer heisst: einen zufaelligen.
   *
   * Der neue steht danach sofort im Kasten darueber, damit man ihn nicht
   * erst suchen muss. Wo Discord eingerichtet ist, liegt er zugleich im
   * eigenen Kanal.
   */
  const schluesselWechseln = async () => {
    setWechselStand(t('speichert …'));
    try {
      const r = await fetch('/api/vip-schluessel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eigenerWunsch.trim()
          ? { schluessel: eigenerWunsch.trim() } : {}),
      });
      const j = await r.json();
      if (!r.ok) { setWechselStand(t(j?.fehler ?? 'Das ging nicht.')); return; }
      setAccessKey(j.schluessel);
      setSchluesselOffen(true);
      setEigenerWunsch('');
      setWechselOffen(false);
      setWechselStand(j.discord === 'gesendet'
        ? t('Neuer Schlüssel — er liegt auch in deinem Discord-Kanal.')
        : t('Neuer Schlüssel gesetzt.'));
    } catch (e) { setWechselStand((e as Error).message); }
  };

  /**
   * Ein Profilbild waehlen.
   *
   * Dasselbe Verfahren wie unter "Account": im Browser auf 256 Pixel
   * verkleinert, quadratisch aus der Mitte. Ohne das landete ein Handyfoto
   * mit vier Megabyte in der Profildatei - angezeigt wird es ohnehin als
   * Kreis von sechsunddreissig Pixeln.
   *
   * Dass es das hier bisher nicht gab, war schlicht eine Luecke: wer ueber
   * einen Zugangsschluessel hereinkommt, sieht dieses Dashboard und nicht
   * die Kontoseite - und hatte damit keine Moeglichkeit, sein Bild zu
   * setzen, obwohl die Schnittstelle es laengst speichern konnte.
   */
  const bildWaehlen = (datei: File) => {
    const leser = new FileReader();
    leser.onload = () => {
      const roh = new Image();
      roh.onload = () => {
        const K = 256;
        const flaeche = document.createElement('canvas');
        flaeche.width = K; flaeche.height = K;
        const stift = flaeche.getContext('2d');
        if (!stift) return;
        const kante = Math.min(roh.width, roh.height);
        stift.drawImage(roh,
          (roh.width - kante) / 2, (roh.height - kante) / 2, kante, kante,
          0, 0, K, K);
        aendere({ avatarUrl: flaeche.toDataURL('image/webp', 0.85) });
      };
      roh.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  };

  const schluesselKopieren = async () => {
    if (!accessKey) return;
    try {
      await navigator.clipboard.writeText(accessKey);
      setMeldung(t('Zugangsschlüssel kopiert.')); setFehler('');
    } catch {
      setFehler(t('Kopieren fehlgeschlagen.'));
    }
  };

  const twitch = profile.socials.twitch.trim();

  /*
   * Welche Werkzeuge dieses Konto ueberhaupt sieht.
   *
   * Nur die Bereiche, die es pflegen darf: ein Manager sieht seine drei
   * Kacheln, nicht alle mit den gesperrten daneben. Einmal gerechnet, damit
   * die Seitenzahl unten dieselbe Liste meint wie die Anzeige.
   */
  const werkzeuge = [
    ...ADMIN_ZIELE.filter((z) => {
      const b = bereichVonPfad(z.href);
      if (!b) return true;
      if (istAdmin || rolle === 'admin' || zugang.admin) return true;
      return eigeneRechte.includes(b) || zugang.darfBereich(b);
    }),
    ...((istAdmin || rolle === 'admin' || zugang.admin) ? NUR_ADMIN : []),
  ];
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 py-6">

        {/* Kopf (neues Design, 14.10.2026): grosse Flaeche mit Leuchten, dem Namen gross und dem Abmelden als Kapsel. */}
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-7 shadow-[0_10px_30px_rgba(15,23,42,.18)] sm:px-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/60 text-2xl font-extrabold uppercase text-slate-300">
              {profile.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                : (profile.displayName || '?').trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500"><T>Dashboard</T></p>
              <h1 className="truncate text-3xl font-extrabold text-white sm:text-4xl">
                {laedt ? t('Wird geladen …') : (profile.displayName || t('Ohne Namen'))}
              </h1>
              {/* Ein Admin ist kein "VIP User" (Betreiber, 19.10.2026) - er traegt die Marke "Admin". */}
              {(zugang.admin || accountStatus) && (
                <span className="mt-1.5 inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-400">
                  {zugang.admin ? 'Admin' : accountStatus}
                </span>
              )}
            </div>
            <button type="button"
              onClick={() => { window.location.href = '/api/auth/logout'; }}
              className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-500/60 hover:text-rose-400">
              <T>Abmelden</T>
            </button>
          </div>
        </section>

        {/* Zwei Reiter, wenn es ein Konto gibt: das Dashboard und die Kontodaten (Profil, Account, Privacy). */}
        {zugang.nutzer && (
          <div className="mb-5 inline-flex gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
            {([['dashboard', 'Dashboard'], ['konto', 'Konto']] as const).map(([k, titel]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${tab === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                <T>{titel}</T>
              </button>
            ))}
          </div>
        )}
        {tab === 'konto' && zugang.nutzer ? <KontoInhalt eingebettet /> : (<>

        {/* Der Hinweis fuer den Stream: ein schmaler Streifen statt einer
            bildschirmfuellenden Tuer. Er warnt vor demselben und kostet
            keinen Klick, bevor man ueberhaupt etwas sieht. */}
        {!warnungWeg && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg
                          border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
            <p className="text-sm text-amber-200/90">
              <T>Diese Seite nicht im Stream zeigen — der Zugangsschlüssel steht hier.</T>
            </p>
            <button type="button" onClick={() => setWarnungWeg(true)}
              className="shrink-0 text-sm text-amber-200/60 transition
                         hover:text-amber-200">
              <T>Verstanden</T>
            </button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]" data-dash-spalten>
          <div className="space-y-4">

            {/*
              * Die Werkzeuge nach Stufen: fuer alle, nur fuer VIP, nur hier im Dashboard (Redesign 12.10.2026).
              * Die Overlays stehen nicht mehr in der Leiste, sondern hier bei den VIP-Werkzeugen.
              */}
            <Ebenen admin={istAdmin || rolle === 'admin' || zugang.admin}
              vip={zugang.vip || rolle === 'manager' || zugang.manager}
              pro={zugang.pro || rolle === 'pro'} />

            {/*
              * Die Admin-Zentrale steht danach: laeuft alles, was wartet auf
              * mich, und dann die Werkzeuge nach Themen. Die Laeufe und
              * Replay-Zahlen sieht nur der Admin; ein Manager bekommt seine
              * Werkzeuge.
              */}
            {(istAdmin || rolle === 'admin' || rolle === 'manager'
              || zugang.admin || zugang.manager) && !verwaltet && (
              <AdminZentrale werkzeuge={werkzeuge} teil="werkzeuge"
                zeigeLaeufe={istAdmin || rolle === 'admin' || zugang.admin} />
            )}

            {/* Profil */}
            <section id="profil" className="scroll-mt-20 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <h2 className="text-sm font-semibold text-slate-100"><T>Profil</T></h2>
              {/*
                * Bild und Adresse - beides gab es hier bisher nicht.
                *
                * Der Betreiber: "die VIPs koennen einfach ihr Profilbild
                * nicht switchen, genauso wie E-Mail hinzufuegen" - weil sie
                * dieses Dashboard sehen und nicht die Kontoseite, auf der
                * beides steht.
                */}
              {/*
                * Ein Manager hat kein eigenes Bild.
                *
                * Der Zugang gehoert mehreren; ein Bild waere nicht seines,
                * sondern das aller, die ihn benutzen. Dasselbe gilt fuer eine
                * Adresse und den Twitch-Chat weiter unten.
                */}
              <div className={`mt-3 flex-wrap items-center gap-4
                ${verwaltet ? 'hidden' : 'flex'}`}>
                <span className="relative grid h-20 w-20 place-items-center overflow-hidden
                                 rounded-xl border border-zinc-800 bg-zinc-900
                                 text-xl font-semibold uppercase text-slate-300">
                  {profile.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={profile.avatarUrl} alt=""
                        className="h-full w-full object-cover" />
                    : <SpielerPlatzhalter name={profile.displayName || '?'} />}
                </span>
                <div>
                  <label className="inline-block cursor-pointer rounded-lg border
                                    border-zinc-800 px-3 py-2 text-sm text-slate-300
                                    transition hover:border-sky-500">
                    <T>Bild wählen</T>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const d = e.target.files?.[0];
                        if (d) bildWaehlen(d);
                        e.target.value = '';
                      }} />
                  </label>
                  {profile.avatarUrl && (
                    <button type="button"
                      onClick={() => aendere({ avatarUrl: null })}
                      className="ml-2 text-xs text-slate-500 transition
                                 hover:text-rose-400">
                      <T>entfernen</T>
                    </button>
                  )}
                  <p className="mt-1 text-[11px] text-slate-600">
                    <T>Wird auf 256 Pixel verkleinert und quadratisch
                    zugeschnitten.</T>
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* Der Anzeigename gehoert zum Konto und steht fest. Ein Feld
                    dafuer taeuschte eine Wahl vor, die es nicht gibt. */}
                <div>
                  <span className="text-xs text-slate-500">
                    <T>Anzeigename</T> <span className="text-slate-600"><T>— vom Konto</T></span>
                  </span>
                  <p className="mt-1 rounded-lg border border-zinc-900 bg-zinc-900/40
                                px-3 py-2 text-sm text-slate-400">
                    {laedt ? '…' : (profile.displayName || '—')}
                  </p>
                </div>
                <label className={verwaltet ? 'hidden' : 'block'}>
                  <span className="text-xs text-slate-500">
                    <T>Twitch-Kanal</T> <span className="text-slate-600"><T>— für den Chat unten</T></span>
                  </span>
                  <input value={profile.socials.twitch}
                    onChange={(e) => aendere({
                      socials: { ...profile.socials, twitch: e.target.value.trim() },
                    })}
                    placeholder="kanalname"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900/80
                               px-3 py-2 text-sm text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                </label>

                <label className={verwaltet ? 'hidden' : 'block sm:col-span-2'}>
                  <span className="text-xs text-slate-500">
                    <T>E-Mail für Rückfragen</T>{' '}
                    <span className="text-slate-600"><T>— freiwillig</T></span>
                  </span>
                  <input value={profile.email ?? ''} type="email" inputMode="email"
                    onChange={(e) => aendere({ email: e.target.value })}
                    placeholder={t('damit dich eine Antwort auch per Mail erreicht')}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900/80
                               px-3 py-2 text-sm text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                </label>
              </div>

              {/* Kein Knopf mehr - nur die Rueckmeldung, dass es abgelegt ist. */}
              <p className="mt-2 h-4 text-xs">
                {speichert ? <span className="text-slate-500">Speichert …</span>
                  : fehler ? <span className="text-rose-400">{fehler}</span>
                  : meldung ? <span className="text-sky-400">{meldung}</span>
                  : <span className="text-slate-600">
                      <T>Änderungen werden von selbst gespeichert und gelten bei jeder Anmeldung.</T>
                    </span>}
              </p>
            </section>

            {/*
              * Der Zugangsschluessel - nur, wo es einen gibt.
              *
              * Er gehoert zum alten VIP-Weg, bei dem man sich mit Name und
              * Schluessel anmeldete. Wer ein Konto hat, meldet sich mit einem
              * Passwort an und braucht ihn nicht; ein leeres Kaestchen mit
              * ausgegrauten Knoepfen sah dagegen aus, als fehle etwas.
              */}
            {accessKey && (
            <section data-dash="schluessel" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <h2 className="text-sm font-semibold text-slate-100"><T>Zugangsschlüssel</T></h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-zinc-800
                                 bg-zinc-900/80 px-3 py-2 font-mono text-sm text-slate-200">
                  {accessKey
                    ? (schluesselOffen ? accessKey : '••••••••••••••••••••')
                    : t('Kein Schlüssel hinterlegt')}
                </code>
                <button type="button" disabled={!accessKey}
                  onClick={() => setSchluesselOffen((v) => !v)}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm
                             text-slate-300 transition hover:border-sky-500
                             disabled:cursor-not-allowed disabled:opacity-30">
                  <T>{schluesselOffen ? 'Verbergen' : 'Anzeigen'}</T>
                </button>
                <button type="button" disabled={!accessKey} onClick={schluesselKopieren}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm
                             text-slate-300 transition hover:border-sky-500
                             disabled:cursor-not-allowed disabled:opacity-30">
                  <T>Kopieren</T>
                </button>
                {darfWechseln && (
                  <button type="button" onClick={() => setWechselOffen((v) => !v)}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-sm
                               text-slate-300 transition hover:border-sky-500">
                    <T>Ändern</T>
                  </button>
                )}
              </div>

              {/*
                * Der Wechsel - nur fuer die, die es duerfen.
                *
                * Das Feld darf leer bleiben: dann kommt ein zufaelliger
                * Schluessel, und das ist der Normalfall. Wer einen bestimmten
                * will, tippt ihn hin.
                */}
              {darfWechseln && wechselOffen && (
                <div className="mt-3 rounded-lg border border-zinc-800
                                bg-zinc-900/40 p-3">
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    <T>Der alte Schlüssel gilt danach nicht mehr. Leer lassen
                    für einen zufälligen — oder einen eigenen eintippen, dann
                    gilt er genau so, mit Groß- und Kleinschreibung.</T>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={eigenerWunsch}
                      onChange={(e) => setEigenerWunsch(e.target.value)}
                      placeholder={t('freiwillig — eigener Schlüssel')}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-800
                                 bg-zinc-950 px-3 py-2 font-mono text-sm
                                 text-slate-100 outline-none
                                 placeholder:text-slate-600 focus:border-sky-500" />
                    <button type="button" onClick={() => void schluesselWechseln()}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-sm
                                 font-semibold text-white transition
                                 hover:bg-sky-400">
                      <T>Neuen Schlüssel setzen</T>
                    </button>
                  </div>
                </div>
              )}

              {wechselStand && (
                <p className="mt-2 text-xs text-slate-400">{wechselStand}</p>
              )}
            </section>
            )}

            {/* Mein Archiv - das private Archiv jedes Kontos (Overlays, Tierlists, ...) */}
            <div id="mein-archiv" data-dash="archiv" className="scroll-mt-20"><MeinArchiv /></div>
          </div>

          {/*
            * Der Chat bleibt: er ist der einzige Teil dieser Seite, den man
            * waehrend des Sendens tatsaechlich offen hat.
            *
            * Fuer einen Manager nicht - er sendet nicht selbst, und der Kanal
            * waere der eines anderen. Der Betreiber wollte ihn dort weg
            * haben.
            */}
          {!verwaltet && (
          <section data-dash="chat" className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <header className="flex items-center justify-between gap-3 border-b
                               border-zinc-800 px-4 py-2.5">
              <h2 className="truncate text-sm font-semibold text-slate-100">
                {twitch ? `Chat · ${twitch}` : 'Twitch-Chat'}
              </h2>
              {twitch && (
                <button type="button"
                  onClick={() => aendere({ twitchChatEnabled: !profile.twitchChatEnabled })}
                  aria-pressed={profile.twitchChatEnabled}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    profile.twitchChatEnabled
                      ? 'bg-sky-500/15 text-sky-400'
                      : 'border border-zinc-800 text-slate-500'}`}>
                  {profile.twitchChatEnabled ? 'An' : 'Aus'}
                </button>
              )}
            </header>

            {!twitch ? (
              <p className="p-8 text-center text-sm text-slate-500">
                <T>Trag oben deinen Twitch-Kanal ein, dann steht der Chat hier.</T>
              </p>
            ) : !profile.twitchChatEnabled ? (
              <p className="p-8 text-center text-sm text-slate-500">
                <T>Chat ist aus.</T>
              </p>
            ) : currentHost ? (
              <iframe title={`Twitch-Chat ${twitch}`}
                src={`https://www.twitch.tv/embed/${encodeURIComponent(twitch)}`
                   + `/chat?parent=${currentHost}&darkpopout`}
                /* Auf dem Handy kuerzer: in voller Hoehe war der Chat ein
                   halbmeterhoher schwarzer Block zwischen den Werkzeugen
                   und den Zahlen darunter, an dem man erst einmal
                   vorbeiscrollen musste. */
                className="h-[320px] w-full rounded-b-xl bg-black
                           sm:h-[560px] xl:h-[calc(100vh-230px)]" />
            ) : (
              <p className="p-8 text-center text-sm text-slate-500"><T>Chat wird geladen …</T></p>
            )}
          </section>
          )}
        </div>

        {/*
          * Ganz unten: was im Werkzeug los ist.
          *
          * Ausdruecklich hier und nicht bei den Admin-Werkzeugen - das sind
          * keine Werkzeuge, sondern etwas zum Ansehen, und es soll beim
          * Herunterscrollen von selbst auftauchen. Ueber die ganze Breite,
          * weil dreissig Balken in einer 380 Pixel breiten Spalte nicht mehr
          * zu unterscheiden waeren.
          */}
        {/*
          * Zwei zuklappbare Balken untereinander: Admin-Center (laeuft alles, was wartet,
          * Auftraege, Ladezeiten) und Usage. Beide zu, bis man draufdrueckt - der Betreiber
          * (11.10.2026): "das eher unten, als eine Linie, die sich oeffnen und zuklappen laesst."
          */}
        {(istAdmin || rolle === 'admin' || zugang.admin) && (
          <div className="mt-4 space-y-3">
            <Klappbar titel="Admin-Center" kennung="admin-center" hinweis="Läuft alles? Was wartet auf dich?">
              <AdminZentrale werkzeuge={werkzeuge} teil="status" zeigeLaeufe />
            </Klappbar>
            <Klappbar titel="Offline-Seiten" kennung="offline-seiten" hinweis="Was gerade nicht online ist">
              <OfflineSeiten />
            </Klappbar>
            <Klappbar titel="Usage" kennung="usage" hinweis="Besucher, Konten, Zugänge">
              <Nutzungszahlen />
            </Klappbar>
          </div>
        )}
        </>)}
      </div>

      {/*
        * Dieselbe Fusszeile wie unter der Startseite.
        *
        * Ausdruecklich gewuenscht: "das, was Home ganz unten ist, soll auch
        * unter Dashboard ganz unten sein." Sie steht ausserhalb des
        * eingerueckten Kastens, damit sie ueber die volle Breite laeuft - wie
        * drueben auch.
        */}
      <Fusszeile />
    </main>
  );
}
