'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { BEREICHE } from '@/lib/rechte';

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
  { wert: null, titel: 'Nutzer', was: 'darf nichts verwalten' },
  { wert: 'pro', titel: 'Pro', was: 'trägt sich selbst auf den Karten ein' },
  { wert: 'manager', titel: 'Manager', was: 'darf die angehakten Bereiche' },
  { wert: 'admin', titel: 'Admin', was: 'darf alles' },
];

const VIP_DAUER: Array<{ tage: number | null; titel: string }> = [
  { tage: null, titel: 'kein VIP' },
  { tage: 7, titel: '7 Tage' },
  { tage: 30, titel: '30 Tage' },
  { tage: 90, titel: '90 Tage' },
  { tage: 0, titel: 'ohne Ende' },
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

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

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
          <span className="block text-sm font-semibold text-slate-100">
            {name || <T>hinterlegt</T>}
          </span>
          <code className="block font-mono text-[10px] text-slate-600">
            {aktuell}
          </code>
        </span>
        <button onClick={() => setAendern(true)}
          className="ml-auto text-[11px] text-slate-500 transition
                     hover:text-sky-400">
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
                     text-slate-500 transition hover:text-slate-300">
          <T>abbrechen</T>
        </button>
      )}

      {treffer.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg
                       border border-zinc-800 bg-zinc-950 shadow-xl">
          {treffer.map((v) => (
            <li key={v.epicId}>
              <button onClick={() => {
                waehle(v.epicId); setText(''); setTreffer([]); setAendern(false);
              }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left
                           text-sm text-slate-200 transition hover:bg-zinc-900">
                <span className="min-w-0 flex-1 truncate">{v.anzeige}</span>
                <span className="shrink-0 text-[10px] text-slate-600">
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
function VipZugaenge() {
  const t = useT();
  const [liste, setListe] = useState<Array<{
    name: string; schluessel: string; aktiv: boolean; angelegt: string;
  }>>([]);
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

  async function anlegen(neuerSchluessel = false) {
    setFehler(''); setDiscord(null);
    try {
      const r = await fetch('/api/admin/vip-zugaenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          neuerSchluessel,
          ...(vorgabe.trim() ? { schluessel: vorgabe.trim() }
            : praefix.trim() ? { praefix: praefix.trim() } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(t(j?.fehler ?? 'nicht gespeichert')); return; }
      setFrisch({ name: j.name, schluessel: j.schluessel });
      setDiscord(j.discord ?? null);
      setName(''); setPraefix(''); setVorgabe('');
      await holen();
    } catch (e) { setFehler((e as Error).message); }
  }

  /** Einen Zugang endgueltig entfernen. */
  async function entfernen(n: string) {
    if (!window.confirm(
      t('Diesen Zugang endgültig entfernen? Er kann sich dann nicht mehr anmelden.')
        .replace('{n}', n))) return;
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
      if (!r.ok) { setFehler(t(j?.fehler ?? 'nicht gespeichert')); return; }
      setDiscord(j.discord ?? null);
      await holen();
      setZeigt(n);
    } catch (e) { setFehler((e as Error).message); }
  }

  async function umschalten(n: string, aktiv: boolean) {
    await fetch('/api/admin/vip-zugaenge', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, aktiv }),
    });
    await holen();
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <button onClick={() => setOffen((v) => !v)}
        className="flex w-full items-center gap-2 text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em]
                         text-slate-500">
          <T>VIP-Zugang anlegen</T>
        </span>
        <span className="ml-auto text-slate-600">{offen ? '−' : '+'}</span>
      </button>

      {offen && (
        <div className="mt-4">
          <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
            <T>Ein Name genügt — keine E-Mail, keine Bestätigung. Der
            Schlüssel wird erzeugt und erscheint genau einmal. Angemeldet wird
            sich damit unter „VIP&ldquo; auf der Anmeldeseite.</T>
          </p>

          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void anlegen(); }}
              placeholder={t('Benutzername')}
              autoComplete="new-password" name="vip-neu"
              className={`${feld} flex-1`} />
            <button onClick={() => anlegen()} disabled={name.trim().length < 3}
              className="rounded-lg bg-sky-500 px-5 text-sm font-semibold
                         text-white transition hover:bg-sky-400
                         disabled:cursor-not-allowed disabled:opacity-40">
              <T>anlegen</T>
            </button>
          </div>

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
                               text-slate-600">
                <T>Anfang des Schlüssels</T> <T>— freiwillig</T>
              </span>
              <input value={praefix} disabled={Boolean(vorgabe.trim())}
                onChange={(e) => setPraefix(e.target.value)}
                placeholder="AMAR"
                className={`${feld} disabled:opacity-40`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider
                               text-slate-600">
                <T>Ganzer Schlüssel von Hand</T> <T>— freiwillig</T>
              </span>
              <input value={vorgabe} disabled={Boolean(praefix.trim())}
                onChange={(e) => setVorgabe(e.target.value)}
                placeholder={t('gilt genau so, wie du ihn tippst')}
                className={`${feld} font-mono disabled:opacity-40`} />
            </label>
          </div>
          <p className="mt-1 text-[10px] text-slate-600">
            <T>Beim Anmelden wird Zeichen für Zeichen verglichen — Groß- und
            Kleinschreibung zählt also mit.</T>
          </p>

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
              <code className="mt-2 block select-all rounded-lg bg-zinc-950
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
                             border border-zinc-900 bg-zinc-950/40 px-3 py-2">
                  <span className={`text-sm ${z.aktiv
                    ? 'text-slate-200' : 'text-slate-600 line-through'}`}>
                    {z.name}
                  </span>
                  <span className="text-[10px] text-slate-700">
                    {new Date(z.angelegt).toLocaleDateString('de-DE')}
                  </span>
                  <button
                    onClick={() => setZeigt(zeigt === z.name ? null : z.name)}
                    className="ml-auto text-[11px] text-slate-500 transition
                               hover:text-sky-400">
                    {zeigt === z.name ? <T>verbergen</T> : <T>Schlüssel zeigen</T>}
                  </button>
                  <button onClick={() => umschalten(z.name, !z.aktiv)}
                    className="text-[11px] text-slate-500 transition
                               hover:text-sky-400">
                    {z.aktiv ? <T>stilllegen</T> : <T>wieder freigeben</T>}
                  </button>
                  <button onClick={() => erneuern(z.name)}
                    className="text-[11px] text-slate-500 transition
                               hover:text-amber-400">
                    <T>neuer Schlüssel</T>
                  </button>
                  <button onClick={() => entfernen(z.name)}
                    className="text-[11px] text-slate-600 transition
                               hover:text-rose-400">
                    <T>entfernen</T>
                  </button>

                  {/*
                    * Der Schluessel - erst auf Klick, und immer nur einer.
                    * Neun offene Schluessel nebeneinander waeren ein Bild,
                    * das man besser nicht im Stream hat.
                    */}
                  {zeigt === z.name && (
                    <code className="w-full select-all rounded-lg bg-zinc-950
                                     px-3 py-2 text-center font-mono text-sm
                                     tracking-widest text-amber-200">
                      {z.schluessel}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          )}
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
  const [suche, setSuche] = useState('');
  const [stand, setStand] = useState('');

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/konten', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); return; }
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
    } catch { setErlaubt(false); }
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

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return konten;
    // Auch nach der Id suchen: der Nutzer nennt sie, wenn er etwas beantragt.
    return konten.filter((k) => k.name.toLowerCase().includes(q)
      || k.id.toLowerCase().includes(q));
  }, [konten, suche]);

  if (laedt) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-20 text-center">
        <p className="text-xs text-slate-600"><T>Wird geladen …</T></p>
      </main>
    );
  }

  if (!erlaubt) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-100">
        <p className="text-sm text-slate-500">
          <T>Dieser Bereich ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">

        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-bold"><T>Konten</T></h1>
          <span className="text-xs text-slate-600">
            {konten.length} <T>angelegt</T>
          </span>
          <Link href="/admin" className="ml-auto text-xs text-slate-500
                                         transition hover:text-sky-400">
            ← <T>zur Verwaltung</T>
          </Link>
        </div>

        <p className="mb-6 text-[11px] leading-relaxed text-slate-600">
          <T>Hier stehen keine privaten Daten — keine Adressen, keine
          Social-Konten. Wer etwas beantragt, nennt dir seine Konto-Id; die
          sieht er bei sich selbst unter „Account&ldquo;.</T>
        </p>

        <VipZugaenge />

        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Nach Name oder Konto-Id suchen …')}
          className={`${feld} mb-4`} />

        {!gefiltert.length && (
          <p className="py-10 text-center text-xs text-slate-600">
            {konten.length
              ? <T>Kein Konto passt zur Suche.</T>
              : <T>Noch hat sich niemand registriert.</T>}
          </p>
        )}

        <div className="space-y-3">
          {gefiltert.map((k) => (
            <div key={k.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-100">
                  {k.name}
                </span>
                <span className="rounded-full border border-zinc-700 px-2
                                 py-0.5 text-[9px] uppercase tracking-wider
                                 text-slate-600">
                  {k.art === 'schluessel' ? <T>Schlüssel</T> : <T>Konto</T>}
                </span>
                {k.rolle && (
                  <span className="rounded-full border border-sky-500/50
                                   bg-sky-500/10 px-2 py-0.5 text-[10px]
                                   font-semibold uppercase tracking-wider
                                   text-sky-400">
                    {k.rolle}
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
                                    text-slate-500">
                    <input type="checkbox" checked={Boolean(k.darfSchluessel)}
                      onChange={(e) => void schluesselRecht(k, e.target.checked)}
                      className="h-3 w-3 accent-sky-500" />
                    <T>Darf den Schlüssel selbst wechseln</T>
                  </label>
                )}
                {!k.bestaetigt && k.art !== 'schluessel' && (
                  <button onClick={() => void bestaetigen(k, true)}
                    title={t('Es wird keine Bestätigungsmail verschickt — '
                      + 'als Admin bestätigst du die Adresse selbst.')}
                    className="rounded-full border border-zinc-700 px-2 py-0.5
                               text-[10px] text-slate-500 transition
                               hover:border-sky-500 hover:text-sky-400">
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
                      className="block font-mono text-[10px] text-slate-700
                                 transition hover:text-sky-400">
                      {offenerSchluessel === k.name
                        ? k.schluessel
                        : <T>Schlüssel zeigen</T>}
                    </button>
                  ) : (
                    <code className="block font-mono text-[10px] text-slate-700">
                      {k.id}
                    </code>
                  )}
                  {k.angelegt && !Number.isNaN(new Date(k.angelegt).getTime()) && (
                    <span className="mt-0.5 block text-[10px] text-slate-600">
                      <T>erstellt</T>{' '}
                      {new Date(k.angelegt).toLocaleDateString('de-DE')}
                      {' · '}
                      {new Date(k.angelegt).toLocaleTimeString('de-DE', {
                        hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[10px] uppercase
                                   tracking-wider text-slate-600">
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
                                   tracking-wider text-slate-600">
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
                <div className="mt-3 rounded-lg border border-zinc-800
                                bg-zinc-950/60 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider
                                text-slate-600">
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
                <div className="mt-3 rounded-lg border border-zinc-800
                                bg-zinc-950/60 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider
                                text-slate-600">
                    <T>Welche Bereiche</T>
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {BEREICHE.map((b) => {
                      const an = k.rechte.includes(b.schluessel);
                      return (
                        <label key={b.schluessel}
                          className={`flex cursor-pointer items-start gap-2
                                      rounded-lg px-2 py-1.5 transition ${an
                            ? 'bg-sky-500/10' : 'hover:bg-zinc-900'}`}>
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
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-500" />
                          <span className="min-w-0">
                            <span className={`block text-xs font-semibold ${an
                              ? 'text-sky-400' : 'text-slate-300'}`}>
                              <T>{b.titel}</T>
                            </span>
                            <span className="block text-[10px] text-slate-600">
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
                              border-t border-zinc-900 pt-3">
                <button onClick={() => sperren(k, !k.gesperrt)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px]
                              font-semibold transition ${k.gesperrt
                    ? 'border-zinc-700 text-slate-300 hover:border-sky-500 hover:text-sky-400'
                    : 'border-zinc-800 text-slate-500 hover:border-rose-500/60 hover:text-rose-400'}`}>
                  {k.gesperrt ? <T>freigeben</T> : <T>sperren</T>}
                </button>

                {/*
                  * Entfernen steht rechts aussen und in Rot - es ist die
                  * einzige Handlung auf dieser Seite, die sich nicht
                  * zuruecknehmen laesst.
                  */}
                <button onClick={() => loeschen(k)}
                  className="order-last ml-auto rounded-lg border
                             border-zinc-800 px-3 py-1.5 text-[11px]
                             font-semibold text-slate-600 transition
                             hover:border-rose-600 hover:text-rose-400">
                  <T>entfernen</T>
                </button>

                {k.gesperrt?.grund && (
                  <span className="text-[11px] text-slate-600">
                    {k.gesperrt.grund}
                  </span>
                )}

                {/*
                  * Die Anschluesse nur zur Ansicht. Gesperrt wird das Konto;
                  * der Anschluss haelt hoechstens davon ab, sofort ein
                  * neues anzulegen.
                  */}
                {k.ips.length > 0 && (
                  <span className="ml-auto font-mono text-[10px] text-slate-700">
                    {k.ips[0]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {stand && (
          <p className="mt-4 text-xs text-slate-500">{stand}</p>
        )}
      </div>
    </main>
  );
}
