import { GET as szeneAbruf } from '@/app/api/szene-stats/route';
import { POST as bildAbruf } from '@/app/api/spielerbild/route';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import type { TiktokDaten, TiktokZeile } from '@/lib/tiktokDaten';
import { sprechbar, aussprachePaare } from '@/lib/aussprache';
import { liesGalerie } from '@/lib/galerie';

/*
 * Eigene TikTok-Videos (Betreiber, 20.10.2026): "ich will dieses Jahr die besten fuenf Spieler aus Statistics und eine Kurzbeschreibung, wieso sie die besten sind - oder die
 * EU-Stats statt Asien, oder: Shxrk 2026, wie ist er platziert, was sind seine besten Platzierungen - und das Video wird genau so erstellt, nicht irgendwas, das ein bisschen
 * damit zu tun hat."
 *
 * Statt eines Freitextes, den niemand verlaesslich versteht, bestellt der Betreiber ueber ein Formular (/admin/tiktok); die Abfrage geht an den Ablauf, der hier seine Daten holt:
 *
 *   vorlage=top5   &region=EU|NAC|NAW|BR|ASIA|ME|OCE (leer = alle)  &liste=verdienst|elims|damage|headshots|builds|hits|teamElims|quote  &jahr=2026
 *   vorlage=spieler&name=Shxrk                                       &jahr=2026
 *
 * Alle Zahlen kommen aus derselben Quelle wie die Statistik-Seite (/api/szene-stats): nichts wird erfunden oder geschaetzt. Fehlt etwas, kommt "kein Video" mit Begruendung.
 */

const SEITE = 'https://www.thecomphub.com';
const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const REGION_NAME: Record<string, string> = { EU: 'EU', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };
const REGION_GESPROCHEN: Record<string, string> = { EU: 'Europe', NAC: 'N A Central', NAW: 'N A West', BR: 'Brazil', ASIA: 'Asia', ME: 'the Middle East', OCE: 'Oceania' };

/** Was die Liste misst: Titel im Video, Bezeichnung unter der Zahl, wie sie gesprochen wird. */
const LISTEN: Record<string, { titel: string; kurz: string; einheit: string; praefix?: string; satz: (w: string, e: number) => string; beschr: (w: string, e: number) => string; ganz: boolean }> = {
  verdienst: { titel: 'Most prize money', kurz: 'prize money', einheit: 'PRIZE', praefix: '$', ganz: true,
    satz: (w, e) => `${w} dollars earned in ${zahlWort(e)} events`, beschr: (w, e) => `$${w} earned in ${e} events` },
  elims: { titel: 'Most eliminations', kurz: 'eliminations', einheit: 'ELIMS', ganz: true,
    satz: (w, e) => `${w} eliminations in ${zahlWort(e)} events`, beschr: (w, e) => `${w} eliminations in ${e} events` },
  teamElims: { titel: 'Most team eliminations', kurz: 'team eliminations', einheit: 'TEAM ELIMS', ganz: true,
    satz: (w, e) => `${w} team eliminations in ${zahlWort(e)} events`, beschr: (w, e) => `${w} team eliminations in ${e} events` },
  damage: { titel: 'Most damage dealt', kurz: 'damage', einheit: 'DAMAGE', ganz: true,
    satz: (w, e) => `${w} damage dealt in ${zahlWort(e)} events`, beschr: (w, e) => `${w} damage in ${e} events` },
  hits: { titel: 'Most hits', kurz: 'hits', einheit: 'HITS', ganz: true,
    satz: (w, e) => `${w} hits in ${zahlWort(e)} events`, beschr: (w, e) => `${w} hits in ${e} events` },
  headshots: { titel: 'Most headshots', kurz: 'headshots', einheit: 'HEADSHOTS', ganz: true,
    satz: (w, e) => `${w} headshots in ${zahlWort(e)} events`, beschr: (w, e) => `${w} headshots in ${e} events` },
  builds: { titel: 'Most builds', kurz: 'builds', einheit: 'BUILDS', ganz: true,
    satz: (w, e) => `${w} builds placed in ${zahlWort(e)} events`, beschr: (w, e) => `${w} builds in ${e} events` },
  quote: { titel: 'Best damage ratio', kurz: 'damage ratio', einheit: 'RATIO', ganz: false,
    satz: (w, e) => `a damage ratio of ${w} over ${zahlWort(e)} events`, beschr: (w, e) => `Damage ratio ${w} over ${e} events` },
};

