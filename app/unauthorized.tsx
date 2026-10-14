import FehlerSeite from '@/app/components/FehlerSeite';

// 401: Next zeigt das, wenn eine Seite unauthorized() ruft (next.config: experimental.authInterrupts).
export default function NichtAngemeldet() {
  return <FehlerSeite code={401} />;
}
