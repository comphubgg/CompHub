import { NextResponse } from 'next/server';
import {
  gecacht, cupsGruppiert, holeTop, REGIONEN, STANDARD_ARTEN,
  type CupGruppe, type CupEintrag,
} from '@/lib/epicCups';

// Beitragsvorschlaege aus echten Turnierdaten.
//
// Statt eines Geruests mit Platzhaltern kommt hier ein fertiger Text: echter
// Cup, echte Startzeit, echte Namen, echte Punkte. Was sich nicht belegen
// laesst - Preisgelder etwa, die Epic nicht herausgibt - bleibt weg, statt
// erfunden zu werden.
//
// Damit nie zweimal derselbe Text erscheint, wird kombiniert: jeder Spieltag
// mal jede Satzvariante mal jeder Umfang. Aus einer Handvoll Turniere werden
// so hunderte verschiedene Beitraege.
//
//   ?art=ankuendigung | qualifiziert | rennen | highlight
//   &nr=7   -> die siebte Kombination

const TTL = 5 * 60_000;

function uhrzeit(ms: number) {
  return new Date(ms).toLocaleTimeString('de-DE',
    { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

function datum(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Aus "[EWC2026] AURA shxrk 7" wird "shxrk". */
function kurz(name: string) {
  const teile = name.trim().split(/\s+/)
    .filter((t) => !/^\[.*\]$/.test(t))
    .filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  return teile.length > 1 && /^[A-Z0-9]{2,6}$/.test(teile[0])
    ? teile.slice(1).join(' ') : teile.join(' ');
}

interface Fenster {
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  status: string;
  eventId: string; windowId: string; region: string; istFinale: boolean;
  /** Rundenzahl, sofern Epic sie zum Spieltag angibt. */
  matchCap?: number;
}

/** Eine Kennzahl fuer die Highlight-Beitraege. */
interface Kennzahl {
  symbol: string;
  titel: string;
  wert: (e: CupEintrag) => number;
}

const KENNZAHLEN: Kennzahl[] = [
  { symbol: '🎯', titel: 'Eliminations', wert: (e) => e.elims },
  { symbol: '📈', titel: 'Damage', wert: (e) => e.damage },
  { symbol: '💀', titel: 'Headshots', wert: (e) => e.headshots },
  { symbol: '🧱', titel: 'Mats farmed', wert: (e) => e.matsGefarmt },
  { symbol: '📦', titel: 'Chests opened', wert: (e) => e.kisten },
  { symbol: '⏱️', titel: 'Time alive', wert: (e) => e.timeAlive },
];

function fensterVon(c: CupGruppe): Fenster[] {
  return Object.entries(c.regionen).flatMap(([region, liste]) =>
    liste.map((f) => ({ ...f, region })));
}

function namenVon(e: CupEintrag | undefined) {
  return (e?.players ?? []).map((p) => kurz(p.name)).join(' + ');
}

/* --------------------------------------------------------- Satzvarianten */

/** Wie ein Turnier angekuendigt wird. */
const ANKUENDIGUNG = [
  (t: string, d: string) => `${t} starts on ${d}.`,
  (t: string, d: string) => `${t} — ${d}.`,
  (t: string, d: string) => `Next up: ${t} on ${d}.`,
  (t: string, d: string) => `${t} is set for ${d}.`,
  (t: string, d: string) => `Coming ${d}: ${t}.`,
];

/** Wie ein Sieg beschrieben wird. */
const SIEG = [
  (n: string, t: string) => `${n} finished first at ${t}.`,
  (n: string, t: string) => `${n} take the win at ${t}.`,
  (n: string, t: string) => `${t} — ${n} come out on top.`,
  (n: string, t: string) => `First place at ${t}: ${n}.`,
];

/** Wie ein knapper Abstand kommentiert wird. */
const ABSTAND = [
  (a: number, g: number) => `Only ${a} points between ${g} and ${g + 1}. 😅`,
  (a: number, g: number) => `${a} points decide the last qualifying spot.`,
  (a: number, g: number) => `Tight at the bottom — ${a} points from ${g} to ${g + 1}.`,
  (a: number, g: number) => `Everything to play for: ${a} points at the cut.`,
];

/**
 * Aus einer laufenden Nummer eine gestreute Auswahl machen. Wuerde jede
 * Dimension einfach durchgezaehlt, aendert sich bei vielen Spieltagen nur
 * der Spieltag und Formulierung wie Umfang blieben lange gleich. Die
 * ungeraden Schrittweiten sorgen dafuer, dass sich bei jedem Klick alles
 * bewegt und trotzdem jede Kombination genau einmal vorkommt.
 */
function streu(nr: number, laenge: number, schritt: number) {
  if (laenge <= 1) return 0;
  return (nr * schritt) % laenge;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const art = searchParams.get('art') ?? 'ankuendigung';
  const nr = Math.max(0, parseInt(searchParams.get('nr') ?? '0', 10) || 0);

  try {
    const alle = await gecacht('vorschlag|katalog', TTL, () => cupsGruppiert(REGIONEN));
    const cups = alle.filter((c) => STANDARD_ARTEN.includes(c.art));

    if (art === 'ankuendigung') {
      // Jeder kommende Spieltag einzeln, nicht nur der naechste je Turnier.
      const kommend = cups.flatMap((c) =>
        fensterVon(c).filter((f) => f.begin > Date.now()).map((f) => ({ c, f })))
        .sort((a, b) => a.f.begin - b.f.begin);
      if (!kommend.length) return leer('Kein Spieltag steht derzeit bevor.');

      // Spieltag und Satzvariante getrennt durchzaehlen - so kommt jede
      // Kombination einmal vor, bevor sich etwas wiederholt.
      const { c, f } = kommend[nr % kommend.length];
      const satz = ANKUENDIGUNG[Math.floor(nr / kommend.length) % ANKUENDIGUNG.length];

      const regionen = Object.keys(c.regionen).filter((r) => r !== 'GLOBAL');
      const zeilen = [
        satz(c.titel, datum(f.begin)),
        '',
        `🕒 ${uhrzeit(f.begin)} CEST`,
        regionen.length ? `🌍 ${regionen.join(', ')}` : '🌍 Global',
      ];
      if (f.istFinale) zeilen.push('🏁 Finals');
      if (f.matchCap) zeilen.push(`🎮 ${f.matchCap} games`);
      return NextResponse.json({
        text: zeilen.join('\n'),
        varianten: kommend.length * ANKUENDIGUNG.length,
      });
    }

    // Fuer die uebrigen Arten wird ein gelaufener Spieltag gebraucht -
    // jeder einzeln, damit auch aeltere Tage an die Reihe kommen.
    const gelaufen = cups.flatMap((c) =>
      fensterVon(c).filter((f) => f.status === 'vorbei').map((f) => ({ c, f })))
      .sort((a, b) => b.f.begin - a.f.begin);
    if (!gelaufen.length) return leer('Es liegt noch kein beendeter Spieltag vor.');

    const { c, f } = gelaufen[nr % gelaufen.length];
    const runde = Math.floor(nr / gelaufen.length);

    const daten = await gecacht(`vorschlag|${f.eventId}|${f.windowId}`, TTL,
      () => holeTop(f.eventId, f.windowId, 20));
    const oben = daten.entries;
    if (!oben.length) return leer('Zu diesem Spieltag liegen keine Ergebnisse vor.');

    const tag = f.istFinale ? `${c.titel} Finals` : c.titel;

    if (art === 'qualifiziert') {
      const satz = SIEG[streu(nr, SIEG.length, 3)];
      const zeilen = [satz(namenVon(oben[0]), tag), ''];
      zeilen.push(`📊 ${oben[0].points} points over ${oben[0].games} games`);
      zeilen.push(`🎯 ${oben[0].elims} eliminations`);
      if (oben[0].wins) zeilen.push(`👑 ${oben[0].wins} Victory Royales`);
      // Ab der zweiten Runde auch die Verfolger nennen.
      if (nr % 2 === 1 && oben[1]) {
        zeilen.push('', `2. ${namenVon(oben[1])} — ${oben[1].points} pts`);
        if (oben[2]) zeilen.push(`3. ${namenVon(oben[2])} — ${oben[2].points} pts`);
      }
      return NextResponse.json({
        text: zeilen.join('\n'),
        varianten: gelaufen.length * SIEG.length * 2,
      });
    }

    if (art === 'rennen') {
      // Wechselnder Umfang: mal Top 3, mal Top 6, mal Top 10.
      const umfaenge = [3, 6, 10].filter((n) => n < oben.length);
      if (!umfaenge.length) return leer('Zu wenige Teams für einen Vergleich.');
      const grenze = umfaenge[streu(nr, umfaenge.length, 2)];
      const abstand = oben[grenze - 1].points - oben[grenze].points;
      const satz = ABSTAND[streu(nr, ABSTAND.length, 3)];

      const zeilen = [
        `${tag} — Top ${grenze} after ${oben[0].games} games.`,
        '',
        ...oben.slice(0, grenze).map((e, i) => `${i + 1}. ${namenVon(e)} — ${e.points} pts`),
        '',
        satz(abstand, grenze),
      ];
      return NextResponse.json({
        text: zeilen.join('\n'),
        varianten: gelaufen.length * umfaenge.length * ABSTAND.length,
      });
    }

    if (art === 'highlight') {
      // Wechselnde Kennzahl, damit nicht immer dieselbe vorne steht -
      // und nur solche, die dieser Cup ueberhaupt liefert.
      const kennzahlen = KENNZAHLEN.filter(
        (k) => oben.some((e) => k.wert(e) > 0));
      if (!kennzahlen.length) return leer('Dieser Spieltag liefert keine Kennzahlen.');

      // Drei Kennzahlen je Beitrag, bei jeder Runde um eine weitergedreht.
      const start = streu(nr, kennzahlen.length, 1);
      const auswahl = [0, 1, 2].map((i) => kennzahlen[(start + i) % kennzahlen.length]);
      const zeilen = [`${tag} — stats leaders`, ''];
      for (const k of auswahl) {
        const beste = [...oben].sort((a: CupEintrag, b: CupEintrag) =>
          k.wert(b) - k.wert(a))[0];
        const wert = k.titel === 'Time alive'
          ? `${Math.round(k.wert(beste) / 60)} min`
          : k.wert(beste).toLocaleString('en-US');
        zeilen.push(`${k.symbol} ${k.titel}: ${namenVon(beste)} (${wert})`);
      }
      return NextResponse.json({
        text: zeilen.join('\n'),
        varianten: gelaufen.length * kennzahlen.length,
      });
    }

    return leer('Unbekannte Art.');
  } catch (e) {
    return NextResponse.json({ text: '', hinweis: (e as Error).message });
  }
}

function leer(hinweis: string) {
  return NextResponse.json({ text: '', hinweis });
}
