/*
 * Eigene Karten-Symbole (Betreiber, 26.11.2026: "richtige Icons wie bei Fortnite.gg statt Punkte"). Selbst gezeichnet, keine fremden Dateien:
 * je Objektart ein abgerundetes Abzeichen in der Farbe der Ebene mit einem klaren, dunklen Zeichen darin (24er-Raster, nur Linien und Flaechen,
 * damit es bei jedem Zoom scharf bleibt). Die Karte haengt sie einmal als <symbol> in ihre SVG und setzt sie per <use> - so bleiben auch
 * Tausende Marker leicht; die Seitenleiste zeichnet dasselbe Abzeichen als eigenes kleines SVG.
 */

export interface Ebene { typ: string; titel: string; einzeln: string; farbe: string; namen: string[]; gruppe: string; zeichen?: string }

/** Ebenen nach der Spezifikation (Loot, Sprites, Movement, Vehicles, Healing, Fishing, NPCs, Other). zeichen = anderes Zeichen wiederverwenden. */
export const EBENEN: Ebene[] = [
  { gruppe: 'Loot', typ: 'vault', titel: 'Vaults', einzeln: 'Vault', farbe: '#e2e8f0', namen: ['vault', 'tresor'] },
  { gruppe: 'Loot', typ: 'chest', titel: 'Chests', einzeln: 'Chest', farbe: '#facc15', namen: ['chest', 'chests', 'truhe', 'tiered_chest', 'tieredchest'] },
  { gruppe: 'Loot', typ: 'buried', titel: 'Buried chests', einzeln: 'Buried chest', farbe: '#d97706', namen: ['buried', 'buriedchest', 'buried_chest'] },
  { gruppe: 'Loot', typ: 'rarechest', titel: 'Rare chests', einzeln: 'Rare chest', farbe: '#a78bfa', namen: ['rarechest', 'rare_chest'], zeichen: 'chest' },
  { gruppe: 'Loot', typ: 'lootcannon', titel: 'Loot cannons', einzeln: 'Loot cannon', farbe: '#f87171', namen: ['lootcannon', 'loot_cannon'], zeichen: 'cannon' },
  { gruppe: 'Loot', typ: 'ammo', titel: 'Ammo boxes', einzeln: 'Ammo box', farbe: '#a3e635', namen: ['ammo', 'ammobox', 'ammo_box', 'munition', 'munitionskiste'] },
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
  { gruppe: 'Healing', typ: 'slurp', titel: 'Slurp barrels', einzeln: 'Slurp barrel', farbe: '#38bdf8', namen: ['slurp', 'slurpbarrel', 'slurp_barrel', 'slurpfass'] },
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

/** Das Zeichen im Abzeichen (24er-Raster, Mitte 12/12). */
export function Zeichen({ typ: roh }: { typ: string }) {
  const typ = ebeneVon(roh).zeichen ?? roh;
  const linie = { fill: 'none', stroke: DUNKEL, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (typ) {
    case 'chest': // Truhe: gewoelbter Deckel, Kasten, Schloss
      return (
        <g>
          <path d="M4.5 11V9.2A4.2 4.2 0 0 1 8.7 5h6.6a4.2 4.2 0 0 1 4.2 4.2V11" {...linie} />
          <path d="M4.5 11h15v7a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z" fill={DUNKEL} />
          <rect x="10.4" y="9.4" width="3.2" height="4.6" rx="1" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" />
        </g>
      );
    case 'ammo': // eine grosse Patrone: Spitze, Fuge, Huelse mit Rand
      return (
        <g fill={DUNKEL}>
          <path d="M8.3 10.3V8.6C8.3 5.9 12 2.8 12 2.8s3.7 3.1 3.7 5.8v1.7z" />
          <rect x="8.3" y="11.7" width="7.4" height="6.9" rx="0.6" />
          <rect x="7.3" y="19.2" width="9.4" height="1.9" rx="0.7" />
        </g>
      );
    case 'slurp': // Fass mit Reifen und Tropfen
      return (
        <g>
          <path d="M7.2 4h9.6l1.6 8-1.6 8H7.2l-1.6-8z" {...linie} />
          <path d="M6.2 8.2h11.6M6.2 15.8h11.6" {...linie} strokeWidth={1.6} />
          <path d="M12 9.6c1.4 1.8 2 2.8 2 3.7a2 2 0 0 1-4 0c0-.9.6-1.9 2-3.7z" fill={DUNKEL} />
        </g>
      );
    case 'reboot': // Neustart-Pfeil im Kreis
      return (
        <g>
          <path d="M18.6 12.4A6.7 6.7 0 1 1 16.6 7.3" {...linie} strokeWidth={2.4} />
          <path d="M18.8 4.4v4.4h-4.4" {...linie} strokeWidth={2.4} />
        </g>
      );
    case 'launchpad': // zwei Pfeile nach oben
      return (
        <g>
          <path d="M6 12.4l6-6 6 6" {...linie} strokeWidth={2.6} />
          <path d="M6 18.6l6-6 6 6" {...linie} strokeWidth={2.6} />
        </g>
      );
    case 'zipline': // Seil, Laufrolle, Griff
      return (
        <g>
          <path d="M3 4.6l18 6" {...linie} />
          <circle cx="11.6" cy="7.7" r="2" fill={DUNKEL} />
          <path d="M11.6 9.4l-2.2 6.4h4.8z" {...linie} strokeWidth={1.9} />
        </g>
      );
    case 'vending': // Automat: Fenster, Knoepfe, Ausgabe
      return (
        <g>
          <rect x="5.8" y="3.6" width="12.4" height="16.8" rx="1.6" {...linie} />
          <rect x="8" y="6" width="5.4" height="8" rx="0.8" fill={DUNKEL} />
          <circle cx="15.6" cy="7.2" r="0.95" fill={DUNKEL} /><circle cx="15.6" cy="10" r="0.95" fill={DUNKEL} /><circle cx="15.6" cy="12.8" r="0.95" fill={DUNKEL} />
          <path d="M8.4 17.4h7.2" {...linie} />
        </g>
      );
    case 'fishing': // Fisch mit Schwanzflosse
      return (
        <g>
          <path d="M3.2 12c3.2-4.4 9.4-5.2 13.2 0-3.8 5.2-10 4.4-13.2 0z" fill={DUNKEL} />
          <path d="M15.6 12l5.2-4.2v8.4z" fill={DUNKEL} />
          <circle cx="7.4" cy="11.2" r="1.15" fill="currentColor" />
        </g>
      );
    case 'vault': // Tresortuer mit Rad
      return <g><rect x="4.5" y="4.5" width="15" height="15" rx="2" {...linie} /><circle cx="12" cy="12" r="3.6" {...linie} /><path d="M12 8.4V5.8M12 18.2v-2.6M8.4 12H5.8M18.2 12h-2.6" {...linie} strokeWidth={1.6} /></g>;
    case 'buried': // Schatzkarten-X auf dem Boden
      return <g><path d="M7 5.5l10 10M17 5.5l-10 10" {...linie} strokeWidth={3} /><path d="M4 19.5h16" {...linie} strokeWidth={2.2} /></g>;
    case 'cannon': // Kanonenrohr auf Rad
      return <g><path d="M5 14.5l11-6.5 2 3.4-11 6.5z" fill={DUNKEL} /><circle cx="9" cy="16.5" r="3.4" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" /><path d="M17.2 9.2l1.6-1" {...linie} /></g>;
    case 'wanted': // Steckbrief mit Kopf
      return <g><rect x="5.5" y="3.5" width="13" height="17" rx="1.4" {...linie} /><circle cx="12" cy="10" r="2.6" fill={DUNKEL} /><path d="M8.2 16.5c.8-2 2.2-2.8 3.8-2.8s3 .8 3.8 2.8" {...linie} strokeWidth={1.8} /></g>;
    case 'extraction': // Pfeil nach oben aus dem Ring
      return <g><path d="M6 15.5a7 7 0 0 0 12 0" {...linie} /><path d="M12 15V4.5M8 8.5l4-4 4 4" {...linie} strokeWidth={2.4} /></g>;
    case 'portapotty': // Kabine mit Mond
      return <g><rect x="6.5" y="3.5" width="11" height="17" rx="1.6" {...linie} /><path d="M13.6 6.6a2 2 0 1 0 0 3.2 2.5 2.5 0 0 1 0-3.2z" fill={DUNKEL} /><circle cx="15" cy="13.5" r="0.9" fill={DUNKEL} /></g>;
    case 'whirlpool': // Spirale
      return <path d="M12 12a1.6 1.6 0 1 1 1.6 1.6A3.4 3.4 0 1 1 15.4 10a5.4 5.4 0 1 1-8.8 4.2" {...linie} strokeWidth={2.2} />;
    case 'sportscar': // flaches Auto
      return <g><path d="M3 15.5v-2l3.5-.8 3-3h5l3.5 3 3 .8v2z" fill={DUNKEL} /><circle cx="7.5" cy="16" r="2" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" /><circle cx="16.5" cy="16" r="2" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" /></g>;
    case 'suv': // hohes Auto
      return <g><path d="M3.5 16V10l2.5-4h10l2.5 4 2 1v5z" fill={DUNKEL} /><path d="M7 7.6h4v2.6H5.6zM12.6 7.6h3.2l1.4 2.6h-4.6z" fill="currentColor" /><circle cx="7.5" cy="16.6" r="2" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" /><circle cx="16.5" cy="16.6" r="2" fill={DUNKEL} stroke="currentColor" strokeWidth="1.2" /></g>;
    case 'boat': // Rumpf mit Kabine
      return <g><path d="M3 13.5h18l-3.2 5.2H6.4z" fill={DUNKEL} /><path d="M8 13.5V9.5h5l2.5 4" fill={DUNKEL} /><path d="M3.5 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 3.5.5" {...linie} strokeWidth={1.4} /></g>;
    case 'tires': // Reifen
      return <g><circle cx="12" cy="12" r="7.2" fill="none" stroke={DUNKEL} strokeWidth="3.4" /><circle cx="12" cy="12" r="2.2" fill={DUNKEL} /></g>;
    case 'service': // Zapfsaeule
      return <g><rect x="5.5" y="4" width="9" height="16" rx="1.4" fill={DUNKEL} /><rect x="7.3" y="6" width="5.4" height="3.6" rx="0.6" fill="currentColor" /><path d="M14.5 9h2.5l1.5 2v6.5a1.3 1.3 0 0 1-2.6 0V14h-1.4" {...linie} strokeWidth={1.7} /></g>;
    case 'campfire': // Flamme ueber Holz
      return <g><path d="M12 3.5c3 3.2 4.6 5.4 4.6 7.9a4.6 4.6 0 0 1-9.2 0c0-1.6.8-2.9 2-4 .2 1.5.9 2.4 1.8 2.8-.4-2.4.1-4.4.8-6.7z" fill={DUNKEL} /><path d="M5 20.5l14-3.4M19 20.5L5 17.1" {...linie} strokeWidth={2.2} /></g>;
    case 'produce': // Apfel mit Blatt
      return <g><path d="M12 8.2c-1.6-1.2-5.8-1.4-6.4 3-.5 3.8 2.4 8.6 4.6 8.6 1 0 1.2-.5 1.8-.5s.8.5 1.8.5c2.2 0 5.1-4.8 4.6-8.6-.6-4.4-4.8-4.2-6.4-3z" fill={DUNKEL} /><path d="M12 8V5.5M12.5 6c1-1.6 2.6-2 3.8-1.6-.4 1.4-1.8 2.2-3.8 1.6z" {...linie} strokeWidth={1.5} /></g>;
    case 'slurptruck': // Tankwagen mit Tropfen
      return <g><rect x="3" y="7" width="12" height="8.5" rx="3" fill={DUNKEL} /><path d="M15.5 9.5h3l2.5 3v3h-5.5z" fill={DUNKEL} /><path d="M9 8.8c1.2 1.5 1.7 2.3 1.7 3a1.7 1.7 0 0 1-3.4 0c0-.7.5-1.5 1.7-3z" fill="currentColor" /><circle cx="7" cy="17" r="1.9" fill={DUNKEL} stroke="currentColor" strokeWidth="1.1" /><circle cx="17.5" cy="17" r="1.9" fill={DUNKEL} stroke="currentColor" strokeWidth="1.1" /></g>;
    case 'fishingrod': // Angel mit Schnur und Haken
      return <g><path d="M4.5 20L17 4" {...linie} strokeWidth={2.4} /><circle cx="8" cy="15.6" r="1.8" fill={DUNKEL} /><path d="M17 4c1.8 3 2.2 7 2 10.5" {...linie} strokeWidth={1.3} /><path d="M19 14.5c0 2-2.6 2-2.6.2" {...linie} strokeWidth={1.6} /></g>;
    case 'bush': // Busch aus drei Kreisen
      return <g fill={DUNKEL}><circle cx="8" cy="13.5" r="4" /><circle cx="16" cy="13.5" r="4" /><circle cx="12" cy="9.5" r="4.4" /><rect x="5" y="14" width="14" height="5" rx="2.5" /></g>;
    case 'npc': // Figur
      return <g fill={DUNKEL}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.6-4.4 3.3-6.6 7-6.6s6.4 2.2 7 6.6z" /></g>;
    default:
      return <circle cx="12" cy="12" r="4" fill={DUNKEL} />;
  }
}

/** Ein vollstaendiges Abzeichen (Rahmen + Zeichen) im 24er-Raster. */
export function AbzeichenInhalt({ typ }: { typ: string }) {
  const farbe = ebeneVon(typ).farbe;
  return (
    <g color={farbe}>
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill={farbe} stroke={DUNKEL} strokeWidth="1.5" />
      <rect x="2.2" y="2.2" width="19.6" height="9" rx="5" fill="#fff" opacity="0.18" />
      <Zeichen typ={typ} />
    </g>
  );
}

/** Die <symbol>-Vorlagen fuer die Karte (einmal je SVG einhaengen, dann <use href="#k-chest" />). */
export function SymbolVorlagen() {
  return (
    <defs>
      {EBENEN.map((e) => <symbol key={e.typ} id={`k-${e.typ}`} viewBox="0 0 24 24"><AbzeichenInhalt typ={e.typ} /></symbol>)}
      <filter id="k-schatten" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.65" /></filter>
    </defs>
  );
}

/** Abzeichen als eigenstaendiges kleines SVG (Seitenleiste, Hinweise). */
export function Abzeichen({ typ, groesse = 20, className = '' }: { typ: string; groesse?: number; className?: string }) {
  return <svg viewBox="0 0 24 24" width={groesse} height={groesse} className={`shrink-0 ${className}`} aria-hidden="true"><AbzeichenInhalt typ={typ} /></svg>;
}

/** Stecknadel fuer benannte Orte (POI). */
export function OrtNadel({ aktiv, klein }: { aktiv?: boolean; klein?: boolean }) {
  const g = klein ? 13 : 17;
  return (
    <svg viewBox="0 0 24 24" width={g} height={g} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <path d="M12 22.5s-7.5-7.3-7.5-12.6a7.5 7.5 0 0 1 15 0c0 5.3-7.5 12.6-7.5 12.6z" fill={aktiv ? '#5eead4' : '#fff'} stroke={DUNKEL} strokeWidth="1.6" />
      <circle cx="12" cy="9.8" r="2.9" fill={DUNKEL} />
    </svg>
  );
}
