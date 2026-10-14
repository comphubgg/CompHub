import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Alle Kartenversionen von Fortnite - eine Karte je Update (Betreiber, 14.10.2026).
 *
 * Er wollte "wirklich jede einzelne Karte von jedem Update" zur Wahl haben: fortnite.gg/map-evolution fuehrt 228 (Stand 14.10.2026, bis Update
 * 42.30), allein in Chapter 7 zwanzig, in Chapter 6 vierundzwanzig. Der Admin waehlt je Cup (oder je Saison) die Version, die zum Spielstand
 * passt - zum Beispiel in Chapter 7 Season 4 die 42.30 oder die 42.20.
 *
 * Die Liste unten ist der Stand der Seite; die Bilder liegen bei fortnite.gg (img/maps/<Datei>) und werden ueber /api/maps-bild verkleinert
 * ausgeliefert - gespeichert wird nichts davon. Neue Updates findet sucheNeueKarten(): fortnite.gg selbst laesst sich nicht abfragen (die Seite
 * steckt hinter einer Cloudflare-Pruefung), aber die Bilddateien heissen immer "<Hauptversion>.<Unterversion>" - also wird taeglich nachgesehen,
 * ob es die naechsten Namen schon gibt. Was neu ist, steht in karten-updates-neu.json und wird dem Admin in Discord gemeldet.
 */

export interface KartenUpdate {
  /** "42.30", "32 week 2" ... wie bei fortnite.gg beschriftet. */
  patch: string;
  /** Kapitel als Zahl; 0 = noch keiner Saison zugeordnet (neu gefunden). */
  kapitel: number;
  /** Saison fuer die Anzeige: "Season 4", "Mini Season 2", "Remix" ... */
  saison: string;
  /** Dateiname bei fortnite.gg, wie dort geschrieben (mit "?3" bei den alten). */
  img: string;
  /** Vom taeglichen Abgleich gefunden, nicht aus der Liste. */
  neu?: boolean;
  /** Wann gefunden (ISO-Datum). */
  gefunden?: string;
}

const BILD_ORT = 'https://fortnite.gg/img/maps/';
const NEU_DATEI = 'karten-updates-neu.json';

