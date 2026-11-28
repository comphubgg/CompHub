import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * Original-Symbole (Betreiber 27.11.2026: die eigenen wirken "KI-generiert" - er will die Original-Kartensymbole aus dem Spiel, wie fortnite.gg).
 * Die kommen aus seinem lokalen Export der Spieldateien (tools/export-auftrag.md, Schritt "Karten-Symbole") nach
 * public/hub-daten/icons/karte/<typ>.png - nur lokal, nie im Repo (.gitignore: public/hub-daten). Liegt eine Datei da, nimmt die Karte sie;
 * sonst bleibt das eigene Abzeichen darunter als Ersatz. Vite liefert fuer fehlende Dateien index.html - daher der Blick auf den Content-Type.
 */
export const ORIGINAL_PFAD = (typ: string) => `/hub-daten/icons/karte/${typ}.png`;
let originalSuche: Promise<Set<string>> | null = null;
function originaleSuchen() {
  originalSuche ??= Promise.all(EBENEN.map((e) => fetch(ORIGINAL_PFAD(e.typ), { method: 'HEAD', cache: 'no-store' })
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/') ? e.typ : null)).catch(() => null)))
    .then((l) => new Set(l.filter((x): x is string => !!x)));
  return originalSuche;
}
/** Welche Objektarten haben ein Original-Symbol aus dem lokalen Export? (einmal je Sitzung geprueft) */
export function useOriginalSymbole() {
  const [da, setDa] = useState<Set<string>>(new Set());
  useEffect(() => { let weg = false; originaleSuchen().then((s) => { if (!weg) setDa(s); }); return () => { weg = true; }; }, []);
  return da;
}

/*
 * Eigene Karten-Symbole (Ersatz, wenn kein Original da ist). Betreiber 28.11.2026: so nah wie moeglich am Spiel - flach, einfach, wie die
 * Minimap-Symbole (Truhe gold, Munitionskiste gruen, Slurp-Fass blau ...). Jedes Symbol ist die flache Silhouette in der Farbe der Ebene mit
 * dunklem Umriss und leichtem Schatten ("Aufkleber"-Stil des Spiels), keine Scheibe, kein Ring. Gezeichnet im 24er-Raster (Zeichen), einmal je
 * Art zu einem SVG-Bild (data:-Adresse) gerendert - die Karte setzt es per <image> ein, so kostet der Umriss-Filter nichts, egal wie viele
 * Marker zu sehen sind. Die Seitenleiste zeigt dasselbe Bild.
 */

export interface Ebene { typ: string; titel: string; einzeln: string; farbe: string; namen: string[]; gruppe: string; zeichen?: string }

/** Ebenen nach der Spezifikation (Loot, Sprites, Movement, Vehicles, Healing, Fishing, NPCs, Other). zeichen = anderes Zeichen wiederverwenden. */
export const EBENEN: Ebene[] = [
  { gruppe: 'Loot', typ: 'vault', titel: 'Vaults', einzeln: 'Vault', farbe: '#e2e8f0', namen: ['vault', 'tresor'] },
  { gruppe: 'Loot', typ: 'chest', titel: 'Chests', einzeln: 'Chest', farbe: '#fbc531', namen: ['chest', 'chests', 'truhe', 'tiered_chest', 'tieredchest'] },
  { gruppe: 'Loot', typ: 'buried', titel: 'Buried chests', einzeln: 'Buried chest', farbe: '#d97706', namen: ['buried', 'buriedchest', 'buried_chest'] },
  { gruppe: 'Loot', typ: 'rarechest', titel: 'Rare chests', einzeln: 'Rare chest', farbe: '#a78bfa', namen: ['rarechest', 'rare_chest'], zeichen: 'chest' },
  { gruppe: 'Loot', typ: 'lootcannon', titel: 'Loot cannons', einzeln: 'Loot cannon', farbe: '#f87171', namen: ['lootcannon', 'loot_cannon'], zeichen: 'cannon' },
  { gruppe: 'Loot', typ: 'ammo', titel: 'Ammo boxes', einzeln: 'Ammo box', farbe: '#9bd84a', namen: ['ammo', 'ammobox', 'ammo_box', 'munition', 'munitionskiste'] },
  { gruppe: 'Sprites', typ: 'spritechest', titel: 'Sprite chests', einzeln: 'Sprite chest', farbe: '#e879f9', namen: ['spritechest', 'sprite_chest'], zeichen: 'chest' },
  { gruppe: 'Sprites', typ: 'wanted', titel: 'Wanted posters', einzeln: 'Wanted poster', farbe: '#fcd34d', namen: ['wanted', 'wantedposter', 'wanted_poster'] },
  { gruppe: 'Sprites', typ: 'extraction', titel: 'Extraction sites', einzeln: 'Extraction site', farbe: '#34d399', namen: ['extraction', 'extractionsite', 'extraction_site'] },
  { gruppe: 'Movement', typ: 'launchpad', titel: 'Launch pads', einzeln: 'Launch pad', farbe: '#fb923c', namen: ['launchpad', 'launch_pad', 'sprungpad'] },
  { gruppe: 'Movement', typ: 'cannon', titel: 'Cannons', einzeln: 'Cannon', farbe: '#fdba74', namen: ['cannon', 'pirate_cannon', 'piratecannon'] },
  { gruppe: 'Movement', typ: 'zipline', titel: 'Ziplines', einzeln: 'Zipline', farbe: '#e2e8f0', namen: ['zipline', 'ziplines', 'seilrutsche'] },
  { gruppe: 'Movement', typ: 'portapotty', titel: 'Port-a-Potty', einzeln: 'Port-a-Potty', farbe: '#60a5fa', namen: ['portapotty', 'port_a_potty', 'portaloo'] },
  { gruppe: 'Movement', typ: 'whirlpool', titel: 'Whirlpools', einzeln: 'Whirlpool', farbe: '#7dd3fc', namen: ['whirlpool'] },
  { gruppe: 'Vehicles', typ: 'sportscar', titel: 'Sports cars', einzeln: 'Sports car', farbe: '#f472b6', namen: ['sportscar', 'sports_car', 'car'] },
  { gruppe: 'Vehicles', typ: 'suv', titel: 'SUVs', einzeln: 'SUV', farbe: '#c084fc', namen: ['suv', 'truck'] },
  { gruppe: 'Vehicles', typ: 'boat', titel: 'Motorboats', einzeln: 'Motorboat', farbe: '#38bdf8', namen: ['boat', 'motorboat'] },
  { gruppe: 'Vehicles', typ: 'tires', titel: 'Off-road tires', einzeln: 'Off-road tires', farbe: '#a8a29e', namen: ['tires', 'offroadtires', 'off_road_tires'] },
  { gruppe: 'Vehicles', typ: 'service', titel: 'Service stations', einzeln: 'Service station', farbe: '#fca5a5', namen: ['service', 'servicestation', 'gas', 'gasstation'] },
  { gruppe: 'Healing', typ: 'campfire', titel: 'Campfires', einzeln: 'Campfire', farbe: '#fb7185', namen: ['campfire'] },
  { gruppe: 'Healing', typ: 'produce', titel: 'Produce boxes', einzeln: 'Produce box', farbe: '#86efac', namen: ['produce', 'producebox', 'produce_box'] },
  { gruppe: 'Healing', typ: 'slurp', titel: 'Slurp barrels', einzeln: 'Slurp barrel', farbe: '#3fb5ff', namen: ['slurp', 'slurpbarrel', 'slurp_barrel', 'slurpfass'] },
  { gruppe: 'Healing', typ: 'slurptruck', titel: 'Slurp trucks', einzeln: 'Slurp truck', farbe: '#22d3ee', namen: ['slurptruck', 'slurp_truck'] },
  { gruppe: 'Fishing', typ: 'fishingrod', titel: 'Fishing rods', einzeln: 'Fishing rod', farbe: '#5eead4', namen: ['fishingrod', 'fishing_rod', 'rodbarrel'] },
  { gruppe: 'Fishing', typ: 'fishing', titel: 'Fishing spots', einzeln: 'Fishing spot', farbe: '#22d3ee', namen: ['fishing', 'fishingspot', 'fishing_spot', 'fishinghole', 'angelstelle'] },
  { gruppe: 'NPCs', typ: 'npc', titel: 'Characters', einzeln: 'Character', farbe: '#fde68a', namen: ['npc', 'character', 'figur'] },
  { gruppe: 'Other', typ: 'reboot', titel: 'Reboot vans', einzeln: 'Reboot van', farbe: '#f472b6', namen: ['reboot', 'rebootvan', 'reboot_van'] },
  { gruppe: 'Other', typ: 'vending', titel: 'Vending machines', einzeln: 'Vending machine', farbe: '#c084fc', namen: ['vending', 'vendingmachine', 'vending_machine', 'automat'] },
  { gruppe: 'Other', typ: 'bush', titel: 'Bushes', einzeln: 'Bush', farbe: '#4ade80', namen: ['bush', 'busch'] },
  { gruppe: 'Other', typ: 'other', titel: 'Other objects', einzeln: 'Object', farbe: '#94a3b8', namen: [] },
];
export const GRUPPEN_KARTE = [...new Set(EBENEN.map((e) => e.gruppe))];
export const ebeneVon = (typ: string) => EBENEN.find((e) => e.typ === typ) ?? EBENEN[EBENEN.length - 1];
export const typVon = (roh: string) => {
  const n = roh.toLowerCase().replace(/[\s-]/g, '');
  return EBENEN.find((e) => e.typ === n || e.namen.includes(n))?.typ ?? 'other';
};

const DUNKEL = '#0b1220';
/** Umriss und Aussparungen der Ersatz-Symbole (fast schwarz, wie die Raender der Spielsymbole) */
const UMRISS = '#0a0d14';

/** Das Zeichen im Abzeichen (24er-Raster, Mitte 12/12). `tinte` = Farbe des Zeichens; Aussparungen nehmen currentColor (= Grund des Abzeichens). */
export function Zeichen({ typ: roh, tinte = DUNKEL }: { typ: string; tinte?: string }) {
  const typ = ebeneVon(roh).zeichen ?? roh;
  const linie = { fill: 'none', stroke: tinte, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (typ) {
    case 'chest': // Truhe wie im Spiel: gewoelbter Deckel, Kasten, dunkle Fuge, Schloss
      return (
        <g>
          <path d="M3.6 10.6V9.2A4.2 4.2 0 0 1 7.8 5h8.4a4.2 4.2 0 0 1 4.2 4.2v1.4z" fill={tinte} />
          <rect x="3.6" y="11.9" width="16.8" height="7.6" rx="1.4" fill={tinte} />
          <rect x="10.1" y="8.6" width="3.8" height="5.6" rx="0.9" fill="currentColor" />
          <rect x="11.2" y="10" width="1.6" height="2.4" rx="0.6" fill={tinte} />
        </g>
      );
    case 'ammo': // Munitionskiste: Kasten mit Deckelleiste und drei Patronen
      return (
        <g>
          <rect x="3" y="4.6" width="18" height="2.2" rx="1.1" fill={tinte} />
          <rect x="3" y="7.8" width="18" height="11.6" rx="1.6" fill={tinte} />
          {[6.6, 10.9, 15.2].map((x) => <path key={x} d={`M${x} 17.2v-4.6c0-1.3 1.1-2.6 1.1-2.6s1.1 1.3 1.1 2.6v4.6z`} fill="currentColor" />)}
        </g>
      );
    case 'slurp': // Slurp-Fass: gefuelltes Fass, dunkle Reifen, Tropfen
      return (
        <g>
          <path d="M7 3.4h10l1.9 8.6L17 20.6H7L5.1 12z" fill={tinte} />
          <path d="M5.9 7.8h12.2M5.9 16.2h12.2" stroke="currentColor" strokeWidth={1.4} />
          <path d="M12 9.4c1.5 1.9 2.1 2.9 2.1 3.8a2.1 2.1 0 0 1-4.2 0c0-.9.6-1.9 2.1-3.8z" fill="currentColor" />
        </g>
      );
    case 'reboot': // Reboot-Van: gefuellte Scheibe mit dunklem Neustart-Pfeil
      return (
        <g>
          <circle cx="12" cy="12" r="9" fill={tinte} />
          <path d="M16.9 12.3A4.9 4.9 0 1 1 15.4 8.4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
          <path d="M16.6 5.9v3.4h-3.4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'launchpad': // Startrampe: Platte mit zwei dunklen Pfeilen nach oben
      return (
        <g>
          <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3.2" fill={tinte} />
          <path d="M7.4 11.6l4.6-4.6 4.6 4.6M7.4 17l4.6-4.6 4.6 4.6" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'zipline': // Seil, Laufrolle, Griff
      return (
        <g>
          <path d="M3 4.6l18 6" {...linie} />
          <circle cx="11.6" cy="7.7" r="2" fill={tinte} />
          <path d="M11.6 9.4l-2.2 6.4h4.8z" {...linie} strokeWidth={1.9} />
        </g>
      );
    case 'vending': // Automat: gefuellter Kasten, dunkles Fenster und Ausgabe
      return (
        <g>
          <rect x="5.4" y="3" width="13.2" height="18" rx="1.8" fill={tinte} />
          <rect x="7.4" y="5.2" width="6" height="9" rx="0.9" fill="currentColor" />
          <circle cx="15.8" cy="6.6" r="1" fill="currentColor" /><circle cx="15.8" cy="9.4" r="1" fill="currentColor" /><circle cx="15.8" cy="12.2" r="1" fill="currentColor" />
          <rect x="7.4" y="16.4" width="9.2" height="2.4" rx="0.8" fill="currentColor" />
        </g>
      );
    case 'fishing': // Fisch mit Schwanzflosse
      return (
        <g>
          <path d="M3.2 12c3.2-4.4 9.4-5.2 13.2 0-3.8 5.2-10 4.4-13.2 0z" fill={tinte} />
          <path d="M15.6 12l5.2-4.2v8.4z" fill={tinte} />
          <circle cx="7.4" cy="11.2" r="1.15" fill="currentColor" />
        </g>
      );
    case 'vault': // Tresortuer: gefuellte Tuer, dunkles Rad
      return <g><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="2.4" fill={tinte} /><circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth={2} /><path d="M12 7.6V5.4M12 18.6v-2.2M7.6 12H5.4M18.6 12h-2.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /></g>;
    case 'buried': // Schatzkarten-X auf dem Boden
      return <g><path d="M7 5.5l10 10M17 5.5l-10 10" {...linie} strokeWidth={3} /><path d="M4 19.5h16" {...linie} strokeWidth={2.2} /></g>;
    case 'cannon': // Kanonenrohr auf Rad
      return <g><path d="M5 14.5l11-6.5 2 3.4-11 6.5z" fill={tinte} /><circle cx="9" cy="16.5" r="3.4" fill={tinte} stroke="currentColor" strokeWidth="1.2" /><path d="M17.2 9.2l1.6-1" {...linie} /></g>;
    case 'wanted': // Steckbrief mit Kopf
      return <g><rect x="5.5" y="3.5" width="13" height="17" rx="1.4" {...linie} /><circle cx="12" cy="10" r="2.6" fill={tinte} /><path d="M8.2 16.5c.8-2 2.2-2.8 3.8-2.8s3 .8 3.8 2.8" {...linie} strokeWidth={1.8} /></g>;
    case 'extraction': // Pfeil nach oben aus dem Ring
      return <g><path d="M6 15.5a7 7 0 0 0 12 0" {...linie} /><path d="M12 15V4.5M8 8.5l4-4 4 4" {...linie} strokeWidth={2.4} /></g>;
    case 'portapotty': // Kabine mit Mond
      return <g><rect x="6.5" y="3.5" width="11" height="17" rx="1.6" {...linie} /><path d="M13.6 6.6a2 2 0 1 0 0 3.2 2.5 2.5 0 0 1 0-3.2z" fill={tinte} /><circle cx="15" cy="13.5" r="0.9" fill={tinte} /></g>;
    case 'whirlpool': // Wirbel: dicke blaue Spirale
      return <path d="M12 12a1.6 1.6 0 1 1 1.6 1.6A3.4 3.4 0 1 1 15.4 10a5.4 5.4 0 1 1-8.8 4.2" {...linie} strokeWidth={3} />;
    case 'sportscar': // flaches Auto
      return <g><path d="M3 15.5v-2l3.5-.8 3-3h5l3.5 3 3 .8v2z" fill={tinte} /><circle cx="7.5" cy="16" r="2" fill={tinte} stroke="currentColor" strokeWidth="1.2" /><circle cx="16.5" cy="16" r="2" fill={tinte} stroke="currentColor" strokeWidth="1.2" /></g>;
    case 'suv': // hohes Auto
      return <g><path d="M3.5 16V10l2.5-4h10l2.5 4 2 1v5z" fill={tinte} /><path d="M7 7.6h4v2.6H5.6zM12.6 7.6h3.2l1.4 2.6h-4.6z" fill="currentColor" /><circle cx="7.5" cy="16.6" r="2" fill={tinte} stroke="currentColor" strokeWidth="1.2" /><circle cx="16.5" cy="16.6" r="2" fill={tinte} stroke="currentColor" strokeWidth="1.2" /></g>;
    case 'boat': // Rumpf mit Kabine
      return <g><path d="M3 13.5h18l-3.2 5.2H6.4z" fill={tinte} /><path d="M8 13.5V9.5h5l2.5 4" fill={tinte} /><path d="M3.5 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 3.5.5" {...linie} strokeWidth={1.4} /></g>;
    case 'tires': // Reifen
      return <g><circle cx="12" cy="12" r="7.2" fill="none" stroke={tinte} strokeWidth="3.4" /><circle cx="12" cy="12" r="2.2" fill={tinte} /></g>;
    case 'service': // Zapfsaeule
      return <g><rect x="5.5" y="4" width="9" height="16" rx="1.4" fill={tinte} /><rect x="7.3" y="6" width="5.4" height="3.6" rx="0.6" fill="currentColor" /><path d="M14.5 9h2.5l1.5 2v6.5a1.3 1.3 0 0 1-2.6 0V14h-1.4" {...linie} strokeWidth={1.7} /></g>;
    case 'campfire': // Flamme ueber Holz
      return <g><path d="M12 3.5c3 3.2 4.6 5.4 4.6 7.9a4.6 4.6 0 0 1-9.2 0c0-1.6.8-2.9 2-4 .2 1.5.9 2.4 1.8 2.8-.4-2.4.1-4.4.8-6.7z" fill={tinte} /><path d="M5 20.5l14-3.4M19 20.5L5 17.1" {...linie} strokeWidth={2.2} /></g>;
    case 'produce': // Apfel mit Blatt
      return <g><path d="M12 8.2c-1.6-1.2-5.8-1.4-6.4 3-.5 3.8 2.4 8.6 4.6 8.6 1 0 1.2-.5 1.8-.5s.8.5 1.8.5c2.2 0 5.1-4.8 4.6-8.6-.6-4.4-4.8-4.2-6.4-3z" fill={tinte} /><path d="M12 8V5.5M12.5 6c1-1.6 2.6-2 3.8-1.6-.4 1.4-1.8 2.2-3.8 1.6z" {...linie} strokeWidth={1.5} /></g>;
    case 'slurptruck': // Tankwagen mit Tropfen
      return <g><rect x="3" y="7" width="12" height="8.5" rx="3" fill={tinte} /><path d="M15.5 9.5h3l2.5 3v3h-5.5z" fill={tinte} /><path d="M9 8.8c1.2 1.5 1.7 2.3 1.7 3a1.7 1.7 0 0 1-3.4 0c0-.7.5-1.5 1.7-3z" fill="currentColor" /><circle cx="7" cy="17" r="1.9" fill={tinte} stroke="currentColor" strokeWidth="1.1" /><circle cx="17.5" cy="17" r="1.9" fill={tinte} stroke="currentColor" strokeWidth="1.1" /></g>;
    case 'fishingrod': // Angel mit Schnur und Haken
      return <g><path d="M4.5 20L17 4" {...linie} strokeWidth={2.4} /><circle cx="8" cy="15.6" r="1.8" fill={tinte} /><path d="M17 4c1.8 3 2.2 7 2 10.5" {...linie} strokeWidth={1.3} /><path d="M19 14.5c0 2-2.6 2-2.6.2" {...linie} strokeWidth={1.6} /></g>;
    case 'bush': // Busch aus drei Kreisen
      return <g fill={tinte}><circle cx="8" cy="13.5" r="4" /><circle cx="16" cy="13.5" r="4" /><circle cx="12" cy="9.5" r="4.4" /><rect x="5" y="14" width="14" height="5" rx="2.5" /></g>;
    case 'npc': // Figur
      return <g fill={tinte}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.6-4.4 3.3-6.6 7-6.6s6.4 2.2 7 6.6z" /></g>;
    default:
      return <circle cx="12" cy="12" r="4" fill={tinte} />;
  }
}

/** Ersatz-Symbol im Spielstil als SVG-Text: Silhouette in der Ebenenfarbe, dunkler Umriss (Filter), leichter Schatten nach unten. */
function spielSvg(typ: string) {
  const farbe = ebeneVon(typ).farbe;
  const inhalt = renderToStaticMarkup(<g color={UMRISS}><Zeichen typ={typ} tinte={farbe} /></g>);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 30 30" width="96" height="96"><defs><filter id="u" x="-30%" y="-30%" width="160%" height="160%">`
    + `<feMorphology in="SourceAlpha" operator="dilate" radius="1.45" result="d"/><feFlood flood-color="${UMRISS}"/><feComposite in2="d" operator="in" result="r"/>`
    + `<feGaussianBlur in="d" stdDeviation="0.9" result="b"/><feOffset in="b" dy="1.1" result="o"/><feFlood flood-color="#000" flood-opacity="0.55"/><feComposite in2="o" operator="in" result="s"/>`
    + `<feMerge><feMergeNode in="s"/><feMergeNode in="r"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#u)">${inhalt}</g></svg>`;
}
const SPIEL_BILD = new Map<string, string>();
/** Ersatz-Symbol einer Objektart als Bildadresse (data:, einmal je Art gebaut). */
export function spielBild(typ: string) {
  let u = SPIEL_BILD.get(typ);
  if (!u) { u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(spielSvg(typ))}`; SPIEL_BILD.set(typ, u); }
  return u;
}
/** Bildquelle eines Markers: Original aus dem lokalen Export, sonst das Ersatz-Symbol. */
export const symbolQuelle = (typ: string, original: Set<string>) => (original.has(typ) ? ORIGINAL_PFAD(typ) : spielBild(typ));

/** Die <symbol>-Vorlagen fuer die Karte (einmal je SVG einhaengen, dann <use href="#k-chest" />). Original-Symbol, wenn vorhanden. */
export function SymbolVorlagen() {
  const original = useOriginalSymbole();
  return (
    <defs>
      {EBENEN.map((e) => (
        <symbol key={e.typ} id={`k-${e.typ}`} viewBox="0 0 24 24">
          <image href={symbolQuelle(e.typ, original)} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
        </symbol>
      ))}
    </defs>
  );
}

/** Symbol als kleines Bild (Seitenleiste, Hinweise) - Original oder Ersatz im Spielstil. */
export function Abzeichen({ typ, groesse = 20, className = '' }: { typ: string; groesse?: number; className?: string }) {
  const original = useOriginalSymbole();
  return <img src={symbolQuelle(typ, original)} alt="" width={groesse} height={groesse} draggable={false} className={`shrink-0 object-contain ${className}`} aria-hidden="true" />;
}

/*
 * Spawn-Chancen: steht im Export bei einem Objekt `chance`, gilt die. Sonst die Grundchance der Klasse aus den Spieldaten (AthenaGameData,
 * von der lokalen Export-Sitzung gelesen): normale Truhe 67 %, Munitionskiste 75 %. Objekte mit AlwaysSpawn bekommen im Export chance 1.
 * Fuer alle anderen Arten gibt es keine Grundchance - dann zeigt die Karte keine.
 */
export const STANDARD_CHANCE: Record<string, number> = { chest: 0.67, ammo: 0.75 };
export function chanceVon(o: { typ: string; chance?: number | null }): { wert: number; standard: boolean } | null {
  if (typeof o.chance === 'number' && Number.isFinite(o.chance)) return { wert: Math.min(1, Math.max(0, o.chance)), standard: false };
  const s = STANDARD_CHANCE[o.typ];
  return s === undefined ? null : { wert: s, standard: true };
}

/** Stecknadel fuer benannte Orte (POI). */
export function OrtNadel({ aktiv, klein }: { aktiv?: boolean; klein?: boolean }) {
  const g = klein ? 13 : 17;
  return (
    <svg viewBox="0 0 24 24" width={g} height={g} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <path d="M12 22.5s-7.5-7.3-7.5-12.6a7.5 7.5 0 0 1 15 0c0 5.3-7.5 12.6-7.5 12.6z" fill={aktiv ? 'rgb(var(--akz))' : '#fff'} stroke={DUNKEL} strokeWidth="1.6" />
      <circle cx="12" cy="9.8" r="2.9" fill={DUNKEL} />
    </svg>
  );
}
