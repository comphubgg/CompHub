/*
 * Reload-Inseln aus den Spieldateien: oeffentlicher Name und Kartenbild.
 *
 * Der Betreiber wollte die Reload-Karten nicht von Hand hochladen: "Kannst
 * du die auch ueber API herausfinden? ... ohne dass ich sie als PNG hochladen
 * muss." fortnite-api.com kennt nur die grosse Karte. Was es aber gibt, ist
 * der Export-Dienst hinter fortniteapi.com (export-service.dillyapis.com):
 * er liest die Spieldateien der laufenden Version und gibt einzelne Objekte
 * heraus - Daten als JSON, Texturen als PNG. Kostenlos, ohne Schluessel,
 * ohne Anmeldung. Daraus kommt fuer jede Insel genau das, was das Spiel
 * selbst in seiner Karte zeigt.
 *
 * Der Weg je Insel (Codename aus Epics Playlist, etwa "SourSpawn"):
 *
 *   BlastBerryMapUI/<Code>/<Code>_MapUIData      -> RotationMapNames
 *                                                   ["Nitemare Island", "SourSpawn"]
 *                                                   + MapMaterial
 *   BlastBerryMapUI/Minimap/MI_MiniMap_<Code>_..  -> Texture2D Discovered_<Code>
 *   BlastBerryMapUI/Minimap/Discovered_<Code>     -> das Bild, 2048 x 2048
 *
 * Nachgeprueft am 21.9.2026 fuer SourSpawn: das ist Nitemare Island - und
 * nicht Elite Stronghold, wie zuvor aus einem Beitrag geschlossen. Genau
 * deshalb wird hier nichts mehr geraten, sondern aus der Quelle gelesen.
 *
 * Der Dienst ist eine Beta von Dritten und kann verschwinden. Was einmal
 * geholt ist, liegt danach in der eigenen Ablage (kartenbilder/) und
 * braucht ihn nicht mehr.
 */

const EXPORT = 'https://export-service.dillyapis.com/v1/export';
const MAPUI = 'FortniteGame/Plugins/GameFeatures/BlastBerryMapUI/Content';
const FRIST_MS = 60_000;

interface ExportAntwort {
  jsonOutput?: Array<{ Type?: string; Name?: string; Properties?: Record<string, unknown> }>;
}

async function exportJson(pfad: string): Promise<ExportAntwort | null> {
  const r = await fetch(`${EXPORT}?Path=${encodeURIComponent(pfad)}`, {
    cache: 'no-store', signal: AbortSignal.timeout(FRIST_MS),
  });
  if (!r.ok) return null;
  const typ = r.headers.get('content-type') ?? '';
  if (!typ.includes('json')) return null;
  return await r.json() as ExportAntwort;
}

async function exportBild(pfad: string): Promise<Buffer | null> {
  const r = await fetch(`${EXPORT}?Path=${encodeURIComponent(pfad)}`, {
    cache: 'no-store', signal: AbortSignal.timeout(FRIST_MS * 3),
  });
  if (!r.ok) return null;
  const typ = r.headers.get('content-type') ?? '';
  if (!typ.startsWith('image/')) return null;
  return Buffer.from(await r.arrayBuffer());
}

export interface InselAngaben {
  code: string;
  /** Der Name, den das Spiel zeigt - "Nitemare Island", "Slurp Rush". */
  name: string;
  /** Der Spielpfad der Kartentextur. */
  textur: string;
}

/** Der Spielpfad aus einer Asset-Angabe ("/BlastBerryMapUI/X/Y.Y" -> ".../Content/X/Y"). */
function pfadAus(asset: string | undefined, plugin: string): string | null {
  const m = (asset ?? '').match(new RegExp(`^/${plugin}/(.+?)\\.[^.]+$`));
  return m ? `FortniteGame/Plugins/GameFeatures/${plugin}/Content/${m[1]}` : null;
}

/** Name und Texturpfad einer Insel - oder null, wenn die Quelle sie nicht kennt. */
export async function inselAngaben(code: string): Promise<InselAngaben | null> {
  if (!/^[A-Za-z]{3,40}$/.test(code)) return null;

  /*
   * Der Weg ueber die Playlist, nicht ueber geratene Pfade: aeltere Inseln
   * heissen "<Code>_UIMapData", neuere "<Code>_MapUIData". Die Playlist
   * nennt ihren Kartenverwalter, der nennt die Kartendaten.
   */
  let datenPfad: string | null = null;
  const playlist = await exportJson(`FortniteGame/Plugins/GameFeatures/BlastBerryPlaylists/Content/BlastBerry/Playlists/Playlist_${code}Solo`);
  const verwalter = (playlist?.jsonOutput?.[0]?.Properties?.MapManagerClass as { AssetPathName?: string } | undefined)?.AssetPathName;
  const verwalterPfad = pfadAus(verwalter?.replace(/_C$/, ''), 'BlastBerryPlaylists');
  if (verwalterPfad) {
    const mm = await exportJson(verwalterPfad);
    const t = JSON.stringify(mm ?? {}).match(/"AssetPathName": ?"(\/BlastBerryMapUI\/[^"]+)"/);
    if (t) datenPfad = pfadAus(t[1], 'BlastBerryMapUI');
  }
  let daten: Record<string, unknown> | undefined;
  for (const pfad of [datenPfad, `${MAPUI}/${code}/${code}_MapUIData`, `${MAPUI}/${code}/${code}_UIMapData`]) {
    if (!pfad) continue;
    const ui = await exportJson(pfad);
    daten = ui?.jsonOutput?.find((o) => o.Type === 'FortMapUIData')?.Properties;
    if (daten) break;
  }
  if (!daten) return null;

  /*
   * RotationMapNames nennt den Anzeigenamen; der Codename selbst steht
   * teils daneben ("DashBerry", "Slurp Rush") und zaehlt nicht.
   */
  const namen = (Array.isArray(daten.RotationMapNames) ? daten.RotationMapNames : [])
    .map((n) => String(n)).filter((n) => n && n.toLowerCase() !== code.toLowerCase());
  const name = namen[0] ?? String(daten.MapName ?? code).replace(/_Terrain$/i, '');

  // Die Textur haengt am Kartenmaterial - dort steht sie als Texture2D.
  let textur = `${MAPUI}/Minimap/Discovered_${code}`;
  const materialPfad = pfadAus((daten.MapMaterial as { AssetPathName?: string } | undefined)?.AssetPathName, 'BlastBerryMapUI');
  if (materialPfad) {
    const mi = await exportJson(materialPfad);
    const t = JSON.stringify(mi ?? {}).match(/"ObjectPath": ?"\/BlastBerryMapUI\/([^"]*?Discovered_[^".]*)\.\d+"/);
    if (t) textur = `${MAPUI}/${t[1]}`;
  }
  return { code, name, textur };
}

/** Das Kartenbild einer Insel als PNG - oder null. */
export async function inselBild(angaben: InselAngaben): Promise<Buffer | null> {
  return exportBild(angaben.textur);
}
