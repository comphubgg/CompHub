// Diagnose-Preload (nur Messlauf): Lesezeit/Bytes je Ordner, JSON.parse, fetch je Host, Auslastung der Ereignisschleife.
const fs = require('fs');
const { performance } = require('perf_hooks');
const st = { lesen: {}, parse: { n: 0, ms: 0, mb: 0 }, netz: {} };
const ordner = (p) => { const s = String(p); const i = s.indexOf('/data/'); if (i < 0) return 'sonst'; const t = s.slice(i + 6).split('/'); return t.length > 1 ? t[0] : '(wurzel)'; };
const add = (k, ms, b) => { const x = (st.lesen[k] ??= { n: 0, ms: 0, mb: 0 }); x.n++; x.ms += ms; x.mb += b / 1e6; };
const orig = fs.promises.readFile;
const grossZaehler = new Map();
fs.promises.readFile = async function (p, ...r) { const t = performance.now(); const v = await orig.call(this, p, ...r); add(ordner(p), performance.now() - t, v?.length ?? 0);
  if ((v?.length ?? 0) > 20e6 && process.env.MESSEN_GROSS === '1') { const k = String(p); const n = (grossZaehler.get(k) || 0) + 1; grossZaehler.set(k, n);
    process.stderr.write(`[GROSS] ${new Date().toISOString().slice(11, 19)} ${Math.round(v.length / 1e6)}MB x${n} ${k.slice(k.indexOf('/data/') + 6)}\n${n === 1 && /S42/.test(k) && grossZaehler.size % 50 === 1 ? (new Error('Aufruf').stack || '').split('\n').slice(2, 14).join('\n') + '\n' : ''}`); }
  return v; };
const origS = fs.readFileSync;
fs.readFileSync = function (p, ...r) { const t = performance.now(); const v = origS.call(this, p, ...r); add('sync:' + ordner(p), performance.now() - t, v?.length ?? 0); return v; };
const jp = JSON.parse;
JSON.parse = function (s, ...r) { const t = performance.now(); const v = jp.call(this, s, ...r); const d = performance.now() - t; if (s && s.length > 1e5) { st.parse.n++; st.parse.ms += d; st.parse.mb += s.length / 1e6; } return v; };
if (globalThis.fetch) { const f = globalThis.fetch; globalThis.fetch = async function (u, ...r) { let h = 'x'; try { h = new URL(typeof u === 'string' ? u : u.url ?? String(u)).host; } catch {} const t = performance.now(); try { return await f.call(this, u, ...r); } finally { const x = (st.netz[h] ??= { n: 0, ms: 0 }); x.n++; x.ms += performance.now() - t; } }; }
let elu = performance.eventLoopUtilization();
const r1 = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))]));
setInterval(() => { const e = performance.eventLoopUtilization(elu); elu = performance.eventLoopUtilization(); process.stderr.write(`[MESS] ${new Date().toISOString().slice(11, 19)} pid=${process.pid} elu=${e.utilization.toFixed(2)} heap=${Math.round(process.memoryUsage().heapUsed / 1e6)}MB lesen=${JSON.stringify(r1(st.lesen))} parse=${JSON.stringify(r1({ p: st.parse }))} netz=${JSON.stringify(r1(st.netz))}\n`); }, 30000).unref();
// Auf SIGUSR2 (28.11.2026): voll aufraeumen und den lebenden Heap melden - was nach einer Abfrage wirklich im Speicher bleibt, nicht der Muell davor.
try {
  require('v8').setFlagsFromString('--expose-gc');
  const gc = require('vm').runInNewContext('gc');
  process.on('SIGUSR2', () => {
    const vor = process.memoryUsage().heapUsed;
    gc(); gc();
    const m = process.memoryUsage();
    const raeume = require('v8').getHeapSpaceStatistics().map((r) => `${r.space_name}=${Math.round(r.space_used_size / 1e6)}`).join(' ');
    process.stderr.write(`[HEAP] ${new Date().toISOString().slice(11, 19)} pid=${process.pid} vor=${Math.round(vor / 1e6)}MB lebend=${Math.round(m.heapUsed / 1e6)}MB rss=${Math.round(m.rss / 1e6)}MB extern=${Math.round(m.external / 1e6)}MB ${raeume}\n`);
  });
} catch (e) { process.stderr.write(`[HEAP] nicht moeglich: ${e.message}\n`); }
// Mit MESSEN_HEAPPROFIL=1 (28.11.2026): Stichproben des Heaps ab dem Start; auf SIGUSR2 die lebenden Stichproben nach Aufrufstelle,
// je Stelle mit dem Stueck Quelltext dort (die Chunks sind verkleinert) - wer den Speicher wirklich haelt.
if (process.env.MESSEN_HEAPPROFIL === '1') {
  try {
    const inspector = require('inspector');
    const sitzung = new inspector.Session();
    sitzung.connect();
    sitzung.post('HeapProfiler.startSampling', { samplingInterval: 256 * 1024 });
    const stueck = (url, zeile, spalte) => {
      try {
        const datei = String(url).replace(/^file:\/\//, '');
        const z = fs.readFileSync(datei, 'utf8').split('\n')[zeile] || '';
        return z.slice(Math.max(0, spalte - 60), spalte + 100).replace(/\s+/g, ' ');
      } catch { return ''; }
    };
    process.on('SIGUSR2', () => {
      sitzung.post('HeapProfiler.getSamplingProfile', (fehler, antwort) => {
        if (fehler || !antwort) { process.stderr.write(`[PROFIL] ${fehler && fehler.message}\n`); return; }
        const je = new Map();
        const geh = (knoten, pfad) => {
          const f = knoten.callFrame;
          const hier = f.functionName || f.url ? [...pfad, f] : pfad;
          if (knoten.selfSize > 0) {
            // Die vier innersten Rahmen mit Datei - JSON.parse und Co. haben keine.
            const mit = hier.filter((x) => x.url).slice(-4);
            const k = mit.map((x) => `${x.functionName || '(anonym)'}@${String(x.url).split('/').slice(-1)[0]}:${x.lineNumber + 1}:${x.columnNumber}`).join(' <- ') + ` [${f.functionName || '?'}]`;
            const e = je.get(k) || { groesse: 0, rahmen: mit };
            e.groesse += knoten.selfSize;
            je.set(k, e);
          }
          for (const c of knoten.children || []) geh(c, hier);
        };
        geh(antwort.profile.head, []);
        const liste = [...je.entries()].sort((a, b) => b[1].groesse - a[1].groesse).slice(0, 25);
        const summe = [...je.values()].reduce((s, x) => s + x.groesse, 0);
        process.stderr.write(`[PROFIL] lebend gesamt ${Math.round(summe / 1e6)} MB\n`);
        for (const [k, e] of liste) {
          process.stderr.write(`[PROFIL] ${Math.round(e.groesse / 1e6)} MB  ${k}\n`);
          for (const x of e.rahmen.slice(-2)) if (/\.next\//.test(String(x.url))) process.stderr.write(`[PROFIL]      ${String(x.url).split('/').slice(-1)[0]}:${x.columnNumber}: ${stueck(x.url, x.lineNumber, x.columnNumber)}\n`);
        }
      });
    });
  } catch (e) { process.stderr.write(`[PROFIL] nicht moeglich: ${e.message}\n`); }
}
