'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import T from '@/app/components/T';
import MeinErgebnis from './MeinErgebnis';
import { rundenName } from '@/lib/rundenName';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import { BEREICHE as VERWALTUNGSBEREICHE, type Bereich as BereichRecht } from '@/lib/rechte';
import { liesChatHud, setzeChatHud, CHAT_HUD_EREIGNIS } from '@/app/lib/chatHud';
import ChatFenster from '@/app/components/ChatFenster';

// Das eigene Konto.
//
// Vier Bereiche statt einer langen Liste - die Seite war vorher ein Stapel
// aus drei Kaesten, in dem Profilbild, Passwort und das Loeschen gar nicht
// vorkamen:
//
//   My stats  - Werte zu einem Epic-Konto, wahlweise ueber alle Spieltage
//               oder zu einem einzelnen Cup.
//   Socials   - die eigenen Konten. Nur hier, beim eigenen Konto; im
//               Werkzeug selbst werden keine fremden Social-Konten
//               ausgestellt.
//   Account   - Anzeigename, Profilbild, Passwort.
//   Privacy   - das Konto endgueltig entfernen.
//
// Das Abmelden steht ganz unten, wo es niemanden aus Versehen trifft.
//
// Zu "My stats": die Werte kommen aus derselben Auskunft wie jedes
// Spielerprofil, ueber die Epic-Konto-Id. Die Cup-Liste entsteht aus den
// tatsaechlichen Spieltagen dieses Kontos - es gibt keine Liste von Cups,
// zu denen dann doch nichts vorliegt.

interface Konto {
  id: string; email: string; name: string; bestaetigt: boolean;
  dienste: string[]; epicId: string | null; hatPasswort: boolean;
  socials: Record<string, string>; bild: string | null; angelegt: string;
}

interface VerlaufZeile {
  event: string; windowId: string; region: string; season: string;
  werte: Record<string, number | string>;
}

const SOCIALS = [
  { schluessel: 'x', titel: 'X', vorsatz: '@' },
  { schluessel: 'twitch', titel: 'Twitch', vorsatz: '' },
  { schluessel: 'youtube', titel: 'YouTube', vorsatz: '@' },
  { schluessel: 'tiktok', titel: 'TikTok', vorsatz: '@' },
  { schluessel: 'discord', titel: 'Discord', vorsatz: '' },
];

type Bereich = 'stats' | 'socials' | 'chat' | 'konto' | 'privat' | 'werkzeuge';

const BEREICHE: Array<{ wert: Bereich; titel: string }> = [
  { wert: 'socials', titel: 'Socials' },
  /*
   * Der Chat steht hier oben bei den anderen Bereichen.
   *
   * Vorher hing er unter "Account" hinter einem Knopf "Nachrichten
   * oeffnen". Der Betreiber wollte ihn "wirklich dort, wo Socials,
   * Account, Privacy steht" - und das ist richtig so: ein Gespraech ist
   * ein eigener Ort, kein Anhaengsel der Kontodaten.
   */
  { wert: 'chat', titel: 'Chat' },
  { wert: 'konto', titel: 'Account' },
  { wert: 'privat', titel: 'Privacy' },
];

/*
 * Die Werkzeuge, die es hinter einer Rolle gibt.
 *
 * "recht" ist der Bereich aus lib/rechte - ein Manager sieht daran, was
 * ihm angehakt wurde. "nurAdmin" heisst: kein Manager kommt hier hinein,
 * auch nicht mit Haken. Die Kontoverwaltung gehoert dazu, denn wer Rechte
 * vergeben darf, macht sich selbst zum Admin.
 */
const WERKZEUGE: Array<{
  pfad: string; titel: string; was: string;
  recht?: BereichRecht; nurAdmin?: boolean;
}> = [
  ...VERWALTUNGSBEREICHE.map((b) => ({
    pfad: b.pfad, titel: b.titel, was: b.was, recht: b.schluessel,
  })),
  { pfad: '/admin/konten', titel: 'Kontoverwaltung', nurAdmin: true,
    was: 'Rollen vergeben, VIP befristen, Konten sperren' },
  { pfad: '/admin/sektionen', titel: 'Sections', nurAdmin: true,
    was: 'Bereiche auf Standby oder Offline stellen' },
  { pfad: '/admin/vips', titel: 'VIPs', nurAdmin: true,
    was: 'Wer auf der Startseite gezeigt wird' },
  { pfad: '/tierlist', titel: 'Tierlist', nurAdmin: true,
    was: 'Namen umbenennen, Flaggen und Stufen pflegen' },
  { pfad: '/overlays', titel: 'Overlays', nurAdmin: true,
    was: 'Einblendungen für den Stream bauen' },
];

/** Die Werte, die eine Kachel bekommen - je Cup dieselben wie insgesamt. */
const KACHELN: Array<[string, string]> = [
  ['matches', 'Matches'], ['elims', 'Elims'], ['damage', 'Schaden'],
  ['headshots', 'Kopftreffer'], ['assists', 'Assists'], ['mats', 'Material'],
  ['builds', 'Bauteile'], ['events', 'Spieltage'],
];

