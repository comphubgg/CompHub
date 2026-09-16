'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

/*
 * Der Ladeschirm - ueber der ganzen Seite, mittig, ueberall derselbe.
 *
 * Der Betreiber hat ihn auf der Statistikseite gesehen und wollte ihn so
 * ueberall: "Ueberall, wenn ich auf eine neue Page komme, soll das so
 * aussehen." Ein Kreis, der sich dreht, der Text darunter, die Seite
 * dahinter leicht abgedunkelt. Kein Kasten unten rechts, kein blosses
 * "Loading" in der Ecke.
 *
 * Er liegt ueber dem Inhalt, nicht anstelle des Inhalts: was schon steht,
 * scheint durch, und was fehlt, kommt darunter dazu.
 */
/*
 * Erst nach einer knappen halben Sekunde sichtbar.
 *
 * Der Betreiber: "die Ladeanimation muss nicht jedes Mal kommen, wenn ich
 * zwischen Sachen wechsle, sondern nur, wenn es etwas herunterlaedt." Ein
 * Wechsel, der in 400 Millisekunden fertig ist, zeigt deshalb gar nichts
 * mehr; nur was wirklich wartet, bekommt den Schirm.
 */
export default function LadeSchirm({ text }: { text?: string }) {
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => {
    const zeiger = setTimeout(() => setSichtbar(true), 400);
    return () => clearTimeout(zeiger);
  }, []);
  if (!sichtbar) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center
                    bg-zinc-950/70 backdrop-blur-[2px]" aria-live="polite" aria-busy="true">
      <span className="h-12 w-12 animate-spin rounded-full border-[3px]
                       border-zinc-800 border-t-sky-500" />
      <span className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
        {text ?? <T>Wird geladen …</T>}
      </span>
    </div>
  );
}
