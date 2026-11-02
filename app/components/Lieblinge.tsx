'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import { useLieblinge } from '@/app/lib/lieblinge';

/** "Deine Spieler": die gemerkten Spieler als grosse Fotoquadrate mit Namen darunter. Ohne Lieblinge gar nicht da. */
export default function Lieblinge({ className = '' }: { className?: string }) {
  const { liste } = useLieblinge();
  if (!liste.length) return null;
  return (
    <section className={className}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500"><T>Deine Spieler</T></p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {liste.map((p) => (
          <li key={p.epicId} className="min-w-0">
            <Link href={`/statistics?spieler=${encodeURIComponent(p.epicId)}`} className="group block">
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-zinc-900">
                {p.bild ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.bild} alt="" loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover object-top transition duration-300 group-hover:scale-105" />
                ) : <SpielerPlatzhalter name={p.name} />}
              </span>
              <span className="mt-1.5 block truncate text-center text-xs font-semibold text-slate-300 transition group-hover:text-sky-500">{p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
