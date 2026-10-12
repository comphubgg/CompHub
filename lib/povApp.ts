/*
 * Das Windows-Programm "CompHub POV" am Release "pov-app": welche Fassung liegt dort, und wo sind ihre Dateien.
 *
 * Gemeinsam fuer den Download (app/api/pov/app) und die Selbst-Aktualisierung des Programms (app/api/pov/update):
 * das Programm fragt dort alle paar Stunden nach latest.yml und holt sich bei einer neueren Fassung selbst die
 * Installationsdatei - ohne dass jemand etwas laden oder hochladen muss.
 */

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
export const INSTALLER = 'CompHub-POV-Setup.exe';

export interface ProgrammStand {
  version: string;
  assets: Map<string, { url: string; groesse: number }>;
}

let merk: { bis: number; wert: ProgrammStand | null } | null = null;

export async function programmStand(): Promise<ProgrammStand | null> {
  if (merk && merk.bis > Date.now()) return merk.wert;
  let wert: ProgrammStand | null = null;
  try {
    const token = (process.env.GITHUB_TOKEN || process.env.DATEN_TOKEN || '').trim();
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/pov-app`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const j = await r.json() as { name?: string; assets?: Array<{ name: string; browser_download_url: string; size: number }> };
      const version = String(j.name ?? '').match(/\d+\.\d+\.\d+/)?.[0] ?? '';
      const assets = new Map((j.assets ?? []).map((a) => [a.name, { url: a.browser_download_url, groesse: a.size }] as const));
      if (version && assets.has(INSTALLER)) wert = { version, assets };
    }
  } catch { /* dann keine Auskunft */ }
  merk = { bis: Date.now() + (wert ? 5 * 60_000 : 30_000), wert };
  return wert;
}