/** Kapitel und Saison, ein Update je Eintrag: "C7S4|42.30|42.30.webp" - neuestes zuerst, wie auf der Seite. */
const STAND = 'C7S4|42.30|42.30.webp;C7S4|42.20|42.20.webp;C7S4|42.10|42.10.webp;C7S4|42.00|42.00.webp;C7S3|41.30|41.30.webp;C7S3|41.20|41.20.webp;C7S3|41.10|41.10.webp;C7S3|41.00|41.00.webp;C7S2|40.40|40.40.jpg;C7S2|40.30|40.30.webp;C7S2|40.20|40.20.jpg;C7S2|40.00|40.00.jpg;C7S1|39.51|39.51.jpg;C7S1|39.50|39.50.jpg;C7S1|39.40|39.40.jpg;C7S1|39.30|39.30.jpg;C7S1|39.20|39.20.jpg;C7S1|39.11|39.11.jpg;C7S1|39.10|39.10.jpg;C7S1|39.00|39.00.jpg;C6SMS2|38.11|38.11.jpg;C6SMS2|38.10|38.10.jpg;C6SMS2|38.00|38.00.jpg;C6S4|37.50|37.50.jpg;C6S4|37.40|37.40.jpg;C6S4|37.20|37.20.jpg;C6S4|37.10|37.10.jpg?3;C6S4|37.00|37.00.jpg?3;C6S3|36.30|36.30.jpg?3;C6S3|36.20|36.20.jpg?3;C6S3|36.10|36.10.jpg?3;C6S3|36.00|36.00.jpg?3;C6SMS1|35.20|35.20.jpg?3;C6SMS1|35.00|35.00.jpg?3;C6S2|34.40|34.40.jpg?3;C6S2|34.30|34.30.jpg?3;C6S2|34.21|34.21.jpg?3;C6S2|34.20|34.20.jpg?3;C6S2|34.10|34.10.jpg?3;C6S2|34.00|34.00.jpg?3;C6S1|33.20|33.20.jpg?3;C6S1|33.11|33.11.jpg?3;C6S1|33.10|33.10.jpg?3;C6S1|33.00|33.00.jpg?3;C5SREMIX|32 week 4|32-week-4.jpg;C5SREMIX|32 week 3|32-week-3.jpg;C5SREMIX|32 week 2|32-week-2.jpg;C5SREMIX|32.00|32.00.jpg?3;C5S4|31.41|31.41.jpg?3;C5S4|31.40|31.40.jpg?3;C5S4|31.30|31.30.jpg?3;C5S4|31.20|31.20.jpg?3;C5S4|31.10|31.10.jpg?3;C5S4|31.00|31.00.jpg?3;C5S3|30.40|30.40.jpg?3;C5S3|30.30|30.30.jpg?3;C5S3|30.20|30.20.jpg?3;C5S3|30.10|30.10.jpg?3;C5S3|30.00|30.00.jpg?3;C5S2|29.40|29.40.jpg?3;C5S2|29.30|29.30.jpg?3;C5S2|29.20|29.20.jpg?3;C5S2|29.10|29.10.jpg?3;C5S2|29.01|29.01.jpg?3;C5S2|29.00|29.00.jpg?3;C5S1|28.30|28.30.jpg?3;C5S1|28.20|28.20.jpg?3;C5S1|28.10|28.10.jpg?3;C5S1|28.01|28.01.jpg?3;C5S1|28.00|28.00.jpg?3;C4SOG|27.11|27.11.jpg?3;C4SOG|27.10|27.10.jpg?3;C4SOG|27.00 stage 2|27.00-stage-2.jpg?3;C4SOG|27.00|27.00.jpg?3;C4S4|26.30|26.30.jpg?3;C4S4|26.20|26.20.jpg?3;C4S4|26.10|26.10.jpg?3;C4S4|26.00|26.00.jpg?3;C4S3|25.30|25.30.jpg?3;C4S3|25.20|25.20.jpg?3;C4S3|25.11|25.11.jpg?3;C4S3|25.10|25.10.jpg?3;C4S3|25.00|25.00.jpg?3;C4S2|24.40|24.40.jpg?3;C4S2|24.30|24.30.jpg?3;C4S2|24.20|24.20.jpg?3;C4S2|24.10|24.10.jpg?3;C4S2|24.01|24.01.jpg?3;C4S2|24.00|24.00.jpg?3;C4S1|23.50|23.50.jpg?3;C4S1|23.40|23.40.jpg?3;C4S1|23.30|23.30.jpg?3;C4S1|23.20|23.20.jpg?3;C4S1|23.10|23.10.jpg?3;C4S1|23.00|23.00.jpg?3;C3S4|22.40|22.40.jpg?3;C3S4|22.30|22.30.jpg?3;C3S4|22.20|22.20.jpg?3;C3S4|22.10|22.10.jpg?3;C3S4|22.00|22.00.jpg?3;C3S3|21.51|21.51.jpg?3;C3S3|21.50|21.50.jpg?3;C3S3|21.40|21.40.jpg?3;C3S3|21.30|21.30.jpg?3;C3S3|21.20|21.20.jpg?3;C3S3|21.10|21.10.jpg?3;C3S3|21.00|21.00.jpg?3;C3S2|20.40|20.40.jpg?3;C3S2|20.30|20.30.jpg?3;C3S2|20.20|20.20.jpg?3;C3S2|20.10|20.10.jpg?3;C3S2|20.00|20.00.jpg?3;C3S1|19.40|19.40.jpg?3;C3S1|19.30|19.30.jpg?3;C3S1|19.20|19.20.jpg?3;C3S1|19.10|19.10.jpg?3;C3S1|19.01|19.01.jpg?3;C3S1|19.00|19.00.jpg?3;C2S8|18.40|18.40.jpg?3;C2S8|18.30|18.30.jpg?3;C2S8|18.21|18.21.jpg?3;C2S8|18.20|18.20.jpg?3;C2S8|18.10|18.10.jpg?3;C2S8|18.00|18.00.jpg?3;C2S7|17.50|17.50.jpg?3;C2S7|17.40|17.40.jpg?3;C2S7|17.30|17.30.jpg?3;C2S7|17.21|17.21.jpg?3;C2S7|17.20|17.20.jpg?3;C2S7|17.10|17.10.jpg?3;C2S7|17.00|17.00.jpg?3;C2S6|16.50|16.50.jpg?3;C2S6|16.40|16.40.jpg?3;C2S6|16.30|16.30.jpg?3;C2S6|16.20|16.20.jpg?3;C2S6|16.10|16.10.jpg?3;C2S6|16.00|16.00.jpg?3;C2S5|15.40|15.40.jpg?3;C2S5|15.30|15.30.jpg?3;C2S5|15.21|15.21.jpg?3;C2S5|15.20|15.20.jpg?3;C2S5|15.10 snow 2|15.10-snow-2.jpg?3;C2S5|15.10 snow|15.10-snow.jpg?3;C2S5|15.10|15.10.jpg?3;C2S5|15.00|15.00.jpg?3;C2S4|14.40|14.40.jpg?3;C2S4|14.20|14.20.jpg?3;C2S4|14.10|14.10.jpg?3;C2S4|14.00|14.00.jpg?3;C2S3|13.30|13.30.jpg?3;C2S3|13.30 water lvl 1|13.30-(water-lvl-1).jpg?3;C2S3|13.30 water lvl 2|13.30-(water-lvl-2).jpg?3;C2S3|13.30 water lvl 3|13.30-(water-lvl-3).jpg?3;C2S3|13.20 water lvl 4|13.20-(water-lvl-4).jpg?3;C2S3|13.20 water lvl 5|13.20-(water-lvl-5).jpg?3;C2S3|13.20 water lvl 6|13.20-(water-lvl-6).jpg?3;C2S3|13.20 water lvl 7|13.20-(water-lvl-7).jpg?3;C2S3|13.00|13.00.jpg?3;C2S2|12.60|12.60.jpg?3;C2S2|12.50|12.50.jpg?3;C2S2|12.20|12.20.jpg?3;C2S2|12.00|12.00.jpg?3;C2S1|11.40|11.40.jpg?3;C2S1|11.31|11.31.jpg?3;C2S1|11.30|11.30.jpg?3;C2S1|11.10|11.10.jpg?3;C2S1|11.00|11.00.jpg?3;C1SX|10.40|10.40.jpg?3;C1SX|10.31|10.31.jpg?3;C1SX|10.30|10.30.jpg?3;C1SX|10.20|10.20.webp;C1SX|10.10|10.10.jpg?3;C1SX|10.0|10.0.jpg?3;C1S9|9.41|9.41.jpg?3;C1S9|9.40|9.40.jpg?3;C1S9|9.30|9.30.jpg?3;C1S9|9.20|9.20.jpg?3;C1S9|9.10|9.10.jpg?3;C1S9|9.00|9.00.jpg?3;C1S8|8.50|8.50.jpg?3;C1S8|8.40|8.40.jpg?3;C1S8|8.30|8.30.jpg?3;C1S8|8.20|8.20.jpg?3;C1S8|8.10|8.10.jpg?3;C1S8|8.00|8.00.jpg?3;C1S7|7.40|7.40.jpg?3;C1S7|7.30|7.30.jpg?3;C1S7|7.20|7.20.jpg?3;C1S7|7.10 snow|7.10-snow.jpg?3;C1S7|7.10|7.10.jpg?3;C1S7|7.01|7.01.jpg?3;C1S7|7.00|7.00.jpg?3;C1S6|6.30|6.30.jpg?3;C1S6|6.22|6.22.jpg?3;C1S6|6.21|6.21.jpg?3;C1S6|6.20|6.20.jpg?3;C1S6|6.10|6.10.jpg?3;C1S6|6.0|6.0.jpg?3;C1S5|5.40|5.40.jpg?3;C1S5|5.30|5.30.jpg?3;C1S5|5.20|5.20.jpg?3;C1S5|5.10|5.10.jpg?3;C1S5|5.0|5.0.jpg?3;C1S4|4.5|4.5.jpg?3;C1S4|4.4|4.4.jpg?3;C1S4|4.3|4.3.jpg?3;C1S4|4.2|4.2.jpg?3;C1S4|4.1|4.1.jpg?3;C1S4|4.0|4.0.jpg?3;C1S3|3.6|3.6.0.jpg?3;C1S3|3.5|3.5.0.jpg?3;C1S3|3.4|3.4.0.jpg?3;C1S3|3.3|3.3.0.jpg?3;C1S3|3.2|3.2.0.jpg?3;C1S3|3.1|3.1.0.jpg?3;C1S3|3.0|3.0.jpg?3;C1S2|2.5|2.5.0.jpg?3;C1S2|2.4.2|2.4.2.jpg?3;C1S2|2.4|2.4.0.jpg?3;C1S2|2.3|2.3.0.jpg?3;C1S2|2.2|2.2.0.jpg?3;C1S2|2.1|2.1.0.jpg?3;C1S1|1.11|1.11.jpg?3;C1S1|1.9|1.9.0.jpg?3;C1S1|1.8|1.8.0.jpg?3;C1S1|1.7|1.7.1.jpg?3;C1S1|1.6|1.6.0.jpg?3';