const _EINER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const _ZEHNER = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Eine Zahl als englische Woerter - damit die Stimme "451875" nicht Ziffer fuer Ziffer liest. */
export function zahlWort(n: number): string {
  n = Math.round(n);
  if (n < 0) return `minus ${zahlWort(-n)}`;
  if (n < 20) return _EINER[n];
  if (n < 100) return _ZEHNER[Math.floor(n / 10)] + (n % 10 ? `-${_EINER[n % 10]}` : '');
  if (n < 1000) return `${_EINER[Math.floor(n / 100)]} hundred${n % 100 ? ` ${zahlWort(n % 100)}` : ''}`;
  if (n < 1_000_000) return `${zahlWort(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${zahlWort(n % 1000)}` : ''}`;
  if (n < 1_000_000_000) return `${zahlWort(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${zahlWort(n % 1_000_000)}` : ''}`;
  return String(n);
}

/** Ein Jahr, wie man es spricht: 2026 -> "twenty twenty-six". */
const jahrWort = (y: number) => `${zahlWort(Math.floor(y / 100))} ${y % 100 ? zahlWort(y % 100) : 'hundred'}`;

const ORDNUNG = ['zero', 'one', 'two', 'three', 'four', 'five'];
const tausend = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

async function szene(abfrage: string): Promise<Record<string, unknown>> {
  const r = await szeneAbruf(new Request(`${SEITE}/api/szene-stats?${abfrage}`));
  const j = await r.json() as Record<string, unknown>;
  if (!r.ok || j.success === false) throw new Error(`Statistik nicht erreichbar (${abfrage})`);
  return j;
}

/** Das Foto zu einem der Namen (kleine Fassung) - oder keins. */
async function fotoFuer(namen: string[]): Promise<string | null> {
  const liste = [...new Set(namen.map((n) => String(n ?? '').trim()).filter(Boolean))];
  if (!liste.length) return null;
  try {
    const r = await bildAbruf(new Request(`${SEITE}/api/spielerbild`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: liste }) }));
    const j = await r.json() as { bilder?: Record<string, string | null> };
    for (const n of liste) {
      const f = j.bilder?.[n];
      if (f) { let datei = f.replace(/^\/spielerbilder\//, ''); try { datei = decodeURIComponent(datei); } catch { /* bleibt */ } return `${SEITE}${spielerbildKlein(datei)}`; }
    }
  } catch { /* ohne Foto steht die Silhouette */ }
  return null;
}

const absolut = (b: unknown) => (typeof b === 'string' && b ? (b.startsWith('http') ? b : `${SEITE}${b}`) : null);

interface Platz { epicId: string; anzeige?: string; name?: string; land?: string; bild?: string; events?: number; matches?: number; [k: string]: unknown }
interface Liste { feld: string; titel: string; plaetze: Platz[] }

/* ----------------------------------------------------------------- Top 5 */

