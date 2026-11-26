import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link as RLink, useLocation } from 'react-router-dom';
import { useWer } from '../../../teile/Anmeldung';
import { OV } from './ort';

/*
 * next/link im Hub: Adressen der echten Seite werden auf die Seiten des Streamer-Bereichs gelegt (die Overlays sind schon beim Portieren
 * umgeschrieben). Was es im Hub nicht gibt, oeffnet thecomphub.com in einem neuen Tab; "/sign-in" oeffnet die Anmeldung des Hubs.
 */
export function hubPfad(href: string): string | null {
  if (href.startsWith('/streamer/') || href === '/streamer') return href;
  if (/^\/overlays(?=[/?#]|$)/.test(href) && !href.startsWith('/overlays/finest/live')) return `/streamer${href}`;
  if (/^\/globals\/overlays(?=[/?#]|$)/.test(href)) return href.replace('/globals/overlays', '/streamer/overlays/globals');
  if (href.startsWith('/tierlist')) return '/competitive/tierlist';
  if (href.startsWith('/vip#')) return href.replace('/vip', '/streamer/vip');
  if (href === '/admin#archiv' || href === '/admin#mein-archiv' || href === '/account' || href === '/vip' || href === '/admin') return '/streamer/vip';
  if (href.startsWith('/twitch-bot')) return href.replace('/twitch-bot', '/streamer/twitch-bot');
  if (href.startsWith('/twitch-statistik')) return href.replace('/twitch-statistik', '/streamer/twitch-stats');
  const spieler = /^\/player\/(.+)$/.exec(href);
  if (spieler) return `/competitive/player/${spieler[1]}`;
  return null;
}

type Eigen = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; prefetch?: boolean; children?: ReactNode };

export default function Link({ href, prefetch: _p, children, ...rest }: Eigen) {
  const { oeffnen } = useWer();
  if (href === '/sign-in') {
    return <a href="#" {...rest} onClick={(e) => { e.preventDefault(); oeffnen('konto'); }}>{children}</a>;
  }
  const ziel = hubPfad(href);
  if (ziel) return <RLink to={ziel} {...rest}>{children}</RLink>;
  return <a href={href.startsWith('/') ? `${OV}${href}` : href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
}

export function usePathname() { return useLocation().pathname; }
export function notFound(): never { throw new Error('not found'); }