/** "S4" -> "Season 4", "SMS2" -> "Mini Season 2", "SREMIX" -> "Remix", "SOG" -> "OG", "SX" -> "Season X". */
function saisonName(s: string): string {
  if (/^S\d+$/.test(s)) return `Season ${s.slice(1)}`;
  const mini = /^SMS(\d+)$/.exec(s);
  if (mini) return `Mini Season ${mini[1]}`;
  if (s === 'SREMIX') return 'Remix';
  if (s === 'SOG') return 'OG';
  if (s === 'SX') return 'Season X';
  return s;
}

const aus = (() => {
  const gesehen = new Set<string>();
  const liste: KartenUpdate[] = [];
  for (const zeile of STAND.split(';')) {
    const [code, patch, img] = zeile.split('|');
    const m = /^C(\d+)(S.+)$/.exec(code);
    if (!m || gesehen.has(img)) continue;
    gesehen.add(img);
    liste.push({ patch, kapitel: Number(m[1]), saison: saisonName(m[2]), img });
  }
  return liste;
})();

/** Die Liste von fortnite.gg, wie sie im Werkzeug steht. */
export const kartenUpdatesStand = (): KartenUpdate[] => aus;

/** Die Adresse des Bildes bei fortnite.gg. */
export const kartenUpdateBild = (img: string): string => `${BILD_ORT}${encodeURI(img).replace(/\(/g, '%28').replace(/\)/g, '%29')}`;

