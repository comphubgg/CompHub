// Diagnose-Preload (nur Messlauf): Lesezeit/Bytes je Ordner, JSON.parse, fetch je Host, Auslastung der Ereignisschleife.
const fs = require('fs');
const { performance } = require('perf_hooks');
const st = { lesen: {}, parse: { n: 0, ms: 0, mb: 0 }, netz: {} };
const ordner = (p) => { const s = String(p); const i = s.indexOf('/data/'); if (i < 0) return 'sonst'; const t = s.slice(i + 6).split('/'); return t.length > 1 ? t[0] : '(wurzel)'; };
const add = (k, ms, b) => { const x = (st.lesen[k] ??= { n: 0, ms: 0, mb: 0 }); x.n++; x.ms += ms; x.mb += b / 1e6; };
const orig = fs.promises.readFile;
fs.promises.readFile = async function (p, ...r) { const t = performance.now(); const v = await orig.call(this, p, ...r); add(ordner(p), performance.now() - t, v?.length ?? 0); return v; };
const origS = fs.readFileSync;
fs.readFileSync = function (p, ...r) { const t = performance.now(); const v = origS.call(this, p, ...r); add('sync:' + ordner(p), performance.now() - t, v?.length ?? 0); return v; };
const jp = JSON.parse;
JSON.parse = function (s, ...r) { const t = performance.now(); const v = jp.call(this, s, ...r); const d = performance.now() - t; if (s && s.length > 1e5) { st.parse.n++; st.parse.ms += d; st.parse.mb += s.length / 1e6; } return v; };
if (globalThis.fetch) { const f = globalThis.fetch; globalThis.fetch = async function (u, ...r) { let h = 'x'; try { h = new URL(typeof u === 'string' ? u : u.url ?? String(u)).host; } catch {} const t = performance.now(); try { return await f.call(this, u, ...r); } finally { const x = (st.netz[h] ??= { n: 0, ms: 0 }); x.n++; x.ms += performance.now() - t; } }; }
let elu = performance.eventLoopUtilization();
const r1 = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b)]))]));
setInterval(() => { const e = performance.eventLoopUtilization(elu); elu = performance.eventLoopUtilization(); process.stderr.write(`[MESS] ${new Date().toISOString().slice(11, 19)} pid=${process.pid} elu=${e.utilization.toFixed(2)} heap=${Math.round(process.memoryUsage().heapUsed / 1e6)}MB lesen=${JSON.stringify(r1(st.lesen))} parse=${JSON.stringify(r1({ p: st.parse }))} netz=${JSON.stringify(r1(st.netz))}\n`); }, 30000).unref();
