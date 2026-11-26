import { useEffect, useState } from 'react';
import { Laedt, VIOLETT } from '../../community/Teile';

/* Der Ladeschirm (main: app/components/LadeSchirm) - im Hub der Ladepunkt im Bereichston, erst nach 400 ms (kurze Wechsel zeigen nichts). */
export default function LadeSchirm({ text }: { text?: string }) {
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => { const z = setTimeout(() => setSichtbar(true), 400); return () => clearTimeout(z); }, []);
  return sichtbar ? <Laedt farbe={VIOLETT} text={text ?? 'Loading …'} /> : null;
}
