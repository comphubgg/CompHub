/*
 * Den wirklichen Stand einer Datei am GitHub-Release lesen (14.11.2026, fuer clutch/ und clutch-je/: scripts/clutch-zusammen.mjs, scripts/clutch-je-abgleich.mjs).
 *
 * Mit Token (im Ablauf GITHUB_TOKEN) ueber die API: der oeffentliche Download-Link geht ueber GitHubs Zwischenspeicher und lieferte am 25.9.2026 minutenlang
 * einen ersetzten Anhang weiter aus (scripts/ablage-github.mjs). Die Sofort-Ablage ersetzt clutch-je/<w>.json im Abstand weniger Minuten - der naechste Lauf
 * muss die Fassung des vorigen sehen, nicht die davor. Ohne Token (Betreiber-Rechner ohne Zugang) der oeffentliche Link.
 *
 * Kosten mit Token: je Release eine Abfrage, die Anhaenge zu je hundert, das Verzeichnis, dann je Datei eine.
 */
import { tagsFuer } from './releaseTags.mjs';

const warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');

export function releaseLeser({
  repo = process.env.COMPHUB_GITHUB_REPO || process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub',
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
} = {}) {
  async function abruf(url, kopf) {
    let letzter = null;
    for (let v = 0; v < 4; v += 1) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'comphub-ablage', ...kopf }, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
        if (r.status === 404) return null;
        if (r.ok) return r;
        letzter = new Error(`HTTP ${r.status}`);
        if (r.status === 401) break;  // falsches Token: Wiederholen hilft nicht
      } catch (e) { letzter = e; }
      await warte(3000 * (v + 1));
    }
    throw new Error(`${url.replace(/^https:\/\/[^/]+/, '')}: ${letzter?.message}`);
  }
  const api = (pfad, kopf = {}) => abruf(`https://api.github.com${pfad}`, { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...kopf });
  const oeffentlich = (tag, anhang) => abruf(`https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(anhang)}`, {});
  const puffer = async (r) => (r ? Buffer.from(await r.arrayBuffer()) : null);

  let staende = new Map();
  /** Verzeichnis (manifest.json) und - mit Token - die Anhaenge (Name -> { id, size }) eines Releases. */
  async function stand(tag) {
    if (staende.has(tag)) return staende.get(tag);
    let s = null;
    // Nimmt die API das Token nicht an (401, Kontingent leer), bleibt der oeffentliche Link - lieber ein vielleicht kurz veralteter Stand als gar keiner.
    if (token) s = await standApi(tag).catch((e) => { console.log(`  ${tag}: API - ${e.message}, weiter ueber den oeffentlichen Link`); return null; });
    if (!s) {
      const roh = await puffer(await oeffentlich(tag, 'manifest.json'));
      s = { manifest: roh ? JSON.parse(roh.toString('utf8')) : {}, anhaenge: null };
    }
    staende.set(tag, s);
    return s;
  }
  async function standApi(tag) {
    const rel = await api(`/repos/${repo}/releases/tags/${tag}`);
    if (!rel) return { manifest: {}, anhaenge: new Map() };
    const { id } = await rel.json();
    const anhaenge = new Map();
    for (let seite = 1; ; seite += 1) {
      const teil = await (await api(`/repos/${repo}/releases/${id}/assets?per_page=100&page=${seite}`)).json();
      for (const a of teil) anhaenge.set(a.name, a);
      if (teil.length < 100) break;
    }
    const m = anhaenge.get('manifest.json');
    const roh = m ? await puffer(await api(`/repos/${repo}/releases/assets/${m.id}`, { Accept: 'application/octet-stream' })) : null;
    return { manifest: roh ? JSON.parse(roh.toString('utf8')) : {}, anhaenge };
  }

  /** Wo eine Datei liegt: das erste Release der Reihe (lib/releaseTags.mjs), das sie kennt - { tag, anhang, groesse, summe } oder null. */
  async function wo(name) {
    const anhang = anhangName(name);
    for (const tag of tagsFuer(name)) {
      const s = await stand(tag);
      const m = s.manifest[anhang];
      const a = s.anhaenge?.get(anhang);
      // Mit Token zaehlt der Anhang selbst: ein Eintrag ohne Anhang ist keine Datei, ein Anhang ohne Eintrag schon (Groesse aus dem Anhang).
      if (s.anhaenge ? !a : !m) continue;
      return { tag, anhang, ...(m ?? {}), groesse: a?.size ?? m?.groesse };
    }
    return null;
  }

  /** Der Inhalt zu wo(): mit Token ueber die API, sonst ueber den oeffentlichen Link. */
  async function inhalt(stelle) {
    const a = (await stand(stelle.tag)).anhaenge?.get(stelle.anhang);
    if (a) return puffer(await api(`/repos/${repo}/releases/assets/${a.id}`, { Accept: 'application/octet-stream' }));
    return puffer(await oeffentlich(stelle.tag, stelle.anhang));
  }

  /** Eine Datei nach ihrem Ablage-Namen (z. B. "clutch-je/<w>.json") - null, wenn kein Release sie hat. */
  async function datei(name) {
    const stelle = await wo(name);
    return stelle ? inhalt(stelle) : null;
  }

  return { stand, wo, inhalt, datei, mitToken: !!token, vergessen: () => { staende = new Map(); } };
}
