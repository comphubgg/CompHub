import { verdienst, tabelleFuer } from '@/lib/preisgeld';
import { zahlWort } from '@/lib/tiktokAnfrage';
import type { TiktokZeile } from '@/lib/tiktokDaten';
import type { KatalogCup, KatalogFenster } from '@/lib/ergebnisPosts';

/**
 * Was die Punkte und Plaetze in Geld bedeuten - und wie das Video es erzaehlt (Betreiber, 26.10.2026: "nicht einfach 100 Points sagen. 100 Points heisst ein Win in den vier
 * Runden und bringt 800 Dollar je Spieler - they made earnings. Und 0 Points heisst: nicht gereicht fuer den Win, aber unter den Besten in der Consistency").
 *
 * Das Geld kommt aus denselben Tabellen wie die Preisgeld-Spalte der Cup-Seite (lib/preisgeld: Epics Auszahlungstabellen, bei Performance und Victory Cups je hundert Punkte).
 * Wo keine Tabelle steht, bleibt das Video, wie es war - es wird kein Betrag geraten.
 */

const REGION_GESPROCHEN: Record<string, string> = { EU: 'Europe', NAC: 'N A Central', NAW: 'N A West', BR: 'Brazil', ASIA: 'Asia', ME: 'the Middle East', OCE: 'Oceania' };
const PLATZWORT = ['', 'one', 'two', 'three', 'four', 'five'];
const dollar = (n: number) => `$${n.toLocaleString('en-US')}`;

export interface GeldErzaehlt { introSatz?: string; text?: string }

export async function geldErzaehlen(
  k: { cup: KatalogCup; region: string; f: KatalogFenster; istFinale: boolean },
  zeilen: TiktokZeile[],
  kopf: { cupName: string; spieltag: string; stufe: string },
): Promise<GeldErzaehlt> {
  const werte = await Promise.all(zeilen.map(async (z) => {
    try {
      const v = await verdienst({ windowId: k.f.windowId, eventId: k.f.eventId, region: k.region, platz: z.rang, punkte: z.punkte, istFinale: k.istFinale });
      return v && v.waehrung === 'USD' ? v.betrag : null;
    } catch { return null; }
  }));
  // Nur erzaehlen, wenn fuer mindestens einen der ersten fuenf wirklich Geld herauskommt.
  if (!werte.some((w) => w !== null && w > 0)) return {};
  let tab: Awaited<ReturnType<typeof tabelleFuer>> = null;
  try { tab = await tabelleFuer(k.f.windowId, k.region); } catch { /* ohne Tabelle erzaehlt das Video nur die Betraege */ }
  const nachPunkten = tab?.art === 'punkte';
  // Die Punkte, wie sie gespielt wurden - die Zeile zeigt danach den Betrag (die Zahl rechts zaehlt hoch, mit "$" davor).
  const pkt = zeilen.map((z) => z.punkte);

  zeilen.forEach((z, i) => {
    const je = werte[i];
    if (je === null) return;
    const anzahl = Math.max(1, z.namen.length);
    const team = je * anzahl;
    const mehrere = anzahl > 1;
    z.praefix = '$';
    z.einheit = mehrere ? 'TEAM EARNINGS' : 'EARNINGS';
    const kopfSatz = z.rang === 1 ? 'And the winner.' : `Number ${PLATZWORT[z.rang] ?? z.rang}.`;
    const geld = mehrere ? `each, ${dollar(team)} for the team` : 'in prize money';
    if (nachPunkten) {
      // 100 Punkte sind ein Sieg (Performance und Victory Cups) - der Betrag haengt an den Punkten.
      const siege = pkt[i] >= 100 ? Math.floor(pkt[i] / 100) : 0;
      const sieg = siege === 0 ? '' : siege === 1 ? ': a win' : `: ${zahlWort(siege)} wins`;
      if (je > 0) z.satz = `${kopfSatz} ${z.gesprochen}, with ${pkt[i]} points${sieg}. That is ${dollar(je)} ${geld}.`;
      else z.satz = `${kopfSatz} ${z.gesprochen}. No win this time, but one of the most consistent ${mehrere ? 'teams' : 'players'} of the day.`;
    } else if (je > 0) {
      z.satz = `${kopfSatz} ${z.gesprochen}, with ${pkt[i]} points, and ${dollar(je)} ${geld}.`;
    }
  });

  const spiel = [kopf.cupName, kopf.spieltag, kopf.stufe, REGION_GESPROCHEN[k.region] ?? k.region]
    .filter(Boolean).join(', ').replace(/[^A-Za-z0-9 .,&-]/g, ' ').replace(/\s+/g, ' ');
  const proSieg = tab?.stufen.find((x) => x.abPunkte === 100)?.betrag;
  const intro = nachPunkten && proSieg
    ? `${spiel}. In this cup every win is worth one hundred points, and one hundred points pays ${dollar(proSieg)} per player. So here the points are the prize money. These are the top five.`
    : `${spiel}. Prize money was on the line - here is who took it home. These are the top five.`;

  const nachRang = zeilen.map((z, i) => ({ z, je: werte[i], p: pkt[i] })).sort((a, b) => a.z.rang - b.z.rang);
  // Jetzt erst zeigt die Zeile den Betrag: die Zahl rechts ist das Geld des Teams.
  zeilen.forEach((z, i) => { const je = werte[i]; if (je !== null) z.punkte = je * Math.max(1, z.namen.length); });
  const text = [
    `🏆 ${[kopf.cupName, [kopf.spieltag, kopf.stufe].filter(Boolean).join(' ')].filter(Boolean).join(' · ')} (${k.region}) - top 5 and what they earned`, '',
    ...nachRang.map(({ z, je, p }) => {
      const team = je === null ? null : je * Math.max(1, z.namen.length);
      const geld = team === null ? `${p} pts` : `${dollar(team)}${z.namen.length > 1 && je ? ` (${dollar(je)} each)` : ''} · ${p} pts`;
      return `${z.rang}. ${z.namen.join(' & ')} - ${geld}`;
    }),
    '', 'Full results, maps and prize money: thecomphub.com', '',
    '#fortnite #fortnitecompetitive #fncs #esports #comphub',
  ].join('\n');
  return { introSatz: intro, text };
}
