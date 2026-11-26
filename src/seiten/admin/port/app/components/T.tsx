import { useT } from './SprachProvider';

/* Ein Stueck uebersetzter Text (wie app/components/T auf main) - der Hub spricht immer Englisch. */
export default function T({ children }: { children: string }) {
  const t = useT();
  return <>{t(children)}</>;
}
