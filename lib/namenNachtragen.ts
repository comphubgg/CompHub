/*
 * Namen fuer Zeilen, die nur eine Konto-Id haben (Betreiber, FNCS Heat 2, 15.11.2026: "der Erste zeigt Zahlen, ich weiss nicht, wer gewonnen hat" -
 * Platz 1 stand als "b830d2ba").
 *
 * Eine gekuerzte Id entsteht, wenn Epic die Namensabfrage gerade drosselt (429) oder ein Konto ohne Anzeigenamen meldet - und sie blieb dann in
 * der Antwort und im Vorrat stehen, obwohl der Name an anderer Stelle bekannt ist. Hier wird der Reihe nach gesucht:
 *   1. die Aufstellung der Heats (heatsPlan, derselbe Zwischenspeicher wie /api/globals-solos),
 *   2. eigene Daten: Spielerprofile, Szene-Liste, Namensverzeichnis (spieler-namen.json),
 *   3. Epics Kontoabfrage (loeseNamenAuf - mit dem Namensvorrat epic-namen.json).
 * Nur was keine Quelle kennt, bleibt als Id stehen.
 */
import { liesJson } from '@/lib/ablage';
import { gecacht, getToken, loeseNamenAuf } from '@/lib/epicCups';
import { profilKarte } from '@/lib/ergebnisPosts';
import { heatsDaten } from '@/lib/heatsPosts';
import { istIdName } from '@/app/lib/rundenStand';

const k = (id: string) => String(id ?? '').trim().toLowerCase();

/** Hoechstens so lange darf eine Quelle die Antwort aufhalten. */
function mitFrist<T>(p: Promise<T>, ms: number, sonst: T): Promise<T> {
  return Promise.race([p.catch(() => sonst), new Promise<T>((r) => setTimeout(() => r(sonst), ms))]);
}

/** Eigene Daten (Profile, Epic-Namen, Namensverzeichnis) - eine Minute gemerkt. */
function eigeneNamen(): Promise<Map<string, string>> {
  return gecacht('namen-nachtragen|eigene', 60_000, async () => {
    const karte = new Map<string, string>();
    const [{ profile, ersatz }, verzeichnis] = await Promise.all([
      profilKarte(),
      liesJson<Record<string, { namen?: string[]; haupt?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    ]);
    for (const [id, v] of Object.entries(verzeichnis as Record<string, { namen?: string[]; haupt?: string }>)) {
      const n = v?.haupt || v?.namen?.find((x) => !istIdName(x, id));
      if (n && !istIdName(n, id)) karte.set(k(id), n);
    }
    for (const [id, s] of ersatz) if (s.name && !istIdName(s.name, id) && !karte.has(k(id))) karte.set(k(id), s.name);
    for (const [id, p] of profile) {
      const pr = p as { anzeige?: string; name?: string };
      const n = pr.anzeige || pr.name;
      if (n && !istIdName(n, id)) karte.set(k(id), n);
    }
    return karte;
  });
}

/** Die Namen aus der Aufstellung der Heats einer Region - nur fuer Heat-Fenster. */
async function heatNamen(region: string): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  const plan = await gecacht(`solos|heatsplan|${region}`, 120_000, () => heatsDaten(region, undefined, true));
  for (const d of plan) for (const h of d.heats) for (const s of h.spieler) if (s.name && !istIdName(s.name, s.id)) karte.set(k(s.id), s.name);
  return karte;
}

/**
 * Zu den Konten ohne Namen die Namen suchen. Gibt nur gefundene zurueck (Schluessel klein geschrieben).
 * ids in der Reihenfolge der Wichtigkeit (laufende/juengste Runden zuerst) - bei sehr vielen wird Epic nur nach den ersten gefragt.
 */
export async function namenNachtragen(ids: string[], opt: { region?: string; heat?: boolean } = {}): Promise<Map<string, string>> {
  const raus = new Map<string, string>();
  const offen = () => [...new Set(ids.map(k))].filter((id) => id && !raus.has(id));
  if (!offen().length) return raus;

  if (opt.heat && opt.region) {
    const heat = await mitFrist(heatNamen(opt.region), 2_500, new Map<string, string>());
    for (const id of offen()) { const n = heat.get(id); if (n) raus.set(id, n); }
  }
  if (offen().length) {
    const eigene = await mitFrist(eigeneNamen(), 2_000, new Map<string, string>());
    for (const id of offen()) { const n = eigene.get(id); if (n) raus.set(id, n); }
  }
  const rest = offen().slice(0, 2_000);
  if (rest.length) {
    const epic = await mitFrist((async () => {
      const { token } = await getToken();
      return loeseNamenAuf(rest, token);
    })(), 4_000, {} as Record<string, string>);
    for (const [id, n] of Object.entries(epic)) if (n && !istIdName(n, id)) raus.set(k(id), n);
  }
  return raus;
}