export async function topFuenf(o: { region: string; liste: string; jahr: number }): Promise<TiktokDaten> {
  const art = LISTEN[o.liste] ?? LISTEN.verdienst;
  const feld = LISTEN[o.liste] ? o.liste : 'verdienst';
  const j = await szene(`ansicht=jahr&jahr=${o.jahr}${o.region ? `&region=${encodeURIComponent(o.region)}` : ''}`);
  const listen = (j.listen ?? []) as Liste[];
  const diese = listen.find((l) => l.feld === feld);
  if (!diese || diese.plaetze.length < 5) return { keinCup: true, grund: `Zu wenig Spieler in der Liste "${feld}" (${o.region || 'alle Regionen'}, ${o.jahr})` };

  const regionText = o.region ? (REGION_NAME[o.region] ?? o.region) : 'World';
  const regionSpruch = o.region ? (REGION_GESPROCHEN[o.region] ?? o.region) : 'the world';
  // Wo sonst steht jemand weit oben? "Auch Platz 3 bei den Eliminierungen" - das ist die Kurzbeschreibung, wieso er dort steht.
  const sonst = (id: string): string => {
    const treffer = listen.filter((l) => l.feld !== feld && LISTEN[l.feld])
      .map((l) => ({ platz: l.plaetze.findIndex((p) => p.epicId === id) + 1, kurz: LISTEN[l.feld].kurz }))
      .filter((x) => x.platz > 0 && x.platz <= 10).sort((a, b) => a.platz - b.platz)[0];
    return treffer ? `also #${treffer.platz} in ${treffer.kurz}` : '';
  };

  const zeilen: TiktokZeile[] = diese.plaetze.slice(0, 5).map((p, i) => {
    const roh = Number(p[feld] ?? 0);
    const wert = art.ganz ? tausend(roh) : roh.toFixed(2);
    const events = Number(p.events ?? 0);
    const name = String(p.anzeige || p.name || '').toUpperCase();
    const mehr = sonst(p.epicId);
    const beschreibung = [art.beschr(wert, events), mehr].filter(Boolean).join(' · ');
    const gesprochen = sprechbar(String(p.anzeige || p.name || ''));
    const wertGesprochen = art.ganz ? art.satz(zahlWort(roh), events) : art.satz(wert.replace('.', ' point '), events);
    const rang = i + 1;
    return {
      rang, namen: [name], gesprochen, aussprache: aussprachePaare([String(p.anzeige || p.name || '')]), punkte: art.ganz ? roh : 0,
      ...(art.ganz ? {} : { wertText: wert }),
      ...(art.praefix ? { praefix: art.praefix } : {}),
      einheit: art.einheit, beschreibung,
      satz: rang === 1 ? `And number one. ${gesprochen}, with ${wertGesprochen}${mehr ? `, ${mehr.replace(/#(\d+)/, (_m, n) => `number ${zahlWort(Number(n))}`)}` : ''}.` : `Number ${ORDNUNG[rang]}. ${gesprochen}, with ${wertGesprochen}.`,
      laender: [String(p.land ?? '')], fotos: [absolut(p.bild)],
    } as TiktokZeile;
  });

  const titel = `Top 5 ${regionText} players ${o.jahr} - ${art.titel.toLowerCase()}`;
  const text = [`🏆 Top 5 ${regionText} players of ${o.jahr} - ${art.titel.toLowerCase()}`, '',
    ...zeilen.slice().sort((a, b) => a.rang - b.rang).map((z) => `${z.rang}. ${z.namen[0]} - ${z.beschreibung}`), '',
    'Full statistics for every region: thecomphub.com/statistics', '', `#fortnite #fortnitecompetitive #fncs #esports #comphub${o.region ? ` #${o.region.toLowerCase()}` : ''}`].join('\n');
  return {
    vorlage: 'top5', titel, cupName: `Top 5 ${regionText} Players`, spieltag: art.titel, stufe: '', modus: '', marken: [o.region || 'World', String(o.jahr), art.kurz.toUpperCase()],
    region: o.region || 'WORLD', datum: `Season ${o.jahr}`, seite: `${SEITE}/statistics`, zeilen,
    introSatz: `The top five players of ${regionSpruch} in ${jahrWort(o.jahr)}, ranked by ${art.kurz}. All numbers from the CompHub statistics.`,
    outroSatz: 'Every player, every region and every cup, on the comp hub dot com. Tell us who we should cover next.',
    text, dateiName: `top5-${(o.region || 'world').toLowerCase()}-${feld}-${o.jahr}`,
  } as TiktokDaten;
}

/* --------------------------------------------------------------- Spieler */

export async function spielerRueckblick(o: { name: string; jahr: number }): Promise<TiktokDaten> {
  const q = o.name.trim();
  if (!q) return { keinCup: true, grund: 'Kein Spielername angegeben' };
  const suche = await szene(`ansicht=suche&q=${encodeURIComponent(q)}`);
  const treffer = ((suche.spieler ?? []) as Array<Platz & { events?: number }>).slice().sort((a, b) => Number(b.events ?? 0) - Number(a.events ?? 0));
  const gleich = treffer.find((s) => [s.name, s.anzeige, ...((s.namen as string[] | undefined) ?? [])].some((n) => String(n ?? '').toLowerCase().includes(q.toLowerCase()))) ?? treffer[0];
  if (!gleich) return { keinCup: true, grund: `Kein Spieler "${q}" gefunden` };

  const p = await szene(`ansicht=profil&spieler=${gleich.epicId}&jahr=${o.jahr}`);
  const sp = (p.spieler ?? {}) as Platz & { namen?: string[]; regionen?: string[]; events?: number; matches?: number; anzeige?: string; land?: string };
  const jahrVon = (ms: unknown) => (typeof ms === 'number' ? new Date(ms).getUTCFullYear() : 0);
  type Mit = { epicId?: string; name?: string };
  type Ergebnis = { titel: string; platz: number; datum: number; lan: boolean; mit: string[] };
  const gesehen = new Set<string>();
  const alle: Ergebnis[] = [];
  const dazu = (titel: string, platz: number, datum: number, lan: boolean, mit: Mit[] = []) => {
    const k = `${titel}|${datum}`;
    if (!titel || !(platz > 0) || jahrVon(datum) !== o.jahr || gesehen.has(k)) return;
    gesehen.add(k);
    alle.push({ titel, platz, datum, lan, mit: mit.map((m) => String(m?.name ?? '').trim()).filter((n) => n && !/^[0-9a-f]{8,32}$/i.test(n)) });
  };
  for (const e of (p.erfolge ?? []) as Array<{ titel: string; platz: number; datum: number; typ?: string; mitspieler?: Mit[] }>) dazu(e.titel, e.platz, e.datum, e.typ === 'LAN', e.mitspieler);
  for (const e of (p.epicZeilen ?? []) as Array<{ titel?: string; platz?: number; datum?: number; windowId?: string; mitspieler?: Mit[] }>) dazu(String(e.titel || e.windowId || ''), Number(e.platz), Number(e.datum), false, e.mitspieler);
  // Die Bezeichnung "S39_SoloVictoryCup_..." ist kein Titel: nur lesbare Namen kommen ins Video.
  const lesbar = alle.filter((e) => !/^S\d+_/.test(e.titel));
  if (lesbar.length < 3) return { keinCup: true, grund: `Zu wenige Platzierungen von ${q} in ${o.jahr} (${lesbar.length})` };
  /*
   * Was in einem Jahresrueckblick zaehlt (Aufgabe 149, Betreiber 21.10.2026): "Globals, FNCS und LAN-Events, nicht Solo-VCC-Siege". Jedes Ergebnis bekommt ein Gewicht nach
   * der Art des Turniers, und das mal einem Faktor nach dem Platz (Sieg 1, Platz 2 die Haelfte, Platz 10 knapp ein Viertel) - ein zehnter Platz bei den Globals steht so vor
   * einem Sieg in einem Victory Cup. Victory Cups, Cash Cups und Ranked kommen nur ins Video, wenn sonst keine fuenf Ergebnisse da sind.
   */
  const gewicht = (e: Ergebnis) => {
    const t = e.titel.toLowerCase();
    if (e.lan || /global championship|globals|world cup|summit|elite series championship|ewc/.test(t)) return 100;
    if (/fncs/.test(t) && /grand final|major/.test(t)) return 80;
    if (/fncs/.test(t) && /solo/.test(t) && /final/.test(t)) return 70;
    if (/division 1|performance|reload elite|last chance/.test(t) && /final/.test(t)) return 50;
    if (/victory|cash cup|vcc|ranked|practice/.test(t)) return 10;
    return 30;
  };
  const wert = (e: Ergebnis) => gewicht(e) / (1 + Math.log2(e.platz));
  const wichtig = lesbar.filter((e) => gewicht(e) > 10);
  const auswahl = wichtig.length >= 5 ? wichtig : [...wichtig, ...lesbar.filter((e) => gewicht(e) <= 10).sort((a, b) => wert(b) - wert(a)).slice(0, 5 - wichtig.length)];
  const beste = auswahl.slice().sort((a, b) => wert(b) - wert(a) || b.datum - a.datum).slice(0, 5);
  const neueste = lesbar.slice().sort((a, b) => b.datum - a.datum)[0];
  const tag = (ms: number) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONATE[d.getUTCMonth()]}`; };

  const anzeige = String(sp.anzeige || gleich.anzeige || gleich.name || q);
  const NAME = anzeige.toUpperCase();
  const gespr = sprechbar(anzeige);
  const foto = absolut((gleich as { bild?: string }).bild) ?? absolut((sp as { bild?: string }).bild)
    ?? await fotoFuer([anzeige, String(gleich.name ?? ''), ...(((sp as { namen?: string[] }).namen ?? []).slice(0, 4))]);
  const land = String(sp.land ?? gleich.land ?? '');
  // Bilder aus dem Spielerarchiv (Aufgabe 149: "Profilbilder und Bilder aus dem Spielerarchiv zeigen"): je Zeile ein anderes, wo es welche gibt - sonst das Profilfoto.
  const archiv: string[] = [];
  try {
    const g = await liesGalerie();
    for (const b of (g.eintraege ?? []) as Array<{ art?: string; datei?: string; spieler?: string[]; erstellt?: number }>) {
      if (b.art === 'bild' && b.datei && (b.spieler ?? []).includes(String(gleich.epicId))) archiv.push(`${SEITE}/api/galerie?bild=${encodeURIComponent(b.datei)}`);
    }
  } catch { /* ohne Archiv das Profilfoto */ }
  const zeilen: TiktokZeile[] = beste.map((e, i) => {
    const rang = i + 1;
    const mit = e.mit.length ? ` with ${e.mit.map((n) => sprechbar(n)).join(' and ')}` : '';
    return {
      rang, namen: [NAME], gesprochen: gespr, aussprache: aussprachePaare([anzeige, ...e.mit]), punkte: 0, wertText: e.platz === 1 ? 'WIN' : `#${e.platz}`, einheit: e.lan ? 'LAN' : 'ONLINE',
      beschreibung: `${e.titel}${e.mit.length ? ` · w/ ${e.mit.join(' & ')}` : ''} · ${tag(e.datum)}`,
      satz: `${rang === 1 ? 'Biggest result: ' : ''}${e.platz === 1 ? (rang === 1 ? 'a win' : 'A win') : `${rang === 1 ? 'place' : 'Place'} ${zahlWort(e.platz)}`} at ${e.titel.replace(/[^A-Za-z0-9 .,&-]/g, ' ')}${mit}.`,
      laender: [land], fotos: [archiv.length ? archiv[i % archiv.length] : foto],
    } as TiktokZeile;
  });
  const rang = (p.rang ?? {}) as { regional?: number; regionalVon?: number; region?: string };
  const text = [`🏆 ${NAME} in ${o.jahr} - biggest results`, '',
    ...zeilen.map((z) => `${z.rang}. ${z.wertText} - ${z.beschreibung}`), '',
    `${sp.events ?? '?'} events, ${sp.matches ?? '?'} matches in ${o.jahr}.`, `Full profile: thecomphub.com/statistics?spieler=${encodeURIComponent(anzeige)}`, '',
    '#fortnite #fortnitecompetitive #fncs #esports #comphub'].join('\n');
  return {
    vorlage: 'spieler', titel: `${NAME} ${o.jahr}`, cupName: `${NAME} · ${o.jahr}`, spieltag: 'Best placements', stufe: '', modus: '',
    marken: [String(o.jahr), ...((sp.regionen as string[] | undefined) ?? []).slice(0, 2)], region: (sp.regionen as string[] | undefined)?.[0] ?? 'EU', datum: `Season ${o.jahr}`,
    seite: `${SEITE}/statistics?spieler=${encodeURIComponent(anzeige)}`, zeilen,
    introSatz: `${gespr} in ${jahrWort(o.jahr)}. ${zahlWort(Number(sp.events ?? 0)).replace(/^./, (c) => c.toUpperCase())} events, ${zahlWort(Number(sp.matches ?? 0))} matches${rang.regional ? `, ranked number ${zahlWort(rang.regional)} in ${REGION_GESPROCHEN[rang.region ?? 'EU'] ?? 'the region'}` : ''}. Here are the biggest results of the year.`,
    outroSatz: `Latest result: place ${zahlWort(neueste.platz)} at ${neueste.titel.replace(/[^A-Za-z0-9 .,&-]/g, ' ')}. More stats on the comp hub dot com.`,
    text, dateiName: `spieler-${gespr.toLowerCase().replace(/\s+/g, '-')}-${o.jahr}`,
  } as TiktokDaten;
}
