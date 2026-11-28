import { useCallback, useEffect, useMemo, useState } from 'react';
import OrgWahl from './OrgWahl';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { Laedt, NurAdmins } from '../teile';
import { useT } from '../port/app/components/SprachProvider';
import { BEREICHE, VIP_BEREICHE as VIP_OEFFENTLICH } from '../port/lib/rechte';

/*
 * The VIP areas to tick - plus the private ones, named only here (admin-only
 * code), never in the shared lib/rechte (see PRIVATE_VIP_SCHLUESSEL).
 */
const VIP_BEREICHE: Array<{ schluessel: string; titel: string; was: string }> = [
  ...VIP_OEFFENTLICH,
  { schluessel: 'finest', titel: 'Finest Creative (private demo)', was: 'Scoreboards 1v1–4v4 with the animated map header - only for the operator and whoever is ticked here' },
];

// Die Kontoverwaltung.
//
// Hier steht, wer ein Konto hat, und hier werden Rechte vergeben. Bewusst
// ohne private Daten: keine Adressen, keine Social-Konten. Zum
// Wiedererkennen genuegen Name und Konto-Id, und die Id sieht jeder Nutzer
// auch bei sich selbst - so kann er sie weitergeben, wenn er etwas
// beantragen will.
//
// Drei Rollen und ein VIP mit Frist:
//
//   Nutzer   - die Vorgabe, darf nichts verwalten
//   Manager  - darf Karten anlegen und bearbeiten
//   Admin    - alles, auch diese Seite
//   VIP      - kommt obendrauf, mit oder ohne Ablaufdatum

/**
 * Ein Eintrag der Liste - gleich, woher er kommt.
 *
 * "art" sagt, auf welchem Weg jemand hereinkommt. Danach richtet sich nur,
 * welche Schnittstelle beim Aendern angesprochen wird; alles andere ist
 * fuer beide gleich.
 */
interface Konto {
  art?: 'konto' | 'schluessel';
  /** Nur bei Zugaengen: darf er den Schluessel selbst wechseln? */
  darfSchluessel?: boolean;
  /** Nur bei Zugaengen: der Schluessel selbst. */
  schluessel?: string;
  /** Nur bei Zugaengen: stillgelegt oder nicht. */
  aktiv?: boolean;
  id: string;
  name: string;
  rolle: 'admin' | 'manager' | 'pro' | null;
  /** Die Organisation, die das Konto verwaltet (Esports-Zugang) - sonst null. */
  org?: string | null;
  rechte: string[];
  epicId: string | null;
  vip: boolean;
  vipBis: number | null;
  gesperrt: { seit: number; grund: string } | null;
  ips: string[];
  dienste: string[];
  bestaetigt: boolean;
  angelegt: string;
  zuletzt: string | null;
}

const ROLLEN: Array<{
  wert: 'admin' | 'manager' | 'pro' | null; titel: string; was: string;
}> = [
  { wert: null, titel: 'User', was: 'cannot manage anything' },
  { wert: 'pro', titel: 'Pro', was: 'places themselves on the maps' },
  { wert: 'manager', titel: 'Manager', was: 'may use the ticked areas' },
  { wert: 'admin', titel: 'Admin', was: 'may do everything' },
];

const VIP_DAUER: Array<{ tage: number | null; titel: string }> = [
  { tage: null, titel: 'no VIP' },
  { tage: 7, titel: '7 days' },
  { tage: 30, titel: '30 days' },
  { tage: 90, titel: '90 days' },
  { tage: 0, titel: 'no end date' },
];

/**
 * Den Profi ueber seinen Spielernamen finden.
 *
 * Getippt wird der Name, gespeichert die Konto-Id - niemand kennt
 * zweiunddreissig Zeichen auswendig. Bei mehreren Treffern waehlt der Admin;
 * automatisch den ersten zu nehmen hiesse raten, und eine falsche Zuordnung
 * faellt erst auf, wenn sich der Falsche auf einer Karte eintraegt.
 */
