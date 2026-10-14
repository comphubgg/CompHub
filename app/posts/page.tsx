import { redirect } from 'next/navigation';
import { heuteDatum } from '@/lib/tagesposts';

// /posts -> die Seite von heute (Betreiber, 14.10.2026: "thecomphub.com/<Datum>/posts" - hier unter /posts/<Datum>).
export const dynamic = 'force-dynamic';
export default function Heute() {
  redirect(`/posts/${heuteDatum()}`);
}
