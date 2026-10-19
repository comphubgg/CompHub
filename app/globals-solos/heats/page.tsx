import { redirect } from 'next/navigation';

/** Die Seite gibt es nicht mehr einzeln - alles steht im Reiter "heats" von /globals-solos. */
export default function Weiter() {
  redirect('/globals-solos?tab=heats');
}
