'use client';

import { useEffect } from 'react';
import { wendeDashAn } from '@/app/lib/dashAnsicht';

/** Setzt beim Laden die Dashboard-Einstellungen dieses Browsers als Attribute an <html> (siehe app/lib/dashAnsicht). Zeichnet selbst nichts. */
export default function DashAnsicht() {
  useEffect(() => { wendeDashAn(); }, []);
  return null;
}
