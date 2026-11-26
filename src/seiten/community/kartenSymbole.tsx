/*
 * Eigene Karten-Symbole (Betreiber, 26.11.2026: "richtige Icons wie bei Fortnite.gg statt Punkte"). Selbst gezeichnet, keine fremden Dateien:
 * je Objektart ein abgerundetes Abzeichen in der Farbe der Ebene mit einem klaren, dunklen Zeichen darin (24er-Raster, nur Linien und Flaechen,
 * damit es bei jedem Zoom scharf bleibt). Die Karte haengt sie einmal als <symbol> in ihre SVG und setzt sie per <use> - so bleiben auch
 * Tausende Marker leicht; die Seitenleiste zeichnet dasselbe Abzeichen als eigenes kleines SVG.
 */

export interface Ebene { typ: string; titel: string; einzeln: string; farbe: string; namen: string[] }

export const EBENEN: Ebene[] = [
  { typ: 'chest', titel: 'Chests', einzeln: 'Chest', farbe: '#facc15', namen: ['chest', 'chests', 'truhe', 'tiered_chest', 'tieredchest'] },
  { typ: 'ammo', titel: 'Ammo boxes', einzeln: 'Ammo box', farbe: '#a3e635', namen: ['ammo', 'ammobox', 'ammo_box', 'munition', 'munitionskiste'] },
  { typ: 'slurp', titel: 'Slurp barrels', einzeln: 'Slurp barrel', farbe: '#38bdf8', namen: ['slurp', 'slurpbarrel', 'slurp_barrel', 'slurpfass'] },
  { typ: 'reboot', titel: 'Reboot vans', einzeln: 'Reboot van', farbe: '#f472b6', namen: ['reboot', 'rebootvan', 'reboot_van'] },
  { typ: 'launchpad', titel: 'Launch pads', einzeln: 'Launch pad', farbe: '#fb923c', namen: ['launchpad', 'launch_pad', 'sprungpad'] },
  { typ: 'zipline', titel: 'Ziplines', einzeln: 'Zipline', farbe: '#e2e8f0', namen: ['zipline', 'ziplines', 'seilrutsche'] },
  { typ: 'vending', titel: 'Vending machines', einzeln: 'Vending machine', farbe: '#c084fc', namen: ['vending', 'vendingmachine', 'vending_machine', 'automat'] },
  { typ: 'fishing', titel: 'Fishing spots', einzeln: 'Fishing spot', farbe: '#22d3ee', namen: ['fishing', 'fishingspot', 'fishing_spot', 'fishinghole', 'angelstelle'] },
  { typ: 'other', titel: 'Other objects', einzeln: 'Object', farbe: '#94a3b8', namen: [] },
];
export const ebeneVon = (typ: string) => EBENEN.find((e) => e.typ === typ) ?? EBENEN[EBENEN.length - 1];
export const typVon = (roh: string) => {
  const n = roh.toLowerCase().replace(/[\s-]/g, '');
  return EBENEN.find((e) => e.typ === n || e.namen.includes(n))?.typ ?? 'other';
};

const DUNKEL = '#0b1220';

/** Das Zeichen im Abzeichen (24er-Raster, Mitte 12/12). */
export function Zeichen({ typ }: { typ: string }) {
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
