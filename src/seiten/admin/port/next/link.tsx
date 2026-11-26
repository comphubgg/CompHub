import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link as HubLink } from 'react-router-dom';
import { SEITE } from '../../../../teile/Glas';
import { WERKZEUGE } from '../../werkzeuge';

/*
 * next/link fuer die portierten Werkzeuge: Ziele, die ein Admin-Werkzeug sind, bleiben im Hub (/admin/<slug>); alles andere oeffnet die echte Seite
 * (thecomphub.com) - im Hub gibt es diese Adressen nicht unbedingt.
 */
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string }; children?: ReactNode; prefetch?: boolean; scroll?: boolean; replace?: boolean };
export function hubZiel(href: string): string | null {
  const [pfad] = href.split('#');
  const w = WERKZEUGE.find((x) => x.pfad === pfad) ?? WERKZEUGE.find((x) => x.pfad === pfad.split('?')[0]);
  if (!w) return null;
  const rest = pfad.includes('?') && !w.pfad.includes('?') ? pfad.slice(pfad.indexOf('?')) : '';
  return `/admin/${w.slug}${rest}`;
}
export default function Link({ href, children, prefetch: _p, scroll: _s, replace, ...rest }: Props) {
  const h = typeof href === 'string' ? href : href.pathname ?? '/';
  const hub = h.startsWith('/') ? hubZiel(h) : null;
  if (hub) return <HubLink to={hub} replace={replace} {...rest}>{children}</HubLink>;
  const ziel = h.startsWith('/') ? `${SEITE}${h}` : h;
  return <a href={ziel} target={rest.target ?? '_blank'} rel="noreferrer" {...rest}>{children}</a>;
}
