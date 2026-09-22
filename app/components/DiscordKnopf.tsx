'use client';
/*
 * "Join our Discord" - ein Knopf mit der Einladung zum Server.
 *
 * Der Betreiber: "auf der Homepage und so soll jetzt auch ein Button sein
 * ... Join our Discord." Die Einladung kommt von /api/discord/einladung
 * (ein dauerhafter Link, den der Bot einmal anlegt - oder die Adresse aus
 * DISCORD_EINLADUNG). Gibt es keine, gibt es auch keinen Knopf: eine Tuer
 * ins Leere waere schlimmer als keine.
 */
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { MARKE } from '@/lib/marke';

let gemerkt: string | undefined;

/**
 * Die Einladung - sofort die feste aus lib/marke, danach die des Servers,
 * falls er eine andere nennt.
 *
 * Frueher gab es den Knopf erst, wenn die Antwort da war, und gar nicht,
 * wenn sie leer kam. Am 22.9.2026 kam sie leer, weil die Ablage gesperrt
 * war - und die Startseite hatte keinen Discord mehr. Der Betreiber: "wo
 * ist das mit discord????????" Die Tuer steht jetzt immer.
 */
export function useDiscordEinladung(): string {
  const [url, setUrl] = useState<string>(gemerkt ?? MARKE.discord);
  useEffect(() => {
    if (gemerkt !== undefined) return;
    let weg = false;
    fetch('/api/discord/einladung').then((r) => r.json())
      .then((j) => {
        const u = typeof j?.url === 'string' && /^https?:\/\//.test(j.url) ? j.url : MARKE.discord;
        gemerkt = u; if (!weg) setUrl(u);
      })
      .catch(() => { gemerkt = MARKE.discord; });
    return () => { weg = true; };
  }, []);
  return url;
}

const DiscordZeichen = ({ groesse = 16 }: { groesse?: number }) => (
  <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.2 13.6.2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
  </svg>
);

/**
 * Der Knopf. "art" richtet sich nach dem, was daneben steht: gefuellt wie
 * ein Hauptknopf, umrandet wie ein Nebenknopf, oder rund wie die
 * Anfrage-Knoepfe.
 */
export default function DiscordKnopf({ art = 'rand', text = 'Join our Discord', klasse = '' }: {
  art?: 'voll' | 'rand' | 'rund'; text?: string; klasse?: string;
}) {
  const url = useDiscordEinladung();
  const form = art === 'voll'
    ? 'rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#6a75f4]'
    : art === 'rund'
      ? 'rounded-full border border-[#5865F2]/60 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-[#5865F2]/15'
      : 'rounded-xl border border-zinc-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:border-[#5865F2] hover:text-white';
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className={`inline-flex items-center gap-2 transition ${form} ${klasse}`}>
      <DiscordZeichen />
      <T>{text}</T>
    </a>
  );
}