/** Die Liste samt dem, was der taegliche Abgleich neu gefunden hat (das steht vorn). */
export async function alleKartenUpdates(): Promise<KartenUpdate[]> {
  const neu = await liesJson<KartenUpdate[]>(NEU_DATEI, []);
  const bekannt = new Set(aus.map((u) => u.img));
  return [...neu.filter((u) => !bekannt.has(u.img)).map((u) => ({ ...u, neu: true })), ...aus];
}

/** Gehoert diese Adresse zu einem Update der Liste? Nur solche darf der Admin als Kartenbild setzen. */
export async function istKartenUpdateBild(url: string): Promise<boolean> {
  if (!url.startsWith(BILD_ORT)) return false;
  const alle = await alleKartenUpdates();
  return alle.some((u) => kartenUpdateBild(u.img) === url);
}

const nummer = (patch: string): [number, number] | null => {
  const m = /^(\d+)\.(\d+)/.exec(patch);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

async function gibtEs(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    return r.ok && /^image\//.test(r.headers.get('content-type') ?? '');
  } catch { return false; }
}

/**
 * Nachsehen, ob es neue Kartenversionen gibt.
 *
 * Von der neuesten bekannten Version aus: dieselbe Hauptversion mit hoeheren Unterversionen (42.40, 42.50 ...) und die naechste (43.00, 43.01,
 * 43.10 ...). Gefundene kommen mit Datum in karten-updates-neu.json; ihre Saison ist offen (kapitel 0), bis der Admin sie zuordnet - der Name
 * des Updates reicht ihm, um sie zu waehlen. Gibt zurueck, was NEU dazukam (nicht, was schon bekannt war).
 */
