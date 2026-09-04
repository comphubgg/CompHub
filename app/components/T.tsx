'use client';

// Ein Stueck uebersetzter Text.
//
// Statt in jeder Komponente einen Haken zu setzen, wird der Text hier
// eingewickelt. Das ist bei ueber vierhundert Textstellen der Unterschied
// zwischen einer Zeile und einem Umbau.
//
// Wichtig ist dabei, dass dieses Stueck selbst die Sprache liest: Wenn die
// Umschaltung nur ganz oben im Baum haengt, zeichnen sich die Seiten
// darunter nicht neu, weil React dieselben Kindelemente wiederverwendet.
// Weil jedes Stueck ein eigener Leser ist, wechselt jede Zeile fuer sich -
// und zwar sofort.

import { useSprache } from './SprachProvider';

export default function T({ children }: { children: string }) {
  const { t } = useSprache();
  return <>{t(children)}</>;
}
