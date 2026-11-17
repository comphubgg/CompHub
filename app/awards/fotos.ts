import { fotoFuerKonto, fotoStand } from '@/lib/aktuelleFotos';
import type { Awards } from '@/lib/awards';

/** Fuer Spieler mit Epic-Id das Foto, das unser Pool JETZT fuer dieses Konto fuehrt (lib/aktuelleFotos) - sonst das gespeicherte. */
export async function mitAktuellenFotos(a: Awards): Promise<Awards> {
  let stand: Awaited<ReturnType<typeof fotoStand>> | null = null;
  try { stand = await fotoStand(); } catch { /* dann die gespeicherten */ }
  if (!stand) return a;
  const s = stand;
  return {
    ...a,
    kategorien: a.kategorien.map((k) => ({
      ...k,
      nominierte: k.nominierte.map((n) => (n.art === 'spieler' && n.epicId ? { ...n, bild: fotoFuerKonto(s, n.epicId, true) ?? n.bild ?? null } : n)),
    })),
  };
}
