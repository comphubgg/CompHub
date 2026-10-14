import FehlerSeite from '@/app/components/FehlerSeite';

// 404: eine Adresse, die es nicht gibt - die eigene Fehlerseite statt der schwarzen Standardseite von Next.
export default function NichtGefunden() {
  return <FehlerSeite code={404} />;
}
