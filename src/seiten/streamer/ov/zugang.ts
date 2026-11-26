import { useEffect, useState } from 'react';
import { useWer } from '../../../teile/Anmeldung';

/*
 * Wer darf was - dieselbe Auskunft wie useZugang auf main (app/lib/zugang): /api/konto (CompHub-Konto) und /api/auth/verify (Zugangsschluessel),
 * daraus Gast, Nutzer, VIP, Manager, Pro, Admin und die angehakten Rechte. Neu geholt, sobald sich im Hub jemand an- oder abmeldet (useWer),
 * und alle zwei Minuten.
 */
type Rolle = 'admin' | 'manager' | 'pro' | null;
export interface Zugang {
  laedt: boolean; gast: boolean; nutzer: boolean; vip: boolean; admin: boolean; manager: boolean; pro: boolean;
  rechte: string[]; verwaltet: string; org: string; name: string; epicId: string;
  darfBereich: (b: string) => boolean;
}
const ANFANG: Zugang = { laedt: true, gast: true, nutzer: false, vip: false, admin: false, manager: false, pro: false, rechte: [], verwaltet: '', org: '', name: '', epicId: '', darfBereich: () => false };

// Viele Teile fragen gleichzeitig - eine Anfrage fuer alle, 5 s lang geteilt (main: geteilterAbruf).
let geteilt: { t: number; p: Promise<Zugang> } | null = null;
function holen(frisch = false): Promise<Zugang> {
  if (!frisch && geteilt && Date.now() - geteilt.t < 5_000) return geteilt.p;
  geteilt = { t: Date.now(), p: holenEcht() };
  return geteilt.p;
}

async function holenEcht(): Promise<Zugang> {
  let kontoName = ''; let vipName = ''; let rolle: Rolle = null; let rechte: string[] = [];
  let vipKonto = false; let epicId = ''; let verwaltet = ''; let org = ''; let vipOhneRecht = false;
  try {
    const j = await (await fetch('/api/konto', { cache: 'no-store' })).json() as { angemeldet?: boolean; gastEpicId?: string; konto?: { name?: string; rolle?: Rolle; rechte?: string[]; vip?: boolean; epicId?: string | null; org?: string | null } };
    if (j?.angemeldet) {
      kontoName = String(j.konto?.name ?? ''); rolle = j.konto?.rolle ?? null;
      rechte = Array.isArray(j.konto?.rechte) ? j.konto!.rechte! : []; vipKonto = Boolean(j.konto?.vip);
      org = String(j.konto?.org ?? ''); epicId = String(j.konto?.epicId ?? '').replace(/-/g, '').toLowerCase();
    } else if (j?.gastEpicId) epicId = String(j.gastEpicId).toLowerCase();
  } catch { /* ohne Auskunft: kein Konto */ }
  try {
    const r = await fetch('/api/auth/verify', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json() as { authorized?: boolean; user?: string; rolle?: Rolle; rechte?: string[]; vip?: boolean; verwaltet?: string };
      if (j?.authorized && j?.user) {
        vipName = String(j.user);
        if (!rolle && j.rolle) rolle = j.rolle;
        if (!rechte.length && Array.isArray(j.rechte)) rechte = j.rechte;
        if (j.vip === false) vipOhneRecht = true;
        if (j.verwaltet) verwaltet = String(j.verwaltet);
      }
    }
  } catch { /* ohne Auskunft: kein VIP */ }
  const nutzer = Boolean(kontoName) || Boolean(vipName);
  const admin = rolle === 'admin' || vipName.toLowerCase() === 'admin-juanito';
  // Die Stufen liegen uebereinander: wer ueber VIP steht (Admin, Manager, Pro, Org), ist immer auch VIP.
  const ueberVip = admin || rolle === 'manager' || rolle === 'pro' || Boolean(org);
  const vip = ueberVip || (Boolean(vipName) && !vipOhneRecht) || vipKonto;
  return {
    laedt: false, gast: !nutzer, nutzer, vip, admin, manager: rolle === 'manager', pro: rolle === 'pro',
    rechte, verwaltet, org, name: kontoName || vipName, epicId,
    darfBereich: (b) => admin || (rolle === 'manager' && rechte.includes(b)),
  };
}

export function useZugang(): Zugang {
  const { wer } = useWer();
  const [z, setZ] = useState<Zugang>(ANFANG);
  const schluessel = `${wer?.userName ?? ''}|${wer?.isAdmin ? 1 : 0}|${(wer?.rechte ?? []).join(',')}`;
  useEffect(() => {
    let weg = false;
    const los = (frisch = false) => { void holen(frisch).then((n) => { if (!weg) setZ(n); }); };
    los(true);
    const i = setInterval(() => { if (!document.hidden) los(); }, 120_000);
    return () => { weg = true; clearInterval(i); };
  }, [schluessel]);
  return z;
}