/**
 * Aus der Rohkennung eines Turniers eine lesbare Zeile machen.
 *
 * Die Quelle fuehrt "CH7S2FNCSDivision1FinalsWeek1"; in der Auswahlliste
 * gehoert "FNCS Division 1 Finals Week 1" hin. Dieselbe Aufbereitung wie auf
 * der Statistikseite - geaendert wird nur die Schreibweise fuer die Anzeige,
 * verglichen wird weiterhin ueber den Namen der Quelle.
 */
function turnierName(roh: string) {
  if (!roh) return roh;
  let t = roh.replace(/^CH\d+S\d+/i, '').replace(/_/g, ' ');
  t = t.replace(/([A-Za-z])(\d)/g, '$1 $2');
  t = t.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  t = t.replace(/(FNCS|LCL|ZB|BR)([A-Z])/g, '$1 $2');
  if (!t.includes(' - ')) t = t.replace(/\s+(Day \d+)$/i, ' - $1');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || roh;
}

/**
 * Eine Zahl - oder ein Strich, wenn die Quelle nichts geliefert hat.
 *
 * Der Unterschied zwischen "null" und "nicht uebermittelt" faellt sonst
 * unter den Tisch, und eine Null sieht aus wie eine Messung.
 */
function zahlOderStrich(wert: unknown, runden = false) {
  if (typeof wert !== 'number' || Number.isNaN(wert)) return '—';
  const z = runden ? Math.round(wert) : wert;
  return z.toLocaleString('de-DE');
}

/** Welches Feld im Verlauf zu welcher Kachel gehoert. */
const AUS_VERLAUF: Record<string, string> = {
  matches: 'matchesPlayed', elims: 'eliminations', damage: 'damageDealt',
  headshots: 'headshots', assists: 'assists',
};

