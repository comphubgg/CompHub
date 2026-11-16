// Ein .cpuprofile zusammenfassen: Eigenzeit und Gesamtzeit je Funktion (Messlauf, messen-vorrechnen.yml).
const fs = require('fs');
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dt = new Map(); // node id -> ms self
const deltas = p.timeDeltas || []; const samples = p.samples || [];
for (let i = 0; i < samples.length; i++) dt.set(samples[i], (dt.get(samples[i]) || 0) + (deltas[i] || 0) / 1000);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const name = (n) => { const f = n.callFrame; const u = (f.url || '').replace(/^.*\/(\.next|node_modules)\//, '$1/'); return `${f.functionName || '(anon)'} ${u}:${f.lineNumber + 1}:${f.columnNumber + 1}`; };
const self = new Map(); const total = new Map(); let gesamt = 0;
for (const [id, ms] of dt) {
  gesamt += ms; const n = byId.get(id); self.set(name(n), (self.get(name(n)) || 0) + ms);
  const gesehen = new Set(); let cur = id;
  while (cur !== undefined) { const k = name(byId.get(cur)); if (!gesehen.has(k)) { gesehen.add(k); total.set(k, (total.get(k) || 0) + ms); } cur = parent.get(cur); }
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)}s ${(100 * v / gesamt).toFixed(1).padStart(5)}%  ${k.slice(0, 220)}`).join('\n');
console.log(`Gesamt ${(gesamt / 1000).toFixed(1)} s`);
console.log('--- Eigenzeit'); console.log(top(self, 25));
console.log('--- Gesamtzeit'); console.log(top(total, 45));
