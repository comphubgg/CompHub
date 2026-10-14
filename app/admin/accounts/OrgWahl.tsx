'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

/*
 * Der Esports-Zugang eines Kontos (Betreiber, 14.10.2026): hier ordnet der Admin ein Konto einer Organisation zu. Das Konto bekommt damit die Seite
 * "Team" (/org): den Kader dieser einen Org pflegen, Spieler hinzufuegen und entfernen, Fotos zuteilen, die Farbe der Org setzen - und auf den
 * Cup-Seiten den Reiter "<Org> Roster". Mehr als diese eine Org kann es nicht. Zurueck auf "keine" nimmt den Zugang wieder weg.
 */

interface OrgKurz { id: string; name: string }
let merker: Promise<OrgKurz[]> | null = null;
const orgListe = () => (merker ??= fetch('/api/orgs', { cache: 'no-store' }).then((r) => r.json())
  .then((j) => ((j?.orgs ?? []) as OrgKurz[]).map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)))
  .catch(() => { merker = null; return [] as OrgKurz[]; }));

export default function OrgWahl({ kontoId, org }: { kontoId: string; org: string | null }) {
  const [liste, setListe] = useState<OrgKurz[]>([]);
  const [wert, setWert] = useState(org ?? '');
  const [stand, setStand] = useState<'' | 'speichert' | 'gespeichert' | 'fehler'>('');
  useEffect(() => { let weg = false; void orgListe().then((l) => { if (!weg) setListe(l); }); return () => { weg = true; }; }, []);

  const setzen = async (neu: string) => {
    setWert(neu); setStand('speichert');
    try {
      const r = await fetch('/api/admin/konten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: kontoId, aktion: 'org', org: neu }) });
      setStand(r.ok ? 'gespeichert' : 'fehler');
    } catch { setStand('fehler'); }
  };

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-600"><T>Esports-Team (Organisation)</T></p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={wert} onChange={(e) => void setzen(e.target.value)}
          className="min-w-[14rem] rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
          <option value="">— keine —</option>
          {liste.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {stand === 'speichert' && <span className="text-xs text-slate-500">…</span>}
        {stand === 'gespeichert' && <span className="text-xs font-semibold text-sky-500"><T>gespeichert</T></span>}
        {stand === 'fehler' && <span className="text-xs font-semibold text-rose-400"><T>Nicht gespeichert.</T></span>}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        <T>Das Konto sieht danach die Seite Team und pflegt den Kader dieser Organisation.</T>
      </p>
    </div>
  );
}