export default function KontoSeite() {
  const t = useT();
  const router = useRouter();
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  const zugang = useZugang();
  const [konto, setKonto] = useState<Konto | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [bereich, setBereich] = useState<Bereich>('konto');

  /*
   * Ob das Chatsymbol am Bildschirmrand steht.
   *
   * Erst nach dem Zusammenfuegen im Browser gelesen: die Einstellung liegt im
   * Browser, und ein Server weiss davon nichts. Wer das hier waehrend des
   * Zeichnens laese, bekaeme eine Abweichung gemeldet.
   */
  const [chatAmRand, setChatAmRand] = useState<boolean | null>(null);
  useEffect(() => {
    setChatAmRand(liesChatHud());
    const beiAenderung = (e: Event) => setChatAmRand((e as CustomEvent).detail !== false);
    window.addEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
    return () => window.removeEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
  }, []);
  const [stand, setStand] = useState('');

  const [name, setName] = useState('');
  const [bild, setBild] = useState<string | null>(null);
  const [socials, setSocials] = useState<Record<string, string>>({});

  // My stats
  const [epicId, setEpicId] = useState('');
  /*
   * Das eigene, vom Betreiber zugewiesene Epic-Konto.
   *
   * Bewusst getrennt von "epicId": das ist das Konto, das gerade nachgeschlagen
   * wird, und das wechselt mit jeder Suche. "Mein Turnierweg" soll aber der
   * eigene bleiben, auch waehrend man jemand anderen ansieht.
   */
  const [meinEpic, setMeinEpic] = useState('');
  /** Zuletzt nachgeschlagene Spieler - haengt am Konto, nicht am Browser. */
  const [spielerVerlauf, setSpielerVerlauf] =
    useState<Array<{ id: string; name: string }>>([]);
  const [gesucht, setGesucht] = useState('');
  /** Was im Feld steht - ein Name, oder ausnahmsweise eine Id. */
  const [suchtext, setSuchtext] = useState('');
  const [vorschlaege, setVorschlaege] = useState<Array<{
    epicId: string; anzeige: string; land: string | null; matches: number;
  }>>([]);
  const [suchtLaeuft, setSuchtLaeuft] = useState(false);

  /* Die Suche bei Epic - innerhalb eines Cups, dafuer ohne Archivgrenze. */
  const [turniere, setTurniere] = useState<Array<{
    id: string; titel: string; fenster: Array<{
      eventId: string; windowId: string; region: string; name: string;
      ende: number;
    }>;
  }>>([]);
  const [epicFenster, setEpicFenster] = useState('');
  const [epicLaeuft, setEpicLaeuft] = useState(false);
  const [epicStand, setEpicStand] = useState('');
  const [epicTreffer, setEpicTreffer] = useState<Array<Record<string, unknown>>>([]);
  /** Einzelwerte dieses Spieltags aus dem Archiv, nach Konto-Id. */
  const [einzeln, setEinzeln] = useState<Record<string, Record<string, number>>>({});
  /**
   * Zu welchem Namen die angezeigte Konto-Id gehoert.
   *
   * Ohne diesen Abgleich blieb die Id des zuletzt gewaehlten Spielers unter
   * dem Feld stehen, waehrend darueber schon "kein Spieler dieses Namens"
   * stand - zwei Aussagen, die sich widersprachen.
   */
  const [gewaehlterName, setGewaehlterName] = useState('');
  const [statsLaedt, setStatsLaedt] = useState(false);
  const [statsFehler, setStatsFehler] = useState('');
  const [spieler, setSpieler] = useState<Record<string, number | string> | null>(null);
  const [verlauf, setVerlauf] = useState<VerlaufZeile[]>([]);
  const [cup, setCup] = useState('alle');

  // Passwort
  const [altesPw, setAltesPw] = useState('');
  const [neuesPw, setNeuesPw] = useState('');
  const [pwStand, setPwStand] = useState('');

  // Loeschen
  const [loeschEmail, setLoeschEmail] = useState('');
  const [loeschStand, setLoeschStand] = useState('');

  useEffect(() => {
    if (zugang.laedt) return;
    void Promise.resolve().then(async () => {
      try {
        const j = await (await fetch('/api/konto', { cache: 'no-store' })).json();
        if (!j?.angemeldet) {
          /*
           * Kein CompHub-Konto - aber vielleicht ein VIP-Schluessel. Dann
           * bleibt die Seite offen und arbeitet mit dem, was der VIP-Zugang
           * hergibt: einem Namen. Nur wer auf keinem der beiden Wege
           * hereingekommen ist, wird zur Anmeldung geschickt.
           */
          if (!zugang.vip) { router.replace('/anmelden'); return; }
          setKonto(null);
          setName(zugang.name);
          return;
        }
        setKonto(j.konto);
        setName(j.konto.name);
        setBild(j.konto.bild ?? null);
        setSocials(j.konto.socials ?? {});
        setEpicId(j.konto.epicId ?? '');
        setGesucht(j.konto.epicId ?? '');
        setMeinEpic(j.konto.epicId ?? '');
        setSpielerVerlauf(j.konto.spielerVerlauf ?? []);
        /*
         * Ins Feld gehoert der Spielername, nicht die Konto-Id.
         *
         * Vorher stand dort die rohe Id - zweiunddreissig Zeichen, die niemand
         * lesen, pruefen oder wiedererkennen kann. Die Id bleibt intern
         * massgeblich, sichtbar ist der Name.
         */
        const eigene = j.konto.epicId;
        if (eigene) {
          void fetch(`/api/spieler-namen?id=${encodeURIComponent(eigene)}`)
            .then((r) => r.json())
            .then((n) => {
              const wie = n?.haupt || (n?.namen ?? [])[0] || '';
              if (!wie) return;
              setSuchtext(wie); setGewaehlterName(wie);
            })
            .catch(() => {});
        }
      } catch { router.replace('/anmelden'); }
      finally { setLaedt(false); }
    });
  }, [router, zugang.laedt, zugang.vip, zugang.name]);

  /*
   * Die Cups, in denen sich suchen laesst. Alles, was ein Leaderboard hat -
   * dieselbe Auskunft wie auf der Turnierseite.
   */
  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        /*
         * Nur Vergangenes. Zu einem Cup, der erst noch laeuft, gibt es
         * schlicht kein Leaderboard - ihn zur Auswahl zu stellen hiesse,
         * eine Suche anzubieten, die nichts finden kann.
         */
        const j = await (await fetch('/api/cup-catalog?modus=vorbei')).json();
        const roh = (j?.gruppen ?? j?.cups ?? []) as Array<{
          id: string; titel: string;
          regionen: Record<string, Array<{
            eventId: string; windowId: string; name: string;
            status?: string; end?: number;
          }>>;
        }>;
        const liste = roh.map((g) => ({
          id: g.id,
          titel: g.titel,
          fenster: Object.entries(g.regionen ?? {}).flatMap(([region, fs]) =>
            (fs ?? [])
              // Zur Sicherheit noch einmal hier: was noch laeuft oder erst
              // kommt, fliegt raus, auch wenn die Auskunft es mitschickt.
              .filter((f) => f.status === 'vorbei'
                || (typeof f.end === 'number' && f.end < Date.now()))
              .map((f) => ({
                eventId: f.eventId, windowId: f.windowId, region, name: f.name,
                ende: f.end ?? 0,
              }))),
        })).filter((g) => g.fenster.length)
          // Das Neueste zuerst - danach sucht man am ehesten.
          .sort((a, b) => Math.max(...b.fenster.map((f) => f.ende))
            - Math.max(...a.fenster.map((f) => f.ende)));
        if (!weg) setTurniere(liste);
      } catch { /* ohne Liste bleibt nur das Archiv */ }
    })();
    return () => { weg = true; };
  }, []);

  /**
   * Den Namen im Leaderboard eines Cups suchen - bei Epic, nicht im Archiv.
   *
   * Epic verweigert den Direktabruf fremder Konten mit 403, deshalb wird
   * seitenweise gesucht. Bei grossen Cups dauert das ein paar Sekunden; das
   * steht auch so am Knopf.
   */
  /*
   * Einen Spieler waehlen - und ihn sich merken.
   *
   * Der Verlauf wandert sofort ans Konto, ohne Speichern-Knopf: wer einmal den
   * richtigen "shxrk" getroffen hat, soll ihn beim naechsten Mal anklicken
   * koennen, statt dieselbe mehrdeutige Suche noch einmal richtig zu treffen.
   */
  const waehleSpieler = useCallback((id: string, wie: string) => {
    setEpicId(id);
    setGesucht(id);
    setSuchtext(wie);
    setGewaehlterName(wie);
    setVorschlaege([]);
    setSpielerVerlauf((alt) => {
      const neu = [{ id, name: wie }, ...alt.filter((e) => e.id !== id)].slice(0, 8);
      void fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'aendern', spielerVerlauf: neu }),
      }).catch(() => {});
      return neu;
    });
  }, []);

  const epicSuchen = useCallback(async () => {
    const name = suchtext.trim();
    const fenster = turniere.flatMap((g) => g.fenster)
      .find((f) => f.windowId === epicFenster);
    if (!name || !fenster) return;

    setEpicLaeuft(true);
    setEpicStand('');
    setEpicTreffer([]);
    try {
      const r = await fetch('/api/cup-leaderboard'
        + `?event=${encodeURIComponent(fenster.eventId)}`
        + `&window=${encodeURIComponent(fenster.windowId)}`
        + `&q=${encodeURIComponent(name)}`);
      const j = await r.json();
      const treffer = Array.isArray(j?.entries) ? j.entries : [];
      setEpicTreffer(treffer);

      /*
       * Die Einzelwerte kommen aus dem Archiv, nicht von Epic. Es kennt
       * nicht jeden Spieltag - fehlt er, bleibt es bei den Teamwerten, und
       * das wird gesagt.
       */
      setEinzeln({});
      if (treffer.length) {
        try {
          const a = await (await fetch('/api/szene-stats'
            + `?event=${encodeURIComponent(fenster.windowId)}`)).json();
          const liste = Array.isArray(a?.spieler) ? a.spieler : [];
          const karte: Record<string, Record<string, number>> = {};
          for (const p of liste) if (p?.epicId) karte[p.epicId] = p;
          setEinzeln(karte);
        } catch { /* ohne Archiv bleibt es bei den Teamwerten */ }
      }
      if (!treffer.length) {
        /*
         * Der Unterschied, den der Nutzer ausdruecklich wollte: hat Epic den
         * ganzen Cup durchsucht und nichts gefunden, war der Spieler nicht
         * dabei. Blieb die Suche vorher stehen, ist das etwas anderes.
         */
        const alles = (j?.scannedPages ?? 0) >= (j?.totalPages ?? 0);
        setEpicStand(alles
          ? t('Dieser Spieler war in diesem Cup nicht dabei.')
          : t('Nicht gefunden — der Cup ist zu groß, um ihn ganz zu durchsuchen.'));
      }
    } catch {
      setEpicStand(t('Epic hat nicht geantwortet.'));
    } finally { setEpicLaeuft(false); }
  }, [suchtext, epicFenster, turniere, t]);

  /**
   * Die Werte zu einem Epic-Konto holen.
   *
   * Bewusst nicht an das hinterlegte Konto gebunden: der Nutzer wollte
   * ausdruecklich eine beliebige Id eingeben und deren Werte sehen koennen.
   * Was hinterlegt ist, ist nur die Vorbelegung.
   */
  const statsHolen = useCallback(async (id: string) => {
    const sauber = id.trim().toLowerCase();
    setStatsFehler('');
    if (!sauber) { setSpieler(null); setVerlauf([]); return; }
    if (!/^[0-9a-f]{32}$/.test(sauber)) {
      setStatsFehler(t('Bitte einen Spieler aus der Liste wählen.'));
      setSpieler(null); setVerlauf([]);
      return;
    }
    setStatsLaedt(true);
    try {
      const j = await (await fetch(`/api/szene-stats?spieler=${sauber}`)).json();
      if (!j?.spieler) {
        setStatsFehler(t('Zu diesem Konto liegt im Archiv nichts vor.'));
        setSpieler(null); setVerlauf([]);
        return;
      }
      setSpieler(j.spieler);
      setVerlauf(Array.isArray(j.verlauf) ? j.verlauf : []);
      setCup('alle');
    } catch {
      setStatsFehler(t('Die Werte ließen sich nicht laden.'));
    } finally { setStatsLaedt(false); }
  }, [t]);

  /**
   * Nach Namen suchen, waehrend getippt wird.
   *
   * Mit kurzer Verzoegerung: bei jedem Tastendruck zu fragen laedt acht
   * Abfragen fuer ein Wort. Ab zwei Zeichen, darunter passt ohnehin die
   * halbe Liste.
   */
  useEffect(() => {
    const q = suchtext.trim();
    let weg = false;
    /*
     * Nach der Auswahl steht der Name des Gewaehlten im Feld - und die Suche
     * lief sofort erneut, sodass die Liste ueber den gerade geladenen Werten
     * wieder aufklappte. Steht dort genau der gewaehlte Name, gibt es nichts
     * mehr zu suchen.
     */
    if (q && q === gewaehlterName) {
      const zu = setTimeout(() => { if (!weg) setVorschlaege([]); }, 0);
      return () => { weg = true; clearTimeout(zu); };
    }
    // Alles Setzen laeuft ueber die Uhr, auch das Leeren: sonst schriebe
    // der Effekt noch im selben Durchlauf Zustand und loeste eine zweite
    // Zeichnung aus.
    if (/^[0-9a-f]{32}$/i.test(q) || q.length < 2) {
      const sofort = setTimeout(() => { if (!weg) setVorschlaege([]); }, 0);
      return () => { weg = true; clearTimeout(sofort); };
    }
    const uhr = setTimeout(() => {
      if (!weg) setSuchtLaeuft(true);
      void (async () => {
        try {
          const r = await fetch(
            `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`);
          const j = await r.json();
          if (!weg) setVorschlaege(Array.isArray(j?.spieler) ? j.spieler : []);
        } catch { if (!weg) setVorschlaege([]); }
        finally { if (!weg) setSuchtLaeuft(false); }
      })();
    }, 300);
    return () => { weg = true; clearTimeout(uhr); };
  }, [suchtext, gewaehlterName]);

  useEffect(() => {
    // Einen Mikrotask spaeter: der Abruf setzt gleich zu Beginn Zustand,
    // und im selben Durchlauf ergaebe das eine ueberfluessige zweite
    // Zeichnung.
    if (!gesucht) return;
    void Promise.resolve().then(() => statsHolen(gesucht));
  }, [gesucht, statsHolen]);

  /** Die Cups, zu denen dieses Konto tatsaechlich Spieltage hat. */
  const cups = useMemo(() => {
    const gesehen = new Map<string, number>();
    for (const z of verlauf) {
      if (!z.event) continue;
      gesehen.set(z.event, (gesehen.get(z.event) ?? 0) + 1);
    }
    return [...gesehen.entries()]
      .map(([roh, anzahl]) => ({ roh, titel: turnierName(roh), anzahl }))
      .sort((a, b) => a.titel.localeCompare(b.titel));
  }, [verlauf]);

  /**
   * Was in den Kacheln steht.
   *
   * Bei "alle Cups" die fertigen Summen aus der Auskunft. Bei einem
   * einzelnen Cup wird ueber dessen Spieltage gerechnet - was die Auskunft
   * nicht als Summe liefert, bleibt leer statt geschaetzt.
   */
  const werte = useMemo(() => {
    if (cup === 'alle') return spieler;
    const zeilen = verlauf.filter((z) => z.event === cup);
    if (!zeilen.length) return null;
    const raus: Record<string, number> = { events: zeilen.length };
    for (const [kachel, feld] of Object.entries(AUS_VERLAUF)) {
      raus[kachel] = zeilen.reduce(
        (n, z) => n + (Number(z.werte?.[feld]) || 0), 0);
    }
    return raus;
  }, [cup, spieler, verlauf]);

  async function speichern() {
    setStand(t('speichert …'));
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'aendern', name, socials, bild }),
      });
      const j = await r.json();
      if (!r.ok) { setStand(j?.fehler ?? t('nicht gespeichert')); return; }
      setKonto(j.konto);
      setStand(t('gespeichert'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  /**
   * Ein Profilbild waehlen.
   *
   * Verkleinert wird hier im Browser auf 256 Pixel, quadratisch aus der
   * Mitte. Ohne das landete ein Handyfoto mit vier Megabyte in der
   * Kontodatei - und angezeigt wird es ohnehin als Kreis von 36 Pixeln.
   */
  function bildWaehlen(datei: File) {
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
        setBild(flaeche.toDataURL('image/webp', 0.85));
      };
      roh.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  }

  async function passwortSetzen() {
    setPwStand(t('speichert …'));
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'passwort', alt: altesPw, neu: neuesPw }),
      });
      const j = await r.json();
      if (!r.ok) { setPwStand(j?.fehler ?? t('nicht gespeichert')); return; }
      if (j.konto) setKonto(j.konto);
      setAltesPw(''); setNeuesPw('');
      setPwStand(t('Passwort geändert'));
      setTimeout(() => setPwStand(''), 3000);
    } catch (e) { setPwStand((e as Error).message); }
  }

  async function kontoLoeschen() {
    setLoeschStand(t('einen Moment …'));
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'loeschen', email: loeschEmail }),
      });
      const j = await r.json();
      if (!r.ok) { setLoeschStand(j?.fehler ?? t('nicht gelöscht')); return; }
      router.push('/');
      router.refresh();
    } catch (e) { setLoeschStand((e as Error).message); }
  }

  async function abmelden() {
    await fetch('/api/konto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ was: 'abmelden' }),
    });
    router.push('/');
    router.refresh();
  }

  if (laedt) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-20 text-center">
        <p className="text-xs text-slate-600"><T>Wird geladen …</T></p>
      </main>
    );
  }
  /*
   * Ohne Konto, aber mit VIP-Schluessel: die Seite laeuft weiter und
   * arbeitet mit einem Platzhalter. Gespeichert wird dabei nichts - dafuer
   * braeuchte es ein Konto -, aber die Werte und die Bereiche sind da.
   */
  const nurVip = !konto && zugang.vip;
  const daten: Konto = konto ?? {
    id: '', email: '', name: zugang.name, bestaetigt: true,
    dienste: [], epicId: null, hatPasswort: false,
    socials: {}, bild: null, angelegt: '',
  };
  if (!konto && !nurVip) return null;

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';
  const kasten = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';
  const ueberschrift = 'mb-1 text-xs font-semibold uppercase tracking-[0.16em] '
    + 'text-slate-500';

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">

        {/* ------------------------------------------------------- Kopf */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden
                          rounded-full border border-zinc-700 bg-slate-800
                          text-xl font-semibold uppercase text-slate-100">
            {bild
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={bild} alt="" className="h-full w-full object-cover" />
              : (daten.name || daten.email).trim().charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{daten.name}</h1>
            <p className="truncate text-xs text-slate-500">
              {daten.email}
              {!daten.bestaetigt && (
                <span className="ml-2 text-amber-500/80"><T>nicht bestätigt</T></span>
              )}
            </p>
          </div>
          <Link href="/" className="ml-auto text-xs text-slate-500 transition
                                    hover:text-sky-400">
            ← <T>zur Startseite</T>
          </Link>
        </div>

        {/*
          * Die Bereiche stehen links untereinander, nicht oben als Reiter.
          * Auf einem schmalen Fenster klappt die Spalte ueber den Inhalt -
          * dort waere eine feste Seitenspalte nur im Weg.
          */}
        <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
            {BEREICHE.map((b) => (
              <button key={b.wert} onClick={() => setBereich(b.wert)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-semibold
                            transition ${bereich === b.wert
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:bg-zinc-900 hover:text-slate-200'}`}>
                <T>{b.titel}</T>
              </button>
            ))}

            {/*
              * Admin Tools - nur fuer den, der eine Rolle hat.
              *
              * Vorher stand hier ein schmaler Verweis "Verwaltung →", und
              * zwar fuer jeden VIP. Wer Adminrechte bekam, sah davon nichts
              * Eigenes und fragte zu Recht, wo denn nun die Werkzeuge
              * seien. Jetzt ist es ein Bereich wie die anderen, abgesetzt,
              * und dahinter stehen die Werkzeuge mit ihrer Aufgabe.
              */}
            {(zugang.admin || zugang.manager) && (
              <button onClick={() => setBereich('werkzeuge')}
                className={`mt-2 rounded-lg px-3 py-2 text-left text-sm
                            font-semibold transition md:mt-4
                            ${bereich === 'werkzeuge'
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:bg-zinc-900 hover:text-slate-200'}`}>
                <T>Admin Tools</T>
              </button>
            )}
          </nav>

          <div>

        {/* ------------------------------------------------------ Stats */}
        {bereich === 'konto' && (
          <div className="space-y-6">
            {/* Zuerst das eigene Turnier: welcher Cup, welche Runde, welcher
                Tag, welche Region - und der Weg hindurch. Die Suche nach
                fremden Spielern steht bewusst darunter; wer seine eigenen
                Werte sehen will, soll niemanden eintippen muessen. */}
            {/*
              * Der Weg zum Kontaktformular.
              *
              * Steht bewusst oben und nicht am Seitenende: wer etwas melden
              * will, hat meist gerade einen Fehler vor sich und sucht nicht
              * lange. Ein eigener Menuepunkt in der Kopfleiste waere zu viel
              * - dort stehen die Inhalte, nicht das eigene Konto.
              */}
            <section className={kasten}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={`${ueberschrift} mb-1`}><T>Kontakt</T></h2>
                  <p className="text-xs leading-relaxed text-slate-500">
                    <T>Etwas geht nicht, fehlt oder ließe sich besser machen?
                    Schreib es dem Betreiber — mit Screenshot, wenn du magst.</T>
                  </p>
                </div>
                <Link href="/kontakt"
                  className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm
                             font-medium text-white transition hover:bg-sky-400">
                  <T>Schreiben</T>
                </Link>
              </div>
            </section>


          </div>
        )}

        {/* ------------------------------------------------------- Chat */}
        {bereich === 'chat' && (
          <div className="space-y-6">
            {/*
              * Das Chatsymbol am Rand an- und abschalten.
              *
              * Der Betreiber wollte es abstellen koennen: wer eine Karte baut
              * oder einen Stream nebenher hat, will nichts Schwebendes im
              * Bild. Das Gespraech bleibt davon unberuehrt - nur der Knopf
              * verschwindet, und hier kommt er zurueck.
              */}
            <section className={kasten}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={`${ueberschrift} mb-1`}><T>Nachrichten</T></h2>
                  <p className="text-xs leading-relaxed text-slate-500">
                    <T>Das Chatsymbol am linken Bildschirmrand. Ausgeblendet
                    bleiben deine Nachrichten erhalten — du siehst nur den Knopf
                    nicht mehr.</T>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link href="/nachrichten"
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium
                             text-white transition hover:bg-sky-400">
                  <T>Nachrichten öffnen</T>
                </Link>
                <button
                  type="button"
                  disabled={chatAmRand === null}
                  onClick={() => setzeChatHud(!chatAmRand)}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm
                              transition disabled:opacity-40 ${chatAmRand
                    ? 'border-sky-500 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                    : 'border-zinc-700 text-slate-300 hover:border-sky-500'}`}>
                  {chatAmRand === false
                    ? <T>Symbol einblenden</T>
                    : <T>Symbol ausblenden</T>}
                </button>
                </div>
              </div>
            </section>

            {/* Und die Gespraeche gleich hier, statt hinter einem weiteren
                Klick: der Reiter heisst Chat, also gehoert der Chat hinein. */}
            <ChatFenster alsSeite />
          </div>
        )}

        {/* ---------------------------------------------------- Socials */}
        {bereich === 'socials' && (
          <section className={kasten}>
            <h2 className={ueberschrift}><T>Meine Socials</T></h2>
            <p className="mb-4 text-[11px] text-slate-600">
              <T>Nur an deinem eigenen Konto — im Werkzeug selbst werden keine
              fremden Social-Konten ausgestellt.</T>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIALS.map((s) => (
                <label key={s.schluessel}>
                  <span className="mb-1 block text-[11px] text-slate-500">
                    {s.titel}
                  </span>
                  <input value={socials[s.schluessel] ?? ''}
                    onChange={(e) => setSocials((v) => ({
                      ...v, [s.schluessel]: e.target.value,
                    }))}
                    placeholder={`${s.vorsatz}${t('Name')}`}
                    className={feld} />
                </label>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------ Konto */}
        {bereich === 'konto' && (
          <div className="space-y-6">
            <section className={kasten}>
              <h2 className={ueberschrift}><T>Profilbild</T></h2>
              <p className="mb-4 text-[11px] text-slate-600">
                <T>Wird auf 256 Pixel verkleinert und quadratisch
                zugeschnitten.</T>
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center
                                overflow-hidden rounded-full border border-zinc-700
                                bg-slate-800 text-2xl font-semibold uppercase
                                text-slate-100">
                  {bild
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={bild} alt="" className="h-full w-full object-cover" />
                    : (name || daten.email).trim().charAt(0)}
                </div>
                <input ref={dateiFeld} type="file" accept="image/*" hidden
                  onChange={(e) => {
                    const d = e.target.files?.[0];
                    if (d) bildWaehlen(d);
                    e.target.value = '';
                  }} />
                <button onClick={() => dateiFeld.current?.click()}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm
                             text-slate-200 transition hover:border-sky-500
                             hover:text-sky-400">
                  <T>Bild wählen</T>
                </button>
                {bild && (
                  <button onClick={() => setBild(null)}
                    className="text-xs text-slate-500 transition hover:text-rose-400">
                    <T>entfernen</T>
                  </button>
                )}
              </div>
            </section>

            {daten.id && (
              <section className={kasten}>
                <h2 className={ueberschrift}><T>Meine Konto-Id</T></h2>
                <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-600">
                  <T>Die nennst du, wenn du VIP oder andere Rechte anfragst.
                  Sie verrät nichts über dich — sie benennt nur dein Konto.</T>
                </p>
                <code className="block select-all rounded-lg border border-zinc-800
                                 bg-zinc-950 px-3 py-2.5 font-mono text-xs
                                 text-slate-300">
                  {daten.id}
                </code>
              </section>
            )}

            <section className={kasten}>
              <h2 className={ueberschrift}><T>Anzeigename</T></h2>
              {nurVip ? (
                <>
                  <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-600">
                    <T>Dein Name kommt aus dem VIP-Zugang und wird dort
                    vergeben — hier lässt er sich nicht ändern. Das Profilbild
                    schon.</T>
                  </p>
                  <input value={name} disabled
                    className={`${feld} cursor-not-allowed opacity-50`} />
                </>
              ) : (
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className={`${feld} mt-3`} />
              )}
            </section>

            <section className={kasten}>
              <h2 className={ueberschrift}>
                {daten.hatPasswort ? <T>Passwort ändern</T> : <T>Passwort setzen</T>}
              </h2>
              <p className="mb-4 text-[11px] leading-relaxed text-slate-600">
                {daten.hatPasswort
                  ? <T>Zum Ändern muss das bisherige Passwort stimmen.</T>
                  : <T>Dieses Konto wurde über einen Anmeldedienst angelegt und
                      hat noch kein Passwort. Du bist über den Dienst
                      ausgewiesen, deshalb kannst du hier eines setzen — danach
                      geht beides.</T>}
              </p>
              <div className="space-y-3">
                {daten.hatPasswort && (
                  <input type="password" value={altesPw}
                    onChange={(e) => setAltesPw(e.target.value)}
                    placeholder={t('bisheriges Passwort')}
                    autoComplete="current-password" className={feld} />
                )}
                <input type="password" value={neuesPw}
                  onChange={(e) => setNeuesPw(e.target.value)}
                  placeholder={t('neues Passwort — mindestens acht Zeichen')}
                  autoComplete="new-password" className={feld} />
                <div className="flex items-center gap-3">
                  <button onClick={passwortSetzen} disabled={!neuesPw}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm
                               text-slate-200 transition hover:border-sky-500
                               hover:text-sky-400 disabled:opacity-40">
                    <T>Passwort speichern</T>
                  </button>
                  {pwStand && <span className="text-xs text-slate-500">{pwStand}</span>}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ---------------------------------------------------- Privat */}
        {bereich === 'privat' && (
          <div className="space-y-6">
            <section className={kasten}>
              <h2 className={ueberschrift}><T>Verknüpfte Dienste</T></h2>
              <p className="mt-3 text-xs text-slate-400">
                {daten.dienste.length
                  ? daten.dienste.join(', ')
                  : <T>keine — nur E-Mail und Passwort</T>}
              </p>
            </section>

            <section className="rounded-xl border border-rose-900/50
                                bg-rose-950/10 p-5">
              <h2 className="mb-1 text-xs font-semibold uppercase
                             tracking-[0.16em] text-rose-400">
                <T>Konto löschen</T>
              </h2>
              <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
                <T>Das ist endgültig — es gibt keinen Papierkorb. Tipp zur
                Bestätigung deine E-Mail-Adresse ab.</T>
              </p>
              <div className="flex flex-wrap gap-2">
                <input value={loeschEmail}
                  onChange={(e) => setLoeschEmail(e.target.value)}
                  placeholder={daten.email}
                  className={`${feld} flex-1`} />
                <button onClick={kontoLoeschen}
                  disabled={loeschEmail.trim().toLowerCase() !== daten.email}
                  className="rounded-lg border border-rose-800 px-4 py-2 text-sm
                             font-semibold text-rose-300 transition
                             hover:border-rose-500 hover:text-rose-200
                             disabled:cursor-not-allowed disabled:opacity-30">
                  <T>endgültig löschen</T>
                </button>
              </div>
              {loeschStand && (
                <p className="mt-3 text-xs text-rose-400">{loeschStand}</p>
              )}
            </section>
          </div>
        )}

        {/* ----------------------------------------------- Admin Tools */}
        {bereich === 'werkzeuge' && (
          <div className="space-y-6">
            <section className={kasten}>
              <h2 className={ueberschrift}><T>Deine Rolle</T></h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-md border border-sky-500/60
                                 bg-sky-500/10 px-3 py-1 text-xs font-bold
                                 uppercase tracking-wider text-sky-400">
                  {zugang.admin ? 'Admin' : 'Manager'}
                </span>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {zugang.admin
                    ? <T>Du darfst alles — jedes Werkzeug hier ist offen, und
                        du brauchst dafür keinen VIP-Schlüssel.</T>
                    : <T>Du darfst genau die Werkzeuge, die dir freigegeben
                        wurden. Die anderen stehen grau da, damit du siehst,
                        was es sonst noch gibt.</T>}
                </p>
              </div>
            </section>

            <section className={kasten}>
              <h2 className={ueberschrift}><T>Werkzeuge</T></h2>
              <ul className="mt-4 space-y-2">
                {WERKZEUGE.map((w) => {
                  const offen = w.nurAdmin
                    ? zugang.admin
                    : (w.recht ? zugang.darfBereich(w.recht) : zugang.admin);
                  if (!offen) {
                    return (
                      <li key={w.pfad}
                        className="flex flex-wrap items-center gap-3 rounded-lg
                                   border border-zinc-900 bg-zinc-950/30
                                   px-4 py-3 opacity-40">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold
                                           text-slate-400">
                            <T>{w.titel}</T>
                          </span>
                          <span className="block text-[11px] text-slate-600">
                            <T>{w.was}</T>
                          </span>
                        </span>
                        <span className="ml-auto text-[10px] uppercase
                                         tracking-wider text-slate-700">
                          <T>nicht freigegeben</T>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={w.pfad}>
                      <Link href={w.pfad} prefetch={false}
                        className="flex flex-wrap items-center gap-3 rounded-lg
                                   border border-zinc-800 bg-zinc-950/40 px-4
                                   py-3 transition hover:border-sky-500/60
                                   hover:bg-zinc-900">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold
                                           text-slate-100">
                            <T>{w.titel}</T>
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            <T>{w.was}</T>
                          </span>
                        </span>
                        <span className="ml-auto text-slate-600">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <Link href="/admin" prefetch={false}
              className="inline-block text-xs text-slate-500 transition
                         hover:text-sky-400">
              <T>zur Übersicht der Verwaltung</T> →
            </Link>
          </div>
        )}

        {/* ---------------------------------------------------- Sichern */}
        {bereich !== 'privat' && bereich !== 'werkzeuge' && nurVip && (
          <p className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40
                        px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            <T>Du bist über den VIP-Schlüssel angemeldet, hast aber kein
            CompHub-Konto. Werte ansehen geht, Speichern noch nicht — dafür
            legst du dir eines an, mit derselben Adresse.</T>
          </p>
        )}

        {bereich !== 'privat' && bereich !== 'werkzeuge' && !nurVip && (
          <div className="mt-6 flex items-center gap-3">
            <button onClick={speichern}
              className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold
                         text-white transition hover:bg-sky-400">
              <T>speichern</T>
            </button>
            {stand && <span className="text-xs text-slate-500">{stand}</span>}
          </div>
        )}

          </div>
        </div>

        {/* --------------------------------------------------- Abmelden */}
        <div className="mt-12 border-t border-zinc-900 pt-6">
          <button onClick={abmelden}
            className="text-xs text-slate-600 transition hover:text-rose-400">
            <T>abmelden</T>
          </button>
        </div>
      </div>
    </main>
  );
}
