'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadUserStorageValue, saveUserStorageValue } from '@/app/lib/userStorage';

/*
 * Lieblingsspieler: wie die Favoriten bei den Streams nur im Browser gemerkt (localStorage, je Konto-Name getrennt,
 * siehe userStorage). Es gibt dafuer keine Schnittstelle am Server - also auch hier nicht.
 * Gespeichert wird zum Zeitpunkt des Sterns auch Name und Foto, damit die Reihe ohne Nachladen aufgebaut wird.
 */
export interface Liebling { epicId: string; name: string; bild: string | null }

const SCHLUESSEL = 'comphub_lieblingsspieler';
const EREIGNIS = 'comphub:lieblinge';

function lesen(): Liebling[] {
  const roh = loadUserStorageValue<unknown>(SCHLUESSEL);
  if (!Array.isArray(roh)) return [];
  return roh.filter((x): x is Liebling => !!x && typeof x.epicId === 'string' && typeof x.name === 'string')
    .map((x) => ({ epicId: x.epicId, name: x.name, bild: typeof x.bild === 'string' && x.bild ? x.bild : null }));
}

export function useLieblinge() {
  const [liste, setListe] = useState<Liebling[]>([]);

  useEffect(() => {
    const neu = () => { try { setListe(lesen()); } catch { setListe([]); } };
    neu();
    window.addEventListener(EREIGNIS, neu);
    window.addEventListener('storage', neu);
    return () => { window.removeEventListener(EREIGNIS, neu); window.removeEventListener('storage', neu); };
  }, []);

  const umschalten = useCallback((p: Liebling) => {
    try {
      const jetzt = lesen();
      const neu = jetzt.some((x) => x.epicId === p.epicId)
        ? jetzt.filter((x) => x.epicId !== p.epicId)
        : [...jetzt, { epicId: p.epicId, name: p.name, bild: p.bild || null }];
      saveUserStorageValue(SCHLUESSEL, neu);
      window.dispatchEvent(new Event(EREIGNIS));
    } catch { /* ohne Speicher bleibt alles wie es ist */ }
  }, []);

  return { liste, umschalten, istLiebling: (id: string) => liste.some((x) => x.epicId === id) };
}
