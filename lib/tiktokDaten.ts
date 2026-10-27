import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { GET as rosterAbruf } from '@/app/api/cup-roster/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { titelMit, groesseAus, istZeroBuild } from '@/lib/cupTitel';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { sprechbar, aussprachePaare, setzeAussprachen } from '@/lib/aussprache';
import { zahlWort } from '@/lib/tiktokAnfrage';
import { finale, fensterName, profilKarte, type KatalogCup, type KatalogFenster } from '@/lib/ergebnisPosts';
import { geldErzaehlen, type GeldErzaehlt } from '@/lib/tiktokGeld';

/*
 * Die Daten fuer das tägliche TikTok-Video (Betreiber, 20.10.2026: "das automatische TikTok generieren ... jeden Tag oder jeden zweiten").
 *
 * Der Ablauf "TikTok-Tagesvideo" (.github/workflows/tiktok-tag.yml) holt sich hier, WORUM es im Video geht: der Cup der letzten anderthalb Tage, der am meisten hergibt - ein
 * Finale vor einem Open, ein Cup mit Fotos der Besten vor einem ohne -, und dessen fuenf Erste mit Namen, Flagge, Foto und Punkten. Alles kommt aus denselben Quellen
 * wie die Ergebnis-Posts (Epics Bestenliste, gepflegte Profile); nichts wird erfunden. Gibt es nichts Brauchbares (kein beendeter Cup, weniger als fuenf Plaetze), steht
 * "keinCup" da, und der Ablauf macht an diesem Tag kein Video.
 */

const SEITE = 'https://www.thecomphub.com';
const STUNDEN = 36;

export interface TiktokZeile {
  /** Wo die Stimme einen Namen anders spricht, als er geschrieben wird: [gesprochen, Anzeige] - die Untertitel zeigen dann den Anzeigenamen (lib/aussprache). */
  aussprache?: Array<[string, string]>;
  rang: number;
  /** Anzeigename, grossgeschrieben (Namen stehen auf Karten immer in Grossbuchstaben). */
  namen: string[];
  /** Was die Stimme spricht: ohne Sonderzeichen, damit sie nichts Wirres vorliest. */
  gesprochen: string;
  punkte: number;
  laender: string[];
  fotos: Array<string | null>;
  /* Eigene Videos (lib/tiktokAnfrage): fester Text statt der Zahl ("#1"), ein Zeichen davor ("$"), die Bezeichnung darunter, eine Zeile "wieso" und der gesprochene Satz. */
  wertText?: string;
  praefix?: string;
  einheit?: string;
  beschreibung?: string;
  satz?: string;
  /** Die Punkte, wie Epic sie fuehrt (die Zahl rechts kann im Video ein Geldbetrag sein). */
  pkt?: number;
  /** In welchen Spielen das Team gewonnen hat (Nummer in der Reihenfolge des Spielendes), und seine Eliminierungen. */
  siegSpiele?: number[];
  elims?: number;
  /** Ein Satz mehr fuer die Stimme (Siege, Eliminierungen) - wird an den Satz der Zeile gehaengt. */
  zusatz?: string;
  /** Eine kleine Zeile unter der Zahl rechts im Bild ("100 PTS · WINS G2, G4 · 11 ELIMS"). */
  untertitel?: string;
}

export interface TiktokDaten {
  keinCup?: boolean;
  grund?: string;
  eventId?: string;
  windowId?: string;
  /** Die volle Zeile (Cup + Spieltag) - fuer den Text zum Kopieren. */
  titel?: string;
  /** Der Cup selbst, gross im Video ("Performance Evaluation Cup Trios"). */
  cupName?: string;
  /** Der Spieltag darunter ("Event 8", "Heat 3", "Last Chance Qualifier") - leer, wenn die Kennung keinen hergibt. */
  spieltag?: string;
  /** "Finals" oder "Open" (leer bei Heats und Qualifiern). */
  stufe?: string;
  /** Teamgroesse nach den echten Teams der Bestenliste: Solos, Duos, Trios, Squads. */
  modus?: string;
  /** Die Marken unter der Kopfzeile: Modus, Spieltag, Stufe. */
  marken?: string[];
  region?: string;
  finale?: boolean;
  /** Englisches Datum, z. B. "20 Oct 2026". */
  datum?: string;
  /** Welche Art Video: "letzter" (der letzte Cup, Standard), "top5" oder "spieler". */
  vorlage?: string;
  /** Eigene Videos: gesprochener Einstieg und Schluss, der fertige Text zum Kopieren und ein Name fuer die Datei. */
  introSatz?: string;
  outroSatz?: string;
  text?: string;
  dateiName?: string;
  seite?: string;
  zeilen?: TiktokZeile[];
}