function ProSuche({ aktuell, waehle }: {
  aktuell: string | null;
  waehle: (epicId: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [treffer, setTreffer] = useState<Array<{
    epicId: string; anzeige: string; land: string | null; matches: number;
  }>>([]);

  useEffect(() => {
    const q = text.trim();
    let weg = false;
    if (q.length < 2) {
      const zu = setTimeout(() => { if (!weg) setTreffer([]); }, 0);
      return () => { weg = true; clearTimeout(zu); };
    }
    const uhr = setTimeout(() => {
      void (async () => {
        try {
          const j = await (await fetch(
            `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)).json();
          if (!weg) setTreffer(Array.isArray(j?.spieler) ? j.spieler : []);
        } catch { if (!weg) setTreffer([]); }
      })();
    }, 300);
    return () => { weg = true; clearTimeout(uhr); };
  }, [text]);

  const feld = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 '
    + 'text-sm text-white outline-none placeholder:text-white/30 '
    + 'focus:border-akz';

  /*
   * Zu einer hinterlegten Id den Namen holen.
   *
   * Vorher stand die Id als grauer Platzhalter im Feld - das sieht aus wie
   * "nichts gespeichert", obwohl sie da war. Jetzt steht der Spielername
   * da, gruen abgehakt, und die Id klein darunter.
   */
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!aktuell) { setName(null); return; }
    let weg = false;
    void (async () => {
      try {
        const j = await (await fetch(`/api/szene-stats?spieler=${aktuell}`)).json();
        if (!weg) setName(String(j?.spieler?.anzeige || j?.spieler?.name || ''));
      } catch { /* dann bleibt es bei der Id */ }
    })();
    return () => { weg = true; };
  }, [aktuell]);

  const [aendern, setAendern] = useState(false);

  // Ist etwas hinterlegt und wird gerade nicht geaendert: nur zeigen.
  if (aktuell && !aendern) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border
                      border-emerald-800/50 bg-emerald-950/20 px-3 py-2.5">
        <span className="text-emerald-400" aria-hidden>✓</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {name || <T>hinterlegt</T>}
          </span>
          <code className="block font-mono text-[10px] text-white/30">
            {aktuell}
          </code>
        </span>
        <button onClick={() => setAendern(true)}
          className="ml-auto text-[11px] text-white/40 transition
                     hover:text-akz">
          <T>ändern</T>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input value={text} onChange={(e) => setText(e.target.value)}
        placeholder={t('Spielername …')}
        autoComplete="new-password" name="pro-suche"
        autoFocus={aendern}
        className={feld} />
      {aendern && (
        <button onClick={() => { setAendern(false); setText(''); setTreffer([]); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]
                     text-white/40 transition hover:text-white/70">
          <T>abbrechen</T>
        </button>
      )}

      {treffer.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg
                       border border-white/10 bg-black/40 shadow-xl">
          {treffer.map((v) => (
            <li key={v.epicId}>
              <button onClick={() => {
                waehle(v.epicId); setText(''); setTreffer([]); setAendern(false);
              }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left
                           text-sm text-white/85 transition hover:bg-white/[0.06]">
                <span className="min-w-0 flex-1 truncate">{v.anzeige}</span>
                <span className="shrink-0 text-[10px] text-white/30">
                  {v.matches} <T>Matches</T>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * VIP-Zugaenge anlegen.
 *
 * Der Betreiber wollte jemandem einen Zugang geben koennen, ohne dass die
 * andere Seite etwas tun muss: kein Konto anlegen, keine Adresse
 * bestaetigen. Ein Name genuegt, den Schluessel erzeugt der Server.
 *
 * Der Schluessel erscheint **genau einmal**, direkt nach dem Anlegen. Danach
 * steht er nur noch in der Datei - ihn jederzeit abrufbar zu machen hiesse,
 * ihn ueber jede offene Verwaltungsseite mitzuschicken. Wer ihn verliert,
 * bekommt einen neuen.
 *
 * Die gewoehnliche Anmeldung bleibt unberuehrt: dort geht weiterhin nur die
 * E-Mail-Adresse. Diese Zugaenge laufen ueber den VIP-Reiter.
 */
/** Wann ein Schluessel ablaeuft - "kein Ablauf", "läuft ab in N Tagen (Datum)" oder "abgelaufen". */
function AblaufMarke({ bis }: { bis: number | null }) {
  const t = useT();
  // Einmal beim Zeichnen festgehalten - die Liste wird ohnehin bei jeder Aenderung neu geholt.
  const [jetzt] = useState(() => Date.now());
  if (!bis) {
    return <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/40">{t('kein Ablauf')}</span>;
  }
  const datum = new Date(bis).toLocaleDateString('de-DE');
  if (bis <= jetzt) {
    return <span className="rounded border border-rose-700/60 bg-rose-950/30 px-1.5 py-0.5 text-[10px] text-rose-300">{t('abgelaufen')} · {datum}</span>;
  }
  const tage = Math.ceil((bis - jetzt) / 86_400_000);
  const bald = tage <= 3;
  return (
    <span title={new Date(bis).toLocaleString('de-DE')}
      className={`rounded border px-1.5 py-0.5 text-[10px] ${bald
        ? 'border-amber-600/60 bg-amber-950/30 text-amber-300' : 'border-akz/30 bg-akz/10 text-akz/90'}`}>
      {t(tage === 1 ? 'expires in 1 day' : 'expires in {n} days').replace('{n}', String(tage))} · {datum}
    </span>
  );
}

function VipZugaenge() {
  const t = useT();
  const [liste, setListe] = useState<Array<{
    name: string; schluessel: string; aktiv: boolean; angelegt: string;
    verwaltet?: string | null; mods?: string[];
    vipBis?: number | null; fristLoescht?: boolean;
  }>>([]);
  /**
   * Wie lange der neue Schluessel gilt (Betreiber, 15.11.2026: Schluessel nur noch auf Zeit, "e.g. valid for one month") - vorgegeben 30 Tage,
   * 0 = unbegrenzt. Laeuft er ab, gilt er nirgends mehr, Kanal und Zugang werden geloescht (lib/discord, vipAblaufLauf).
   */
  const [laufzeit, setLaufzeit] = useState<number>(30);
  const [laufzeitJetzt] = useState(() => Date.now());
  /** Wessen Schluessel gerade offen liegt - einer zur Zeit. */
  const [zeigt, setZeigt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [frisch, setFrisch] = useState<{ name: string; schluessel: string } | null>(null);
  const [fehler, setFehler] = useState('');
  const [offen, setOffen] = useState(false);

  const holen = useCallback(async () => {
    try {
      const j = await (await fetch('/api/admin/vip-zugaenge', { cache: 'no-store' })).json();
      setListe(Array.isArray(j?.zugaenge) ? j.zugaenge : []);
    } catch { /* dann eben leer */ }
  }, []);

  useEffect(() => {
    if (!offen) return;
    let weg = false;
    void Promise.resolve().then(() => { if (!weg) return holen(); });
    return () => { weg = true; };
  }, [offen, holen]);

  /*
   * Ob der Schluessel es nach Discord geschafft hat.
   *
   * Steht als eigene Zeile daneben und nicht als Fehler: der Schluessel gilt
   * in jedem Fall, auch wenn Discord gerade nicht erreichbar war. Nur weiss
   * der Betreiber dann, dass er ihn diesmal von Hand weitergeben muss -
   * ohne diese Zeile haette er es angenommen und der VIP haette gewartet.
   */
  const [discord, setDiscord] = useState<string | null>(null);

  /*
   * Wie der Schluessel aussehen soll.
   *
   * Leer heisst wie bisher: zwoelf zufaellige Zeichen. Ein Anfang bestimmt
   * die ersten Zeichen und laesst den Rest zufaellig - "AMAR-K7P2-QW9X".
   * Eine vollstaendige Vorgabe gilt genau so, wie sie dasteht.
   *
   * Beides zugleich ergaebe keinen Sinn, deshalb schliesst das Formular das
   * jeweils andere Feld aus, sobald in einem etwas steht.
   */
  const [praefix, setPraefix] = useState('');
  const [vorgabe, setVorgabe] = useState('');
  /**
   * Fuer wen dieser Zugang die Overlays verwaltet.
   *
   * Bleibt es leer, entsteht ein gewoehnlicher VIP-Zugang. Steht ein Name
   * darin, entsteht ein Manager-Zugang: mehrere Leute teilen ihn sich und
   * betreuen damit die Overlays dieses Streamers. Er bekommt seinen eigenen
   * Discord-Kanal in der Kategorie "Manager Access Keys" und darf nur an die
   * Overlays - nichts sonst.
   */
  const [verwaltet, setVerwaltet] = useState('');
  /**
   * Welcher Reiter offen ist - VIP oder VIP-Manager.
   *
   * Der Betreiber wollte das ausdruecklich getrennt: "wenn ich VIP druecke,
   * soll ich zwischen VIP erstellen oder VIP Manager erstellen switchen
   * koennen. Also es gibt so zwei Tabs im VIP Tab. Also nicht auf einer
   * Seite." Die beiden Faelle brauchen verschiedene Angaben - beim Manager
   * zaehlt, fuer wen er arbeitet, und der Name ergibt sich daraus -, und
   * nebeneinander sah das aus wie ein Feld, das man auch leer lassen kann.
   */
  const [art, setArt] = useState<'vip' | 'manager'>('vip');
  /**
   * Der Aufbau des Discord-Servers.
   *
   * null heisst "noch nicht angestossen". Sonst steht hier, was der Bot
   * getan hat - Zeile fuer Zeile, damit nachlesbar bleibt, was er angefasst
   * hat, statt nur "fertig" zu melden.
   */
  const [aufbau, setAufbau] = useState<{
    laeuft: boolean;
    schritte: Array<{ text: string; wert?: string }>;
    fehler: Array<{ text: string; wert?: string }>;
  } | null>(null);

  /**
   * Wie der Zugang eines Managers heisst.
   *
   * Aus dem Streamer abgeleitet und nicht von Hand getippt: der Betreiber
   * nannte das Muster selbst - "der VIP User, zum Beispiel Groupay, und dann
   * Manager, also Groupay Managers mit Mehrzahl". Zwei Felder, die
   * voneinander abhaengen, waeren zwei Gelegenheiten, sich zu vertippen.
   */
  const managerName = `${verwaltet.trim().toLowerCase()}-managers`;
  const zuName = art === 'manager' ? managerName : name.trim();
  const bereit = art === 'manager'
    ? verwaltet.trim().length >= 2 : name.trim().length >= 3;

  async function anlegen(neuerSchluessel = false) {
    setFehler(''); setDiscord(null);
    try {
      const r = await fetch('/api/admin/vip-zugaenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zuName,
          neuerSchluessel,
          // Beim Erneuern bleibt die Frist, wie sie ist - nur ein neuer Zugang bekommt die gewaehlte Laufzeit.
          ...(neuerSchluessel ? {} : { laufzeitTage: laufzeit }),
          ...(vorgabe.trim() ? { schluessel: vorgabe.trim() }
            : praefix.trim() ? { praefix: praefix.trim() } : {}),
          ...(art === 'manager' && verwaltet.trim()
            ? { verwaltet: verwaltet.trim() } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(t(j?.fehler ?? 'not saved')); return; }
      setFrisch({ name: j.name, schluessel: j.schluessel });
      setDiscord(j.discord ?? null);
      setName(''); setPraefix(''); setVorgabe(''); setVerwaltet(''); setLaufzeit(30);
      await holen();
    } catch (e) { setFehler((e as Error).message); }
  }

  /**
   * Die Frist eines vorhandenen Zugangs setzen - auch fuer alte Schluessel ohne Ablauf (die bleiben sonst unbegrenzt).
   * Derselbe Weg wie die VIP-Dauer eines Kontos (PUT vipTage); die Schluesselnachricht in Discord zieht nach.
   */
  async function fristSetzen(n: string, tage: number) {
    const text = tage
      ? t('Ablauf in {n} Tagen setzen? Danach gilt der Schlüssel nicht mehr, Kanal und Zugang werden gelöscht.').replace('{n}', String(tage))
      : t('Ablauf entfernen? Der Schlüssel gilt dann unbegrenzt.');
    if (!window.confirm(`${n}: ${text}`)) return;
    setFehler('');
    try {
      const r = await fetch('/api/admin/vip-zugaenge', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, vipTage: tage }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setFehler(t(j?.fehler ?? 'not saved')); }
      await holen();
    } catch (e) { setFehler((e as Error).message); }
  }

  /** Einen Zugang endgueltig entfernen. */
  async function entfernen(n: string) {
    if (!window.confirm(
      `${t('Diesen Zugang endgültig entfernen? Er kann sich dann nicht mehr anmelden.')}

${n}`)) return;
    await fetch(`/api/admin/vip-zugaenge?name=${encodeURIComponent(n)}`,
      { method: 'DELETE' });
    setZeigt(null);
    await holen();
  }

  /**
   * Einen neuen Schluessel fuer denselben Zugang.
   *
   * Der Name bleibt, nur der Schluessel wird ersetzt - der alte gilt ab
   * dann nicht mehr. Kein neuer Zugang, kein zweiter Eintrag.
   */
  async function erneuern(n: string) {
    setFehler(''); setDiscord(null);
    try {
      const r = await fetch('/api/admin/vip-zugaenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, neuerSchluessel: true }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(t(j?.fehler ?? 'not saved')); return; }
      setDiscord(j.discord ?? null);
      await holen();
      setZeigt(n);
    } catch (e) { setFehler((e as Error).message); }
  }

  /**
   * In diesen Zugang wechseln.
   *
   * Danach ist die Sitzung dieser Zugang - mit seiner Ansicht, seinen
   * Overlays, seinen Rechten. Der Betreiber wollte das, um zu sehen, was ein
   * VIP oder ein Manager tatsaechlich vor sich hat, ohne dessen Schluessel zu
   * kennen.
   *
   * Zurueck geht es nur ueber eine neue Anmeldung. Deshalb wird vorher
   * gefragt: ein Fehlklick wuerde sonst mitten in der Verwaltung die eigene
   * Sitzung tauschen.
   */
  async function wechseln(n: string) {
    const sicher = window.confirm(
      `${t('In diesen Zugang wechseln')}: ${n}

`
      + t('Zum Zurückkehren musst du dich neu anmelden.'));
    if (!sicher) return;
    setFehler('');
    try {
      const r = await fetch('/api/admin/konto-wechsel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(t(j?.fehler ?? 'Cannot switch')); return; }
      // Ganz neu laden, nicht nur umrouten: jede Seite haelt die Rechte aus
      // dem ersten Abruf fest.
      window.location.href = '/';
    } catch (e) { setFehler((e as Error).message); }
  }

  /**
   * Kategorien, Kanaele, Rechte und die Aushaenge in Discord herstellen.
   *
   * Beliebig oft anstossbar: der Aufbau legt nichts doppelt an, setzt die
   * Berechtigungen neu und ersetzt seine eigenen Texte. Gefragt wird
   * vorher, weil dabei die vorhandenen Nachrichten im Willkommenskanal
   * verschwinden - genau so bestellt, aber kein Fehlklick wert.
   */
  async function discordAufbauen() {
    const sicher = window.confirm(
      `${t('Discord einrichten')}

`
      + t('Creates the categories, channels and permissions and posts the '
        + 'notices again. Existing messages in the welcome channel are '
        + 'removed in the process.'));
    if (!sicher) return;
    setAufbau({ laeuft: true, schritte: [], fehler: [] });
    try {
      const r = await fetch('/api/admin/discord-aufbau', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ altesLoeschen: true }),
      });
      const j = await r.json().catch(() => ({}));
      setAufbau({
        laeuft: false,
        schritte: Array.isArray(j?.schritte) ? j.schritte : [],
        fehler: Array.isArray(j?.fehler) ? j.fehler
          : [{ text: j?.fehler ?? 'The setup could not be run.' }],
      });
    } catch (e) {
      setAufbau({
        laeuft: false, schritte: [], fehler: [{ text: (e as Error).message }],
      });
    }
  }

  /**
   * Alle Schluesselnachrichten in Discord neu schreiben.
   *
   * Nicht neu erzeugen - nur neu hinschreiben, vom Bot. Der Betreiber hatte
   * in einigen Kanaelen selbst getippt, und was von Hand kam, kann der Bot
   * spaeter nicht ersetzen.
   */
  async function schluesselNeu() {
    const sicher = window.confirm(
      `${t('Schlüssel neu schreiben')}

`
      + t('Clears every key channel and writes the valid key '
        + 'again — from the bot, with a button below. The keys themselves '
        + 'stay the same, nobody gets locked out.'));
    if (!sicher) return;
    setAufbau({ laeuft: true, schritte: [], fehler: [] });
    try {
      const r = await fetch('/api/admin/discord-aufbau', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'schluessel' }),
      });
      const j = await r.json().catch(() => ({}));
      setAufbau({
        laeuft: false,
        schritte: Array.isArray(j?.schritte) ? j.schritte : [],
        fehler: Array.isArray(j?.fehler) ? j.fehler
          : [{ text: j?.fehler ?? 'The setup could not be run.' }],
      });
    } catch (e) {
      setAufbau({
        laeuft: false, schritte: [], fehler: [{ text: (e as Error).message }],
      });
    }
  }

  async function umschalten(n: string, aktiv: boolean) {
    await fetch('/api/admin/vip-zugaenge', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, aktiv }),
    });
    await holen();
  }

  const feld = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 '
    + 'text-sm text-white outline-none placeholder:text-white/30 '
    + 'focus:border-akz';

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <button onClick={() => setOffen((v) => !v)}
        className="flex w-full items-center gap-2 text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em]
                         text-white/40">
          <T>VIP-Zugang anlegen</T>
        </span>
        <span className="ml-auto text-white/30">{offen ? '−' : '+'}</span>
      </button>

      {offen && (
        <div className="mt-4">
          {/*
            * Zwei Reiter, zwei Arten von Zugang.
            *
            * Sie sehen aus wie die Reiter, die anderswo im Werkzeug stehen -
            * ein neuer Sonderentwurf waere hier nur eine weitere Form, die
            * man lernen muss.
            */}
          <div className="mb-3 flex gap-1 rounded-lg border border-white/10
                          bg-black/30 p-1">
            {(['vip', 'manager'] as const).map((w) => (
              <button key={w} onClick={() => { setArt(w); setFehler(''); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px]
                            font-semibold transition ${art === w
                  ? 'bg-akz text-[#04050a]'
                  : 'text-white/55 hover:text-white/85'}`}>
                {w === 'vip' ? <T>VIP</T> : <T>VIP-Manager</T>}
              </button>
            ))}
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-white/30">
            {art === 'vip'
              ? <T>A name is enough — no email, no confirmation. The key is generated and shown exactly once. It is used to sign in under “VIP” on the sign-in page.</T>
              : <T>An access several people share: they look after one streamer's overlays with it and nothing else. The name comes from the streamer, the key lands in Discord under “Manager Access Keys”. When signing in, everyone also enters their own name — so each overlay shows who created it.</T>}
          </p>

          <div className="flex flex-wrap gap-2">
            {art === 'vip' ? (
              <input value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void anlegen(); }}
                placeholder={t('Benutzername')}
                autoComplete="new-password" name="vip-neu"
                className={`${feld} flex-1`} />
            ) : (
              <input value={verwaltet}
                onChange={(e) => setVerwaltet(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void anlegen(); }}
                placeholder={t('Streamer, dessen Overlays betreut werden')}
                list="vip-zugaenge"
                autoComplete="off" name="vip-verwaltet"
                className={`${feld} flex-1`} />
            )}
            <button onClick={() => anlegen()} disabled={!bereit}
              className="rounded-lg bg-akz px-5 text-sm font-semibold
                         text-[#04050a] transition hover:brightness-110
                         disabled:cursor-not-allowed disabled:opacity-40">
              <T>anlegen</T>
            </button>
          </div>

          {/*
            * Die vorhandenen Zugaenge als Vorschlag.
            *
            * Kein Auswahlfeld, weil hier auch "betreiber" stehen darf und die
            * Liste lang wird; ein Vorschlag beim Tippen genuegt. Manager
            * stehen nicht darin - ein Manager verwaltet keinen Manager.
            */}
          <datalist id="vip-zugaenge">
            {liste.filter((z) => !z.verwaltet).map((z) => (
              <option key={z.name} value={z.name} />
            ))}
            <option value="betreiber" />
          </datalist>

          {art === 'manager' && verwaltet.trim() && (
            <p className="mt-1.5 text-[11px] text-white/40">
              <T>Der Zugang heißt dann</T>{' '}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono
                               text-akz">{managerName}</code>
            </p>
          )}


          {/*
            * Den Schluessel mitbestimmen - freiwillig.
            *
            * Beide Felder duerfen leer bleiben, dann ist alles wie vorher.
            * Sie stehen unter dem Namen und nicht daneben, damit das
            * Uebliche - Name eintippen, anlegen - der kurze Weg bleibt.
            */}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider
                               text-white/30">
                <T>Anfang des Schlüssels</T> <T>— freiwillig</T>
              </span>
              <input value={praefix} disabled={Boolean(vorgabe.trim())}
                onChange={(e) => setPraefix(e.target.value)}
                placeholder="AMAR"
                className={`${feld} disabled:opacity-40`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider
                               text-white/30">
                <T>Ganzer Schlüssel von Hand</T> <T>— freiwillig</T>
              </span>
              <input value={vorgabe} disabled={Boolean(praefix.trim())}
                onChange={(e) => setVorgabe(e.target.value)}
                placeholder={t('gilt genau so, wie du ihn tippst')}
                className={`${feld} font-mono disabled:opacity-40`} />
            </label>
          </div>
          <p className="mt-1 text-[10px] text-white/30">
            <T>Beim Anmelden wird Zeichen für Zeichen verglichen — Groß- und
            Kleinschreibung zählt also mit.</T>
          </p>

          {/* Die Laufzeit - dieselben Stufen wie beim VIP eines Kontos (VIP_DAUER), vorgegeben 30 Tage. */}
          <div data-laufzeit className="mt-3">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">
              <T>Gültig für</T>
            </span>
            <div className="flex flex-wrap gap-1">
              {[7, 30, 90, 0].map((tage) => (
                <button key={tage} type="button" onClick={() => setLaufzeit(tage)}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${laufzeit === tage
                    ? 'border-akz bg-akz text-[#04050a]'
                    : 'border-white/10 text-white/55 hover:border-akz hover:text-white/85'}`}>
                  {tage ? t(`${tage} days`) : t('unbegrenzt')}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-white/30">
              {laufzeit
                ? <>{t('Läuft ab am')} {new Date(laufzeitJetzt + laufzeit * 86_400_000).toLocaleDateString('de-DE')} — <T>danach gilt der Schlüssel nicht mehr, Discord-Kanal und Zugang werden gelöscht.</T></>
                : <T>Kein Ablauf — der Schlüssel gilt, bis du ihn entfernst.</T>}
            </p>
          </div>


          {fehler && (
            <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/30
                          px-4 py-2.5 text-xs text-rose-300">{fehler}</p>
          )}

          {/*
            * Der Schluessel, einmalig. Auffaellig genug, dass ihn niemand
            * uebersieht und die Seite wechselt, bevor er ihn kopiert hat.
            */}
          {frisch && (
            <div className="mt-3 rounded-lg border border-amber-700/50
                            bg-amber-950/20 p-4">
              <p className="text-[11px] text-amber-300/80">
                <T>Schlüssel für</T> <strong>{frisch.name}</strong> —{' '}
                <T>er erscheint nur dieses eine Mal.</T>
              </p>
              <code className="mt-2 block select-all rounded-lg bg-black/40
                               px-3 py-2.5 text-center font-mono text-base
                               tracking-widest text-amber-200">
                {frisch.schluessel}
              </code>
              <button onClick={() => setFrisch(null)}
                className="mt-2 text-[11px] text-amber-300/70 transition
                           hover:text-amber-200">
                <T>notiert, ausblenden</T>
              </button>
            </div>
          )}

          {/*
            * Was Discord daraus gemacht hat.
            *
            * Gruen, wenn der Schluessel im Kanal des VIPs liegt - dann muss
            * niemand mehr etwas weitergeben. Bernstein, wenn nicht: der
            * Schluessel gilt trotzdem, er muss diesmal nur von Hand hin.
            */}
          {discord && (
            <p className={`mt-2 text-[11px] ${discord === 'gesendet'
              ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
              {discord === 'gesendet'
                ? <T>In den Discord-Kanal des VIPs gelegt — der alte Schlüssel dort ist weg.</T>
                : discord === 'nicht gesendet: kein-token'
                  ? <T>Discord: kein Bot-Token auf diesem Rechner hinterlegt.</T>
                  : discord === 'nicht gesendet: kein-kanal'
                    ? <T>Discord: der Kanal ließ sich nicht finden oder anlegen.</T>
                    : discord === 'nicht gesendet: abgelehnt'
                      ? <T>Discord hat die Nachricht abgelehnt — meist fehlt dem Bot
                          im Kanal das Recht, dort zu schreiben.</T>
                      : discord}
            </p>
          )}

          {liste.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {liste.map((z) => (
                <li key={z.name}
                  className="flex flex-wrap items-center gap-3 rounded-lg
                             border border-white/5 bg-black/20 px-3 py-2">
                  <span className={`text-sm ${z.aktiv
                    ? 'text-white/85' : 'text-white/30 line-through'}`}>
                    {z.name}
                  </span>
                  <span className="text-[10px] text-white/20">
                    {new Date(z.angelegt).toLocaleDateString('de-DE')}
                  </span>
                  {/* Der Ablauf - wie im Discord-Kanal des Zugangs (dort als Countdown). */}
                  <AblaufMarke bis={z.fristLoescht ? z.vipBis ?? null : null} />
                  <select aria-label={t('Ablauf setzen')} value=""
                    onChange={(e) => { if (e.target.value !== '') void fristSetzen(z.name, Number(e.target.value)); }}
                    className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-white/40 outline-none hover:border-akz">
                    <option value="">{t('Ablauf setzen …')}</option>
                    <option value="7">{t('7 Tage ab jetzt')}</option>
                    <option value="30">{t('30 Tage ab jetzt')}</option>
                    <option value="90">{t('90 Tage ab jetzt')}</option>
                    <option value="0">{t('unbegrenzt')}</option>
                  </select>
                  {/*
                    * Ein Manager-Zugang traegt, fuer wen er arbeitet.
                    *
                    * Ohne das sehen in der Liste zwei Namen gleich aus, und
                    * man wuesste nicht, welcher Zugang fremde Overlays
                    * betreut und welcher eigene hat.
                    */}
                  {z.verwaltet && (
                    <span className="rounded border border-akz/30
                                     bg-akz/10 px-1.5 py-0.5 text-[10px]
                                     text-akz/90">
                      <T>Manager für</T> {z.verwaltet}
                    </span>
                  )}
                  <button
                    onClick={() => setZeigt(zeigt === z.name ? null : z.name)}
                    className="ml-auto text-[11px] text-white/40 transition
                               hover:text-akz">
                    {zeigt === z.name ? <T>verbergen</T> : <T>Schlüssel zeigen</T>}
                  </button>
                  <button onClick={() => umschalten(z.name, !z.aktiv)}
                    className="text-[11px] text-white/40 transition
                               hover:text-akz">
                    {z.aktiv ? <T>stilllegen</T> : <T>wieder freigeben</T>}
                  </button>
                  <button onClick={() => erneuern(z.name)}
                    className="text-[11px] text-white/40 transition
                               hover:text-amber-400">
                    <T>neuer Schlüssel</T>
                  </button>
                  {/*
                    * Hineinsehen - nur bei einem Zugang, der auch gilt.
                    * In einen stillgelegten zu wechseln hiesse, sich selbst
                    * auszusperren: das Cookie waere sofort ungueltig.
                    */}
                  {z.aktiv && (
                    <button onClick={() => wechseln(z.name)}
                      className="text-[11px] text-white/40 transition
                                 hover:text-akz">
                      <T>hineinsehen</T>
                    </button>
                  )}
                  <button onClick={() => entfernen(z.name)}
                    className="text-[11px] text-white/30 transition
                               hover:text-rose-400">
                    <T>entfernen</T>
                  </button>

                  {/*
                    * Der Schluessel - erst auf Klick, und immer nur einer.
                    * Neun offene Schluessel nebeneinander waeren ein Bild,
                    * das man besser nicht im Stream hat.
                    */}
                  {zeigt === z.name && (
                    <code className="w-full select-all rounded-lg bg-black/40
                                     px-3 py-2 text-center font-mono text-sm
                                     tracking-widest text-amber-200">
                      {z.schluessel}
                    </code>
                  )}

                </li>
              ))}
            </ul>
          )}

          {/*
            * Der Discord-Server.
            *
            * Steht unter der Zugangsliste, weil es dieselbe Sache ist: jeder
            * Zugang hat dort seinen Kanal. Der Knopf richtet den Rest ein -
            * Support-Kategorie, Willkommenstext, die beiden Leitfaeden - und
            * ist beliebig oft drueckbar.
            */}
          <div className="mt-6 border-t border-white/5 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-semibold uppercase
                               tracking-[0.16em] text-white/40">
                <T>Discord</T>
              </span>
              <button onClick={() => discordAufbauen()}
                disabled={aufbau?.laeuft}
                className="rounded-lg border border-white/10 px-3 py-1.5
                           text-[11px] text-white/70 transition
                           hover:border-akz hover:text-akz
                           disabled:cursor-not-allowed disabled:opacity-40">
                {aufbau?.laeuft
                  ? <T>wird eingerichtet …</T> : <T>Server einrichten</T>}
              </button>
              <button onClick={() => schluesselNeu()}
                disabled={aufbau?.laeuft}
                className="rounded-lg border border-white/10 px-3 py-1.5
                           text-[11px] text-white/70 transition
                           hover:border-akz hover:text-akz
                           disabled:cursor-not-allowed disabled:opacity-40">
                <T>Schlüssel neu schreiben</T>
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/30">
              <T>Legt die Support-Kategorie an, schiebt den vorhandenen
              Support-Kanal hinein und stellt drei schreibgeschützte Aushänge
              auf: Willkommen, VIP-Leitfaden und Manager-Leitfaden — auf
              Englisch, mit einem Knopf für die deutsche Fassung. Die
              Schlüsselkanäle bleiben unberührt.</T>
            </p>

            {aufbau && !aufbau.laeuft && (
              <ul className="mt-3 space-y-1">
                {aufbau.schritte.map((z) => (
                  <li key={z.text + (z.wert ?? '')}
                    className="text-[11px] text-emerald-400/80">
                    <T>{z.text}</T>{z.wert ? ` — ${z.wert}` : ''}
                  </li>
                ))}
                {aufbau.fehler.map((z) => (
                  <li key={z.text + (z.wert ?? '')}
                    className="text-[11px] text-amber-400/80">
                    <T>{z.text}</T>{z.wert ? ` — ${z.wert}` : ''}
                  </li>
                ))}
                {!aufbau.schritte.length && !aufbau.fehler.length && (
                  <li className="text-[11px] text-white/30">
                    <T>Nichts zu tun.</T>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Die Filter der Kontenliste (Betreiber, 20.10.2026): "Filter zwischen Orgs, normalen Usern, von mir generierten Usern, VIP und Pro".
 * Ein Konto kann in mehreren stehen (ein Pro mit VIP zaehlt bei beiden); "Normal" ist, wer keine Besonderheit hat.
 */
type FilterArt = 'alle' | 'normal' | 'vip' | 'pro' | 'manager' | 'admin' | 'org' | 'erzeugt' | 'gesperrt';
const FILTER: Array<{ wert: FilterArt; titel: string; was: string; passt: (k: Konto) => boolean }> = [
  { wert: 'alle', titel: 'All', was: 'Every account and every access.', passt: () => true },
  { wert: 'normal', titel: 'Normal users', was: 'Registered themselves, without VIP, role or organisation.',
    passt: (k) => k.art !== 'schluessel' && !k.vip && !k.rolle && !k.org },
  { wert: 'vip', titel: 'VIP', was: 'With an active VIP (streamers and creators).', passt: (k) => k.vip },
  { wert: 'pro', titel: 'Pro', was: 'Pros - they share their POV and put themselves on the maps.', passt: (k) => k.rolle === 'pro' },
  { wert: 'manager', titel: 'Manager', was: 'May use the areas you ticked.', passt: (k) => k.rolle === 'manager' },
  { wert: 'admin', titel: 'Admin', was: 'May do everything.', passt: (k) => k.rolle === 'admin' },
  { wert: 'org', titel: 'Orgs', was: 'Accounts that manage an organisation (roster, colour).', passt: (k) => Boolean(k.org) },
  { wert: 'erzeugt', titel: 'Created by me', was: 'Access keys you created yourself (no registration).', passt: (k) => k.art === 'schluessel' },
  { wert: 'gesperrt', titel: 'Blocked', was: 'Blocked accounts and deactivated accesses.', passt: (k) => Boolean(k.gesperrt) },
];

/**
 * Das Org-Feld der Kontenliste (Betreiber, 20.10.2026: "ein Admin-Org-Panel"): welche Organisation hat welches Konto, wer pflegt sie, wie viele Spieler stehen im Kader.
 * Organisationen ohne Konto stehen darunter - dort fehlt nur noch die Zuordnung (im Konto der Person, Feld "Esports-Team"). Ein Klick auf den Namen oeffnet die Team-Seite
 * dieser Org (/org?org=...), auf der der Admin selbst alles aendern darf.
 */
interface OrgZeile { id: string; name: string; logo: string | null; farbe?: string | null; spieler: unknown[] }
function OrgUebersicht({ konten }: { konten: Konto[] }) {
  const t = useT();
  const [orgs, setOrgs] = useState<OrgZeile[] | null>(null);
  const [alle, setAlle] = useState(false);
  useEffect(() => {
    let weg = false;
    void fetch('/api/orgs', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (!weg) setOrgs(Array.isArray(j?.orgs) ? j.orgs : []); })
      .catch(() => { if (!weg) setOrgs([]); });
    return () => { weg = true; };
  }, []);
  if (!orgs) return null;
  const mitKonto = orgs.filter((o) => konten.some((k) => k.org === o.id));
  const ohne = orgs.filter((o) => !konten.some((k) => k.org === o.id));
  const zeile = (o: OrgZeile, verwalter: Konto[]) => (
    <div key={o.id} className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-2.5 first:border-t-0">
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-black/40" style={o.farbe ? { boxShadow: `inset 0 0 0 2px ${o.farbe}` } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {o.logo ? <img src={o.logo} alt="" className="h-full w-full object-contain p-0.5" /> : <span className="text-xs font-bold text-white/30">{o.name.slice(0, 1)}</span>}
      </span>
      <a href={`/org?org=${encodeURIComponent(o.id)}`} className="text-sm font-semibold text-white transition hover:text-akz">{o.name}</a>
      <span className="text-[11px] text-white/40">{o.spieler.length} <T>Spieler</T></span>
      <span className="ml-auto text-xs text-white/55">
        {verwalter.length ? verwalter.map((k) => k.name).join(', ') : <span className="text-white/30"><T>kein Konto zugeordnet</T></span>}
      </span>
    </div>
  );
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-500/30 bg-white/[0.035] backdrop-blur-xl">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-emerald-300"><T>Organisationen</T></h2>
        <span className="text-[11px] text-white/40">{mitKonto.length} <T>mit Konto</T> · {ohne.length} <T>ohne Konto</T></span>
        <a href="/admin/orgs" className="ml-auto text-xs font-semibold text-akz transition hover:text-akz"><T>Organisationen anlegen und pflegen</T> →</a>
      </header>
      {mitKonto.length === 0 && <p className="border-t border-white/10 px-4 py-4 text-xs text-white/40"><T>Noch keine Organisation hat ein Konto. Öffne das Konto der Person und wähle im Feld „Esports-Team“ die Organisation.</T></p>}
      {mitKonto.map((o) => zeile(o, konten.filter((k) => k.org === o.id)))}
      {ohne.length > 0 && (
        <div className="border-t border-white/10">
          <button type="button" onClick={() => setAlle((a) => !a)} className="w-full px-4 py-2.5 text-left text-xs font-semibold text-white/55 transition hover:text-white/85" aria-expanded={alle}>
            {alle ? '▾' : '▸'} {t('Organisationen ohne Konto')} ({ohne.length})
          </button>
          {alle && ohne.map((o) => zeile(o, []))}
        </div>
      )}
    </section>
  );
}

export default function KontenSeite() {
  const t = useT();
  const [konten, setKonten] = useState<Konto[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [erlaubt, setErlaubt] = useState(true);
  /** Die Ablage hat nicht geantwortet - das ist nicht "niemand registriert". */
  const [nichtErreichbar, setNichtErreichbar] = useState(false);
  const [suche, setSuche] = useState('');
  const [stand, setStand] = useState('');
  const [filter, setFilter] = useState<FilterArt>('alle');
  // Ein Link wie /admin/accounts?filter=org oeffnet gleich die richtige Liste.
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get('filter');
    const treffer = FILTER.find((x) => x.wert === w);
    if (treffer) setFilter(treffer.wert);
  }, []);
  const waehleFilter = (w: FilterArt) => {
    setFilter(w);
    try {
      const u = new URL(window.location.href);
      if (w === 'alle') u.searchParams.delete('filter'); else u.searchParams.set('filter', w);
      window.history.replaceState(null, '', u.toString());
    } catch { /* ohne Adresszeile bleibt es beim Zustand */ }
  };

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/konten', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); return; }
      if (!r.ok) { setNichtErreichbar(true); return; }
      setNichtErreichbar(false);
      const j = await r.json();
      const konten: Konto[] = (Array.isArray(j?.konten) ? j.konten : [])
        .map((k: Konto) => ({ ...k, art: 'konto' as const }));

      /*
       * Die selbst vergebenen Zugaenge dazu. Sie haben kein Konto im
       * eigentlichen Sinn - Name und Schluessel genuegen -, tragen aber
       * dieselben Angaben und gehoeren in dieselbe Liste.
       */
      let zugaenge: Konto[] = [];
      try {
        const z = await (await fetch('/api/admin/vip-zugaenge',
          { cache: 'no-store' })).json();
        zugaenge = (Array.isArray(z?.zugaenge) ? z.zugaenge : []).map((x: {
          name: string; schluessel: string; aktiv: boolean; angelegt: string;
          rolle: 'admin' | 'manager' | 'pro' | null; rechte: string[];
          epicId: string | null; vipBis: number | null; vip: boolean;
          darfSchluessel?: boolean;
        }) => ({
          art: 'schluessel' as const,
          id: x.name,
          name: x.name,
          schluessel: x.schluessel,
          aktiv: x.aktiv,
          rolle: x.rolle,
          rechte: x.rechte ?? [],
          epicId: x.epicId,
          vip: x.vip,
          vipBis: x.vipBis,
          /*
           * Beim Zusammenfuehren fiel dieses Feld heraus.
           *
           * Der Haken speicherte also richtig - der Server schrieb ihn, die
           * Liste holte ihn auch -, aber beim Umbauen in die gemeinsame
           * Zeile ging er verloren. Angezeigt wurde damit immer "aus", egal
           * was gespeichert war. So etwas ist schlimmer als ein Knopf, der
           * gar nicht funktioniert: man klickt, es passiert scheinbar
           * nichts, und man klickt wieder.
           */
          darfSchluessel: Boolean(x.darfSchluessel),
          // Ein stillgelegter Zugang ist das Gegenstueck zur Sperre.
          gesperrt: x.aktiv ? null : { seit: 0, grund: '' },
          ips: [],
          bestaetigt: true,
          dienste: [],
          angelegt: x.angelegt,
          zuletzt: null,
        }));
      } catch { /* ohne Zugaenge nur die Konten */ }

      setKonten([...konten, ...zugaenge]);
    } catch { setNichtErreichbar(true); }
    finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    // Einen Mikrotask spaeter: der Abruf setzt am Ende Zustand, und im
    // selben Durchlauf ergaebe das eine ueberfluessige zweite Zeichnung.
    let weg = false;
    void Promise.resolve().then(() => { if (!weg) return holen(); });
    return () => { weg = true; };
  }, [holen]);

  /** Wessen Schluessel gerade offen liegt - immer nur einer. */
  const [offenerSchluessel, setOffenerSchluessel] = useState<string | null>(null);

  /**
   * Darf dieser Zugang seinen Schluessel selbst wechseln?
   *
   * Eigener Aufruf und nicht in setzen() mit hinein: der schickt Rolle,
   * Rechte und VIP-Frist zusammen, und ein Haken soll nicht nebenbei eine
   * Rolle mitverstellen, die der Admin gerade gar nicht angefasst hat.
   */
  async function schluesselRecht(k: Konto, darf: boolean) {
    setStand(t('speichert …'));
    try {
      const r = await fetch('/api/admin/vip-zugaenge', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: k.name, darfSchluessel: darf }),
      });
      if (!r.ok) { setStand(t('nicht gespeichert')); return; }
      await holen();
      setStand(t('gespeichert'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  async function setzen(k: Konto, rolle: 'admin' | 'manager' | 'pro' | null,
    vipTage: number | null, bereiche?: string[], epicId?: string) {
    setStand(t('speichert …'));
    try {
      // Zwei Wege hinein, zwei Wege zum Aendern - die Oberflaeche daruber
      // ist dieselbe.
      const r = k.art === 'schluessel'
        ? await fetch('/api/admin/vip-zugaenge', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: k.name, rolle, vipTage, bereiche, epicId }),
        })
        : await fetch('/api/admin/konten', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: k.id, rolle, vipTage, bereiche, epicId }),
        });
      const j = await r.json();
      if (!r.ok) { setStand(j?.fehler ?? t('nicht gespeichert')); return; }
      await holen();
      setStand(t('gespeichert'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  /**
   * Sperren oder freigeben.
   *
   * Eigener Weg (PATCH), damit sich beim Umstellen der Rolle nicht
   * versehentlich die Sperre mitaendert - die beiden haben nichts
   * miteinander zu tun.
   */
  /**
   * Einen Eintrag endgueltig entfernen - Konto wie Zugang.
   *
   * Der Betreiber hat danach gesucht und nichts gefunden: einen Zugang
   * konnte man nur im eingeklappten Abschnitt "VIP-Zugang anlegen"
   * loeschen, ein gewoehnliches Konto ueberhaupt nicht. Beides steht jetzt
   * dort, wo man es sucht - neben dem Sperren.
   *
   * Mit Rueckfrage, weil es nichts rueckgaengig zu machen gibt.
   */
  async function loeschen(k: Konto) {
    const frage = k.art === 'schluessel'
      ? t('Diesen Zugang endgültig entfernen? Er kann sich dann nicht mehr anmelden.')
      : t('Dieses Konto endgültig entfernen? Das lässt sich nicht rückgängig machen.');
    if (!window.confirm(`${frage}

${k.name}`)) return;

    setStand(t('speichert …'));
    try {
      const r = k.art === 'schluessel'
        ? await fetch(`/api/admin/vip-zugaenge?name=${encodeURIComponent(k.name)}`,
          { method: 'DELETE' })
        : await fetch(`/api/admin/konten?id=${encodeURIComponent(k.id)}`,
          { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setStand(j?.fehler ?? t('nicht gespeichert')); return; }
      await holen();
      setStand(t('entfernt'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  /**
   * Eine Adresse von Hand als bestaetigt markieren.
   *
   * Weil das Werkzeug keine Mails verschickt, kann sich niemand selbst
   * bestaetigen - der Vermerk blieb sonst fuer immer stehen.
   */
  async function bestaetigen(k: Konto, wert: boolean) {
    await fetch('/api/admin/konten', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: k.id, bestaetigt: wert }),
    });
    await holen();
  }

  async function sperren(k: Konto, gesperrt: boolean) {
    // Ein Zugang wird stillgelegt statt gesperrt - dasselbe Ergebnis, ein
    // anderer Weg, weil er kein Konto im eigentlichen Sinn ist.
    if (k.art === 'schluessel') {
      await fetch('/api/admin/vip-zugaenge', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: k.name, aktiv: !gesperrt }),
      });
      await holen();
      return;
    }
    return sperrenKonto(k.id, gesperrt);
  }

  async function sperrenKonto(id: string, gesperrt: boolean) {
    const grund = gesperrt
      ? (window.prompt(t('Grund für die Sperre (nur du siehst ihn):')) ?? '')
      : '';
    if (gesperrt && grund === null) return;
    setStand(t('speichert …'));
    try {
      const r = await fetch('/api/admin/konten', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, gesperrt, grund }),
      });
      const j = await r.json();
      if (!r.ok) { setStand(j?.fehler ?? t('nicht gespeichert')); return; }
      setKonten(Array.isArray(j?.konten) ? j.konten : konten);
      setStand(gesperrt ? t('gesperrt') : t('freigegeben'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  const zahlen = useMemo(() => Object.fromEntries(
    FILTER.map((x) => [x.wert, konten.filter(x.passt).length])) as Record<FilterArt, number>, [konten]);
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const art = FILTER.find((x) => x.wert === filter) ?? FILTER[0];
    const liste = konten.filter(art.passt);
    if (!q) return liste;
    // Auch nach der Id suchen: der Nutzer nennt sie, wenn er etwas beantragt.
    return liste.filter((k) => k.name.toLowerCase().includes(q)
      || k.id.toLowerCase().includes(q));
  }, [konten, suche, filter]);

  // Aufgeklappte Konten (Betreiber, 19.10.2026: "weniger scrollen, einfacher zuteilen"): zu sehen sind nur Name und Marken, der Rest klappt auf Klick auf.
  const [offeneKarten, setOffeneKarten] = useState<Set<string>>(() => new Set());
  const kartenUmschalten = (id: string) => setOffeneKarten((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const istOffen = (id: string) => offeneKarten.has(id) || (suche.trim().length > 0 && gefiltert.length <= 2);

  if (laedt) {
    return (
      <Laedt />
    );
  }

  if (!erlaubt) {
    return (
      <NurAdmins />
    );
  }

  const feld = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 '
    + 'text-sm text-white outline-none placeholder:text-white/30 '
    + 'focus:border-akz';

  return (
    <main className="text-white">
      <div className="">

        <SeitenKopf className="mb-5" marke={<T>Nutzer und Zugang</T>} titel={<T>Konten</T>}
          rechts={<span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70">{konten.length} <T>angelegt</T></span>} />

        <p className="mb-6 text-[11px] leading-relaxed text-white/30">
          <T>No private data here — no addresses, no social accounts. Anyone requesting something gives you their account ID; they see it on their own “Account” page.</T>
        </p>

        <VipZugaenge />

        <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label={t('Konten filtern')}>
          {FILTER.map((x) => (
            <button key={x.wert} type="button" role="tab" aria-selected={filter === x.wert} onClick={() => waehleFilter(x.wert)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === x.wert
                ? 'border-akz bg-akz/15 text-akz'
                : 'border-white/10 bg-white/[0.035] backdrop-blur-xl text-white/55 hover:border-akz/60 hover:text-white/85'}`}>
              <T>{x.titel}</T>
              <span className={`ml-1.5 tabular-nums ${filter === x.wert ? 'text-akz' : 'text-white/30'}`}>{zahlen[x.wert]}</span>
            </button>
          ))}
        </div>
        <p className="mb-3 text-[11px] text-white/40"><T>{(FILTER.find((x) => x.wert === filter) ?? FILTER[0]).was}</T></p>
        {filter === 'org' && <OrgUebersicht konten={konten} />}
        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Nach Name oder Konto-Id suchen …')}
          className={`${feld} mb-4`} />

        {nichtErreichbar && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <T>Die Ablage antwortet gerade nicht. Die Konten sind da, nur gerade nicht lesbar.</T>
            {' '}<button onClick={() => void holen()} className="underline hover:text-amber-200"><T>Noch einmal</T></button>
          </p>
        )}
        {!gefiltert.length && !nichtErreichbar && (
          <p className="py-10 text-center text-xs text-white/30">
            {konten.length
              ? (filter === 'alle' ? <T>Kein Konto passt zur Suche.</T> : <T>In dieser Gruppe ist niemand (oder niemand passt zur Suche).</T>)
              : <T>Noch hat sich niemand registriert.</T>}
          </p>
        )}

        <div className="space-y-3">
          {gefiltert.map((k) => (
            <div key={k.id}
              className="fl !rounded-2xl p-4">
              <div className={`flex flex-wrap items-center gap-3 ${istOffen(k.id) ? 'mb-3' : ''}`}>
                <button type="button" onClick={() => kartenUmschalten(k.id)} aria-expanded={istOffen(k.id)}
                  title={istOffen(k.id) ? t('Zuklappen') : t('Aufklappen')}
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-xs text-white/55 transition hover:border-akz hover:text-akz">
                  {istOffen(k.id) ? '▾' : '▸'}
                </button>
                <span className="text-sm font-semibold text-white">
                  {k.name}
                </span>
                <span className="rounded-full border border-white/15 px-2
                                 py-0.5 text-[9px] uppercase tracking-wider
                                 text-white/30">
                  {k.art === 'schluessel' ? <T>Schlüssel</T> : <T>Konto</T>}
                </span>
                {k.rolle && (
                  <span className="rounded-full border border-akz/50
                                   bg-akz/10 px-2 py-0.5 text-[10px]
                                   font-semibold uppercase tracking-wider
                                   text-akz">
                    {k.rolle}
                  </span>
                )}
                {k.org && (
                  <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    Org · {k.org}
                  </span>
                )}
                {k.vip && (
                  <span className="rounded-full border border-amber-500/50
                                   bg-amber-500/10 px-2 py-0.5 text-[10px]
                                   font-semibold uppercase tracking-wider
                                   text-amber-400">
                    VIP{k.vipBis ? ` · ${new Date(k.vipBis)
                      .toLocaleDateString('de-DE')}` : ''}
                  </span>
                )}
                {k.gesperrt && (
                  <span className="rounded-full border border-rose-500/50
                                   bg-rose-500/10 px-2 py-0.5 text-[10px]
                                   font-semibold uppercase tracking-wider
                                   text-rose-400"
                    title={k.gesperrt.grund || undefined}>
                    <T>gesperrt</T>
                  </span>
                )}
                {/*
                  * Der Haken fuer den Selbstwechsel - nur bei Zugaengen.
                  *
                  * Ein Konto meldet sich mit Adresse und Passwort an und hat
                  * gar keinen Schluessel; dort waere der Haken sinnlos.
                  */}
                {k.art === 'schluessel' && (
                  <label className="flex items-center gap-1.5 text-[10px]
                                    text-white/40">
                    <input type="checkbox" checked={Boolean(k.darfSchluessel)}
                      onChange={(e) => void schluesselRecht(k, e.target.checked)}
                      className="h-3 w-3 accent-akz" />
                    <T>Darf den Schlüssel selbst wechseln</T>
                  </label>
                )}
                {!k.bestaetigt && k.art !== 'schluessel' && (
                  <button onClick={() => void bestaetigen(k, true)}
                    title={t('No confirmation email is sent — '
                      + 'as admin you confirm the address yourself.')}
                    className="rounded-full border border-white/15 px-2 py-0.5
                               text-[10px] text-white/40 transition
                               hover:border-akz hover:text-akz">
                    <T>nicht bestätigt</T> · <T>bestätigen</T>
                  </button>
                )}
                {/*
                  * Rechts steht, woran man den Eintrag wiedererkennt.
                  *
                  * Bei einem Konto ist das die Konto-Id - dieselbe, die der
                  * Nutzer bei sich unter "Account" sieht und weitergeben
                  * kann. Bei einem Zugang gibt es keine Id, dort ist es der
                  * Schluessel, und der liegt nicht offen herum: er
                  * erscheint erst auf Klick. Den Namen ein zweites Mal
                  * hinzuschreiben half niemandem.
                  */}
                {/*
                  * Darunter, wann es angelegt wurde.
                  *
                  * Ausdruecklich gewuenscht: "da, wo die Account-ID steht,
                  * darunter created at". Es beantwortet die Frage, die man
                  * beim Durchsehen einer Kontoliste am haeufigsten hat -
                  * ist das ein alter Hase oder von gestern.
                  */}
                <div className="ml-auto text-right">
                  {k.art === 'schluessel' ? (
                    <button type="button"
                      onClick={() => setOffenerSchluessel(
                        offenerSchluessel === k.name ? null : k.name)}
                      className="block font-mono text-[10px] text-white/20
                                 transition hover:text-akz">
                      {offenerSchluessel === k.name
                        ? k.schluessel
                        : <T>Schlüssel zeigen</T>}
                    </button>
                  ) : (
                    <code className="block font-mono text-[10px] text-white/20">
                      {k.id}
                    </code>
                  )}
                  {k.angelegt && !Number.isNaN(new Date(k.angelegt).getTime()) && (
                    <span className="mt-0.5 block text-[10px] text-white/30">
                      <T>erstellt</T>{' '}
                      {new Date(k.angelegt).toLocaleDateString('de-DE')}
                      {' · '}
                      {new Date(k.angelegt).toLocaleTimeString('de-DE', {
                        hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {istOffen(k.id) && (<>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[10px] uppercase
                                   tracking-wider text-white/30">
                    <T>Rolle</T>
                  </span>
                  <select value={k.rolle ?? ''}
                    onChange={(e) => setzen(k,
                      (e.target.value || null) as 'admin' | 'manager' | 'pro' | null,
                      k.vip ? (k.vipBis ? Math.max(1, Math.ceil(
                        (k.vipBis - Date.now()) / 86_400_000)) : 0) : null,
                      k.rechte)}
                    className={feld}>
                    {ROLLEN.map((r) => (
                      <option key={r.titel} value={r.wert ?? ''}>
                        {t(r.titel)} — {t(r.was)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1 block text-[10px] uppercase
                                   tracking-wider text-white/30">
                    <T>VIP</T>
                  </span>
                  <select
                    value={k.vip ? (k.vipBis ? 'frist' : '0') : ''}
                    onChange={(e) => {
                      const w = e.target.value;
                      const tage = w === '' ? null : Number(w);
                      setzen(k, k.rolle, Number.isNaN(tage) ? null : tage);
                    }}
                    className={feld}>
                    {VIP_DAUER.map((v) => (
                      <option key={v.titel} value={v.tage === null ? '' : String(v.tage)}>
                        {t(v.titel)}
                      </option>
                    ))}
                    {/* Eine laufende Frist steht als eigener Eintrag da,
                        damit die Auswahl nicht auf "kein VIP" springt. */}
                    {k.vip && k.vipBis ? (
                      <option value="frist">
                        {t('läuft bis')} {new Date(k.vipBis).toLocaleDateString('de-DE')}
                      </option>
                    ) : null}
                  </select>
                </label>
              </div>

              {/* Der Esports-Zugang: das Konto einer Organisation zuordnen (nur bei echten Konten, nicht bei Zugangsschluesseln). */}
              {!k.schluessel && <OrgWahl kontoId={k.id} org={k.org ?? null} />}

              {/*
                * Das Epic-Konto - nur bei "Pro".
                *
                * Ohne es kann sich niemand auf einer Karte eintragen: die
                * Karte erkennt den Spieler ueber die Konto-Id in ihrer
                * Teamliste wieder, nicht ueber den Namen. Gesucht wird hier
                * nach dem Spielernamen, die Id findet die Seite selbst -
                * eine Kennung von zweiunddreissig Zeichen kennt niemand
                * auswendig.
                */}
              {k.rolle === 'pro' && (
                <div className="mt-3 rounded-lg border border-white/10
                                bg-black/30 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider
                                text-white/30">
                    <T>Sein Epic-Konto</T>
                  </p>
                  <ProSuche
                    aktuell={k.epicId}
                    waehle={(epic) => setzen(k, 'pro',
                      k.vip ? (k.vipBis ? Math.max(1, Math.ceil(
                        (k.vipBis - Date.now()) / 86_400_000)) : 0) : null,
                      undefined, epic)}
                  />
                  {!k.epicId && (
                    <p className="mt-2 text-[11px] text-amber-500/80">
                      <T>Ohne Epic-Konto kann er sich nirgends eintragen.</T>
                    </p>
                  )}
                </div>
              )}

              {/*
                * Die Bereiche - nur bei "Manager". Ein Admin darf ohnehin
                * alles, und ohne Rolle gaebe es nichts anzuhaken.
                *
                * Die Kontoverwaltung fehlt mit Absicht: wer Rechte vergeben
                * darf, macht sich selbst zum Admin.
                */}
              {k.rolle === 'manager' && (
                <div className="mt-3 rounded-lg border border-white/10
                                bg-black/30 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider
                                text-white/30">
                    <T>Welche Bereiche</T>
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {BEREICHE.map((b) => {
                      const an = k.rechte.includes(b.schluessel);
                      return (
                        <label key={b.schluessel}
                          className={`flex cursor-pointer items-start gap-2
                                      rounded-lg px-2 py-1.5 transition ${an
                            ? 'bg-akz/10' : 'hover:bg-white/[0.06]'}`}>
                          <input type="checkbox" checked={an}
                            onChange={() => {
                              const neu = an
                                ? k.rechte.filter((x) => x !== b.schluessel)
                                : [...k.rechte, b.schluessel];
                              setzen(k, 'manager',
                                k.vip ? (k.vipBis ? Math.max(1, Math.ceil(
                                  (k.vipBis - Date.now()) / 86_400_000)) : 0) : null,
                                neu);
                            }}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-akz" />
                          <span className="min-w-0">
                            <span className={`block text-xs font-semibold ${an
                              ? 'text-akz' : 'text-white/70'}`}>
                              <T>{b.titel}</T>
                            </span>
                            <span className="block text-[10px] text-white/30">
                              <T>{b.was}</T>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
                * Bereiche, die auch ein VIP bekommen kann.
                *
                * Fuer die Globals 2026 wollte der Betreiber einem Streamer
                * die dafuer gebauten Overlays geben, ohne ihn zum Manager zu
                * machen: "dann kann ich einstellen, welche Streamer von was
                * Zugriff haben." Sichtbar ist das fuer den Streamer nur im
                * Dashboard, nicht in der Kopfzeile der Seite.
                */}
              {(k.vip || k.rolle) && (
                <div className="mt-3 rounded-lg border border-amber-500/25
                                bg-amber-950/10 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-amber-500/70">
                    <T>VIP-Bereiche</T>
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {VIP_BEREICHE.map((b) => {
                      // Der Admin hat den Bereich ohnehin - der Haken steht
                      // fest, statt leer und scheinbar abgeschaltet.
                      const admin = k.rolle === 'admin';
                      const an = admin || k.rechte.includes(b.schluessel);
                      return (
                        <label key={b.schluessel}
                          title={admin ? t('Die Adminrolle schließt diesen Bereich ein') : undefined}
                          className={`flex items-start gap-2 rounded-lg px-2 py-1.5
                                      transition ${admin ? 'cursor-default' : 'cursor-pointer'} ${an
                            ? 'bg-amber-500/10' : 'hover:bg-white/[0.06]'}`}>
                          <input type="checkbox" checked={an} disabled={admin}
                            onChange={() => {
                              const neu = an
                                ? k.rechte.filter((x) => x !== b.schluessel)
                                : [...k.rechte, b.schluessel];
                              setzen(k, k.rolle,
                                k.vip ? (k.vipBis ? Math.max(1, Math.ceil(
                                  (k.vipBis - Date.now()) / 86_400_000)) : 0) : null,
                                neu);
                            }}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-500" />
                          <span className="min-w-0">
                            <span className={`block text-xs font-semibold ${an
                              ? 'text-amber-300' : 'text-white/70'}`}>
                              <T>{b.titel}</T>
                            </span>
                            <span className="block text-[10px] text-white/30">
                              <T>{b.was}</T>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3
                              border-t border-white/5 pt-3">
                <button onClick={() => sperren(k, !k.gesperrt)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px]
                              font-semibold transition ${k.gesperrt
                    ? 'border-white/15 text-white/70 hover:border-akz hover:text-akz'
                    : 'border-white/10 text-white/40 hover:border-rose-500/60 hover:text-rose-400'}`}>
                  {k.gesperrt ? <T>freigeben</T> : <T>sperren</T>}
                </button>

                {/*
                  * Entfernen steht rechts aussen und in Rot - es ist die
                  * einzige Handlung auf dieser Seite, die sich nicht
                  * zuruecknehmen laesst.
                  */}
                <button onClick={() => loeschen(k)}
                  className="order-last ml-auto rounded-lg border
                             border-white/10 px-3 py-1.5 text-[11px]
                             font-semibold text-white/30 transition
                             hover:border-rose-600 hover:text-rose-400">
                  <T>entfernen</T>
                </button>

                {k.gesperrt?.grund && (
                  <span className="text-[11px] text-white/30">
                    {k.gesperrt.grund}
                  </span>
                )}

                {/*
                  * Die Anschluesse nur zur Ansicht. Gesperrt wird das Konto;
                  * der Anschluss haelt hoechstens davon ab, sofort ein
                  * neues anzulegen.
                  */}
                {k.ips.length > 0 && (
                  <span className="ml-auto font-mono text-[10px] text-white/20">
                    {k.ips[0]}
                  </span>
                )}
              </div>
              </>)}
            </div>
          ))}
        </div>

        {stand && (
          <p className="mt-4 text-xs text-white/40">{stand}</p>
        )}
      </div>
    </main>
  );
}
