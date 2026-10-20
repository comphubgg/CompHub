import { alleKonten } from '@/lib/konten';
import { liesOrgs } from '@/lib/orgs';
import { leererPro, liesPros, standardBild, type PovHud, type PovPro, type PovQualitaet } from '@/lib/pov';
import { istLive, liveSeit, zuschauerZahl } from '@/lib/povRelay';

/*
 * Die POVs einer Organisation (Betreiber, 20.10.2026): "die Orgs sollen vor allem ihre eigenen POVs haben - auch fuer die, die nicht streamen - und das einstellen koennen".
 *
 * Ein POV gehoert weiter dem Pro-Konto des Spielers (lib/pov: Kennung "k:<Konto>"); er sendet wie bisher - im Browser unter /pov, mit dem Windows-Programm oder, wenn er in einem
 * Discord-Sprachkanal streamt, automatisch. Neu ist, wer es EINSTELLEN darf: das Konto der Org. Es sieht alle Pro-Konten seines Kaders (verknuepftes Epic-Konto im Kader
 * oder dem Konto von Admin zugeordnete Org), ob sie gerade senden, und stellt je Spieler ein, welche VIPs es sehen duerfen, die Qualitaet und das Namensbanner. Mehr nicht:
 * Bild, Discord-Konto und Server bleiben dem Spieler.
 */

export interface OrgKanal {
  ident: string;
  /** Der Name im Kader (oder der des Kontos). */
  spieler: string;
  /** Der Name des Pro-Kontos. */
  konto: string;
  bild: string | null;
  live: boolean;
  liveSeit: number | null;
  zuschauer: number;
  qualitaet: PovQualitaet;
  hud: PovHud;
  erlaubt: string[];
}

export interface OrgPovStand {
  kanaele: OrgKanal[];
  /** Spieler des Kaders, zu denen es noch kein Pro-Konto gibt - sie koennen noch nicht senden. */
  ohneKonto: Array<{ name: string; hatKonto: boolean }>;
}

const sauber = (id: string | null | undefined) => String(id ?? '').replace(/-/g, '').toLowerCase();

/** Welche Pro-Konten gehoeren zu dieser Org - und die Kader-Spieler, die keines haben. */
export async function orgKonten(orgId: string): Promise<{ konten: Array<{ id: string; name: string; spieler: string }>; ohne: Array<{ name: string; hatKonto: boolean }> }> {
  const org = (await liesOrgs()).find((o) => o.id === orgId);
  const alle = await alleKonten();
  const konten: Array<{ id: string; name: string; spieler: string }> = [];
  const belegt = new Set<string>();
  const ohne: Array<{ name: string; hatKonto: boolean }> = [];
  for (const s of org?.spieler ?? []) {
    const k = s.epicId ? alle.find((x) => sauber(x.epicId) === sauber(s.epicId) && !x.gesperrt) : undefined;
    if (k && k.rolle === 'pro') { konten.push({ id: k.id, name: k.name, spieler: s.name }); belegt.add(k.id); }
    else if (s.rolle !== 'creator') ohne.push({ name: s.name, hatKonto: Boolean(k) });
  }
  // Konten, die der Admin der Org zugeordnet hat, auch wenn der Spieler nicht im Kader steht.
  for (const k of alle) if (k.org === orgId && k.rolle === 'pro' && !k.gesperrt && !belegt.has(k.id)) konten.push({ id: k.id, name: k.name, spieler: k.name });
  return { konten, ohne };
}

export async function orgPovStand(orgId: string): Promise<OrgPovStand> {
  const { konten, ohne } = await orgKonten(orgId);
  const pros = await liesPros();
  const kanaele: OrgKanal[] = [];
  for (const k of konten) {
    const ident = `k:${k.id}`;
    const p: PovPro = pros[ident] ?? leererPro(ident, k.name, null);
    kanaele.push({
      ident, spieler: k.spieler, konto: k.name, bild: p.bild ?? (await standardBild(ident)),
      live: istLive(ident), liveSeit: liveSeit(ident), zuschauer: zuschauerZahl(ident),
      qualitaet: p.qualitaet, hud: p.hud, erlaubt: p.erlaubt,
    });
  }
  return { kanaele, ohneKonto: ohne };
}
