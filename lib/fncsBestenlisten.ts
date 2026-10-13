import daten from '@/lib/fncsBestenlisten.json';

/*
 * Die vollstaendigen Bestenlisten der FNCS-Endspiele vor Chapter 5 Season 3 (Chapter 1 Season X bis Chapter 6 Season 3) - Platz, ganzes
 * Team, Punkte, Siege, Eliminierungen, Spiele.
 *
 * Der Betreiber (13.10.2026): bei jedem Endspiel muss das Leaderboard stehen wie bei EU Competitive (Points, Wins, Elims, Matches, ganze
 * Teams - ein Trio-Cup zeigt nur Trios), und das Grand Royale von Chapter 2 Season 8 stimmte nicht. Epic fuehrt diese Events nicht mehr;
 * die Rohlisten (Epics Ergebnisdateien je Spieltag) liegen bei EU Competitive. Sie wurden einmal geholt, die Tage zusammengerechnet
 * (Punkte aus der Epic-Wertung, Siege/Eliminierungen/Spiele aus dem Verlauf jedes Spiels) und gegen die Eckdaten in lib/fncsFakten
 * geprueft: bei allen Endspielen stimmen die ersten fuenf Plaetze mit den veroeffentlichten Ergebnissen ueberein. Die ersten fuenf
 * Plaetze stehen im Zweifel immer so, wie die Eckdaten sie nennen - beim Grand Royale entschied eine Sonderregel (erst die Schwelle,
 * dann ein Sieg), nicht die Punktesumme.
 *
 * Schluessel wie in lib/fncsListe: "<Saison>|<Art>". Dateiformat: je Team [Punkte, Siege, Eliminierungen, Spiele, [[Konto, Name, Land], ...]].
 */

type Roh = Record<string, Array<[number, number, number, number, Array<[string, string | null, string | null]>]>>;

export interface ArchivTeam {
  rang: number; punkte: number; siege: number; elims: number; spiele: number;
  spieler: Array<{ id: string; name: string; land: string | null }>;
}

const ROH = daten as unknown as Roh;

/** Gibt es zu diesem Endspiel eine archivierte Bestenliste? */
export const hatArchiv = (key: string) => !!ROH[key];

let nameMerker: Map<string, string> | null = null;

/** Die wenigen Konten, die in der Quelle keinen Namen haben: der aktuelle Epic-Name, sonst "Unknown". Einmal je Prozess. */
async function fehlendeNamen(): Promise<Map<string, string>> {
  if (nameMerker) return nameMerker;
  const ohne = new Set<string>();
  for (const liste of Object.values(ROH)) for (const t of liste) for (const [id, name] of t[4]) if (!name) ohne.add(id);
  const karte = new Map<string, string>();
  if (ohne.size) {
    try {
      const { getToken, loeseNamenAuf } = await import('@/lib/epicCups');
      const { token } = await getToken();
      const namen = await loeseNamenAuf([...ohne], token);
      // Eine gekuerzte Id (Epic kennt das Konto nicht mehr) ist kein Name.
      for (const [id, n] of Object.entries(namen)) if (n && n !== id.slice(0, 8)) karte.set(id, n);
    } catch { /* ohne Epic bleibt es bei "Unknown" */ }
  }
  nameMerker = karte;
  return karte;
}

export async function archivListe(key: string): Promise<ArchivTeam[] | null> {
  const liste = ROH[key];
  if (!liste) return null;
  const ersatz = await fehlendeNamen();
  return liste.map((t, i) => ({
    rang: i + 1, punkte: t[0], siege: t[1], elims: t[2], spiele: t[3],
    spieler: t[4].map(([id, name, land]) => ({ id, name: name || ersatz.get(id) || 'Unknown', land: land && /^[A-Za-z]{2}$/.test(land) ? land.toUpperCase() : null })),
  }));
}
