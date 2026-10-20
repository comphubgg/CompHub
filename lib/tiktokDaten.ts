import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { GET as rosterAbruf } from '@/app/api/cup-roster/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { titelMit } from '@/lib/cupTitel';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { finale, fensterName, profilKarte, type KatalogCup, type KatalogFenster } from '@/lib/ergebnisPosts';

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
  rang: number;
  /** Anzeigename, grossgeschrieben (Namen stehen auf Karten immer in Grossbuchstaben). */
  namen: string[];
  /** Was die Stimme spricht: ohne Sonderzeichen, damit sie nichts Wirres vorliest. */
  gesprochen: string;
  punkte: number;
  laender: string[];
  fotos: Array<string | null>;
}

export interface TiktokDaten {
  keinCup?: boolean;
  grund?: string;
  eventId?: string;
  windowId?: string;
  titel?: string;
  region?: string;
  finale?: boolean;
  /** Englisches Datum, z. B. "20 Oct 2026". */
  datum?: string;
  seite?: string;
  zeilen?: TiktokZeile[];
}

const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fuer die Stimme: Akzente weg, nur Buchstaben und Ziffern - "hÿroxÿ" wird "hyroxy", ein Name nur aus Zeichen wird "a player". */
function sprechbar(n: string): string {
  const a = n.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return /[A-Za-z]{2}/.test(a) ? a : 'a player';
}

interface Eintrag { rank: number; points: number; players?: Array<{ id?: string; name: string }> }
interface Roster { teams?: Array<{ rank: number; points: number; spieler: Array<{ id: string; name: string; img: string | null }> }> }

export async function tiktokDaten(): Promise<TiktokDaten> {
  const jetzt = Date.now();
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { return { keinCup: true, grund: 'Katalog nicht erreichbar' }; }

  const kandidaten: Array<{ cup: KatalogCup; region: string; f: KatalogFenster; istFinale: boolean }> = [];
  for (const cup of katalog.cups ?? []) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      for (const f of fenster) {
        if (f.status !== 'vorbei' || !f.end || String(f.eventId).startsWith('manuell_')) continue;
        if (f.end > jetzt - 30 * 60_000 || f.end < jetzt - STUNDEN * 3_600_000) continue;
        kandidaten.push({ cup, region, f, istFinale: finale(cup, f, fenster) });
      }
    }
  }
  if (!kandidaten.length) return { keinCup: true, grund: `Kein Cup in den letzten ${STUNDEN} Stunden beendet` };

  // Finals zuerst, EU vor den anderen Regionen, dann die juengsten; die ersten fuenf Kandidaten werden auf Bilder geprueft.
  kandidaten.sort((a, b) => Number(b.istFinale) - Number(a.istFinale) || Number(b.region === 'EU') - Number(a.region === 'EU') || (b.f.end ?? 0) - (a.f.end ?? 0));

  const karte = await profilKarte();
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
        return { rang: e.rank || i + 1, namen, gesprochen: namen.map(sprechbar).join(' and '), punkte: e.points, laender, fotos };
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
  const d = new Date(k.f.end ?? jetzt);
  return {
    eventId: k.f.eventId, windowId: k.f.windowId, titel, region: k.region, finale: k.istFinale,
    datum: `${d.getUTCDate()} ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    seite: `${SEITE}/events/${encodeURIComponent(k.cup.id)}`,
    zeilen,
  };
}