const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fuer die Stimme: "a", "a and b", "a, b and c". */
function aufzaehlung(l: string[]): string {
  return l.length < 2 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

interface Eintrag { rank: number; points: number; players?: Array<{ id?: string; name: string }>; elims?: number; matches?: Array<{ placement?: number | null; elims?: number; endTime?: string }> }
interface Roster { teams?: Array<{ rank: number; points: number; spieler: Array<{ id: string; name: string; img: string | null }> }> }

/**
 * Der Cup fuer das Video. "ohne" nennt Fenster, zu denen es schon ein Video gibt (Betreiber, 26.10.2026: "du erstellst sie ein bisschen zu spaet") - so darf der Ablauf stuendlich
 * schauen, und jedes Finale bekommt sein Video kurz nach dem Ende, ohne dass derselbe Cup noch einmal drankommt.
 */
export async function tiktokDaten(opt: { ohne?: string[]; nur?: string } = {}): Promise<TiktokDaten> {
  const jetzt = Date.now();
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { throw new Error('Katalog nicht erreichbar'); }
  // Antwortet die Ablage nicht (zum Beispiel gedrosselt), kommt kein Katalog - das ist kein 'heute kein Cup', sondern ein Ausfall: der Aufrufer versucht es spaeter noch einmal.
  if (!Array.isArray(katalog.cups)) throw new Error('Katalog nicht erreichbar');

  const kandidaten: Array<{ cup: KatalogCup; region: string; f: KatalogFenster; istFinale: boolean }> = [];
  for (const cup of katalog.cups ?? []) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      for (const f of fenster) {
        if (f.status !== 'vorbei' || !f.end || String(f.eventId).startsWith('manuell_')) continue;
        // Mit "nur" (ein bestimmtes Fenster, etwa fuer ein nachgeholtes Video oder zum Ausprobieren) zaehlt die Frist von 36 Stunden nicht.
        if (opt.nur) { if (f.windowId !== opt.nur) continue; } else if (f.end > jetzt - 30 * 60_000 || f.end < jetzt - STUNDEN * 3_600_000) continue;
        if (opt.ohne?.includes(f.windowId)) continue;
        kandidaten.push({ cup, region, f, istFinale: finale(cup, f, fenster) });
      }
    }
  }
  if (!kandidaten.length) return { keinCup: true, grund: `Kein Cup in den letzten ${STUNDEN} Stunden beendet` };

  // Finals zuerst, EU vor den anderen Regionen, dann die juengsten; die ersten fuenf Kandidaten werden auf Bilder geprueft.
  kandidaten.sort((a, b) => Number(b.istFinale) - Number(a.istFinale) || Number(b.region === 'EU') - Number(a.region === 'EU') || (b.f.end ?? 0) - (a.f.end ?? 0));

  const karte = await profilKarte();
  // Vom Betreiber eingetragene Aussprachen (Feld "aussprache" im Spielerprofil) gelten fuer genau diesen Namen.
  setzeAussprachen([...karte.profile.values()].flatMap((p) => (p.aussprache ? [[ohneZierrat(kernname(p.anzeige || p.name || '')), p.aussprache] as [string, string]] : [])));
  let bester: { k: (typeof kandidaten)[number]; zeilen: TiktokZeile[]; mitFoto: number } | null = null;
  for (const k of kandidaten.slice(0, 5)) {
    try {
      const lb = await (await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(k.f.eventId)}&window=${encodeURIComponent(k.f.windowId)}`))).json() as { entries?: Eintrag[] };
      const eintraege = (lb.entries ?? []).slice(0, 5);
      if (eintraege.length < 5) continue;
      const ro = await (await rosterAbruf(new Request(`${SEITE}/api/cup-roster?event=${encodeURIComponent(k.f.eventId)}&window=${encodeURIComponent(k.f.windowId)}&limit=10`))).json() as Roster;
      const bild = new Map<string, string>();
      for (const t of ro.teams ?? []) for (const s of t.spieler) if (s.img) bild.set(s.id.toLowerCase(), s.img);

      const zeilen: TiktokZeile[] = eintraege.map((e, i) => {
        const spieler = e.players ?? [];
        const namen = spieler.map((p) => {
          const id = (p.id ?? '').toLowerCase();
          const pr = karte.profile.get(id); const sz = karte.szene.get(id);
          return (ohneZierrat(kernname(pr?.anzeige || pr?.name || sz?.name || p.name)).trim() || p.name).toUpperCase();
        });
        const laender = spieler.map((p) => {
          const id = (p.id ?? '').toLowerCase();
          return karte.profile.get(id)?.land || karte.szene.get(id)?.land || '';
        });
        const fotos = spieler.map((p) => {
          const img = bild.get((p.id ?? '').toLowerCase());
          if (!img) return null;
          const datei = decodeURIComponent(img.replace(/^\/spielerbilder\//, ''));
          return `${SEITE}${spielerbildKlein(datei)}`;
        });
        // In welchen Spielen gewonnen wurde: die Spiele nach Spielende geordnet, Platz 1 ist ein Sieg.
        const spiele = [...(e.matches ?? [])].sort((a, b) => (Date.parse(a.endTime ?? '') || 0) - (Date.parse(b.endTime ?? '') || 0));
        const siegSpiele = spiele.map((m, j) => (m.placement === 1 ? j + 1 : 0)).filter((n) => n > 0);
        const elims = typeof e.elims === 'number' ? e.elims : spiele.reduce((s, m) => s + (m.elims ?? 0), 0);
        const satzTeile: string[] = [];
        if (siegSpiele.length) satzTeile.push(`Wins in ${aufzaehlung(siegSpiele.map((n) => `game ${zahlWort(n)}`))}.`);
        if (elims > 0) satzTeile.push(`${zahlWort(elims)} elimination${elims === 1 ? '' : 's'} in total.`);
        return {
          rang: e.rank || i + 1, namen, gesprochen: aufzaehlung(namen.map(sprechbar)), aussprache: aussprachePaare(namen), punkte: e.points, laender, fotos,
          pkt: e.points, siegSpiele, elims, zusatz: satzTeile.join(' '),
        } as TiktokZeile;
      });
      const mitFoto = zeilen.reduce((n, z) => n + z.fotos.filter(Boolean).length, 0);
      if (!bester || (k.istFinale && !bester.k.istFinale) || (k.istFinale === bester.k.istFinale && mitFoto > bester.mitFoto + 1)) bester = { k, zeilen, mitFoto };
      if (k.istFinale && mitFoto >= 3) break;
    } catch { /* der naechste Kandidat */ }
  }
  if (!bester) return { keinCup: true, grund: 'Kein beendeter Cup mit mindestens fuenf Plaetzen' };

  const { k, zeilen } = bester;
  const basis = titelMit(k.cup.titel, k.f.windowId);
  const name = /heat \d|last chance/i.test(basis) ? '' : fensterName(k.f.windowId, k.istFinale);
  const titel = `${basis}${name && !basis.toLowerCase().includes(name.toLowerCase()) ? ` ${name}` : ''}`;

  // Kopfzeile des Videos (Betreiber, 20.10.2026): oben der Cup gross ("Performance Evaluation Cup Trios"), darunter der Spieltag ("Event 8"), darunter die Stufe ("Finals") und
  // dazu Marken fuer Modus und Spieltag. Die Teamgroesse kommt aus den echten Teams der Bestenliste - ein Trio-Cup zeigt Dreierteams, nie einen Einzelspieler dazwischen.
  const teamGroesse = Math.max(...zeilen.map((z) => z.namen.length));
  const aus = groesseAus(k.f.windowId, k.cup.titel);
  const modus = ({ 1: 'Solos', 2: 'Duos', 3: 'Trios', 4: 'Squads' } as Record<number, string>)[teamGroesse] ?? (aus === 'Solo' ? 'Solos' : aus ?? '');
  const voll = fensterName(k.f.windowId, k.istFinale);
  const teile = /^(.*?)\s*(Finals?|Open)$/i.exec(voll);
  let spieltag = (teile ? teile[1] : voll).trim();
  let stufe = teile ? (/^final/i.test(teile[2]) ? 'Finals' : 'Open') : '';
  let cupName = (k.cup.titel ?? '').replace(/\s+/g, ' ').trim();
  if (istZeroBuild(k.f.windowId) && !istZeroBuild(cupName)) cupName += ' Zero Build';
  // Steht der Spieltag oder die Stufe schon im Cup-Namen ("FNCS Solos Last Chance Qualifier", "FNCS Grand Finals"), kommt sie nicht noch einmal darunter.
  if (spieltag && cupName.toLowerCase().includes(spieltag.toLowerCase())) spieltag = '';
  if (stufe && new RegExp(stufe === 'Finals' ? 'final' : stufe, 'i').test(cupName)) stufe = '';
  const marken = [modus, spieltag, stufe].filter((m, i, a) => m && a.findIndex((x) => x.toLowerCase() === m.toLowerCase()) === i);
  const d = new Date(k.f.end ?? jetzt);
  // Mit Geld erzaehlt: was die Punkte bedeuten und was dabei herauskam (veraendert die Zeilen und liefert Einstieg und Text).
  const geld = await geldErzaehlen(k, zeilen, { cupName, spieltag, stufe }).catch((): GeldErzaehlt => ({}));
  // Die kleine Zeile unter der Zahl: im Geld-Video steht rechts der Betrag, dort kommen die Punkte hierher; sonst Siege und Eliminierungen.
  for (const z of zeilen) {
    const teile = [
      geld.introSatz && typeof z.pkt === 'number' ? `${z.pkt} PTS` : '',
      z.siegSpiele?.length ? `WINS ${z.siegSpiele.map((n) => `G${n}`).join(', ')}` : '',
      z.elims ? `${z.elims} ELIMS` : '',
    ].filter(Boolean);
    z.untertitel = teile.join(' · ');
  }
  return {
    ...geld,
    eventId: k.f.eventId, windowId: k.f.windowId, titel, cupName, spieltag, stufe, modus, marken, region: k.region, finale: k.istFinale,
    datum: `${d.getUTCDate()} ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    seite: `${SEITE}/events/${encodeURIComponent(k.cup.id)}`,
    zeilen,
  };
}