export async function sucheNeueKarten(): Promise<{ neu: KartenUpdate[]; geprueft: number; neueste: string }> {
  const alle = await alleKartenUpdates();
  let top: [number, number] = [0, 0];
  for (const u of alle) { const n = nummer(u.patch); if (n && (n[0] > top[0] || (n[0] === top[0] && n[1] > top[1]))) top = n; }
  const bekannt = new Set(alle.map((u) => u.patch));
  const kandidaten: string[] = [];
  for (const haupt of [top[0], top[0] + 1]) {
    for (const unter of ['00', '01', '02', '10', '11', '12', '20', '21', '30', '31', '40', '41', '50', '51', '60']) {
      const n = nummer(`${haupt}.${unter}`)!;
      if (n[0] === top[0] && n[1] <= top[1]) continue;
      if (!bekannt.has(`${haupt}.${unter}`)) kandidaten.push(`${haupt}.${unter}`);
    }
  }
  const gefunden: KartenUpdate[] = [];
  const heute = new Date().toISOString().slice(0, 10);
  // Sechs gleichzeitig - zwei Dateiformate je Name.
  for (let i = 0; i < kandidaten.length; i += 6) {
    const stapel = kandidaten.slice(i, i + 6);
    const antworten = await Promise.all(stapel.map(async (patch) => {
      for (const endung of ['webp', 'jpg']) {
        if (await gibtEs(`${BILD_ORT}${patch}.${endung}`)) return { patch, img: `${patch}.${endung}` };
      }
      return null;
    }));
    for (const a of antworten) if (a) gefunden.push({ patch: a.patch, kapitel: 0, saison: 'Neu gefunden', img: a.img, neu: true, gefunden: heute });
  }
  if (gefunden.length) {
    const vorher = await liesJson<KartenUpdate[]>(NEU_DATEI, []);
    const da = new Set(vorher.map((u) => u.img));
    await schreibJson(NEU_DATEI, [...gefunden.filter((u) => !da.has(u.img)), ...vorher]);
  }
  return { neu: gefunden, geprueft: kandidaten.length, neueste: `${top[0]}.${String(top[1]).padStart(2, '0')}` };
}

/** Suchen und - wenn es etwas Neues gibt - dem Admin in Discord (#admin-alarm) Bescheid geben. */
export async function sucheUndMelde(): Promise<{ neu: KartenUpdate[]; geprueft: number; neueste: string; gemeldet: boolean }> {
  const r = await sucheNeueKarten();
  let gemeldet = false;
  if (r.neu.length) {
    try {
      const { schickeAlarm } = await import('@/lib/discord');
      const zeilen = r.neu.map((u) => `Update ${u.patch}`).join(', ');
      const ok = await schickeAlarm({
        titel: r.neu.length === 1 ? 'Neue Kartenversion bei fortnite.gg' : `${r.neu.length} neue Kartenversionen bei fortnite.gg`,
        text: `${zeilen}\n\nSie stehen jetzt im Kartenwerkzeug unter "Neu gefunden" zur Wahl: auf der Seite eines Cups "Kartenbild waehlen", oder in der Verwaltung der alten Maps fuer eine ganze Saison.`,
      });
      gemeldet = ok.ok;
    } catch { /* ohne Discord bleibt der Fund trotzdem gespeichert */ }
  }
  return { ...r, gemeldet };
}
