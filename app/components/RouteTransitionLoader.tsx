'use client';

import LadeSchirm from '@/app/components/LadeSchirm';

// Der Ladebildschirm zwischen zwei Seiten - derselbe Schirm wie ueberall
// sonst (siehe LadeSchirm). Der Betreiber wollte einen Anblick fuer alles:
// mittig, ueber der ganzen Seite, nicht ein Kasten unten.
export default function RouteTransitionLoader() {
  return <LadeSchirm />;
}
