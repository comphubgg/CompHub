import FehlerSeite from '@/app/components/FehlerSeite';

// 403: Next zeigt das, wenn eine Seite forbidden() ruft (next.config: experimental.authInterrupts).
export default function Verboten() {
  return <FehlerSeite code={403} />;
}
