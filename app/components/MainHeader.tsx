'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import VIPLoginForm from '../login/VIPLoginForm';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useSektionen, zustandFuer } from '@/app/lib/sektionen-stand';

/*
 * Die Leiste und die schaltbaren Bereiche sind dieselbe Liste.
 *
 * "schluessel" verbindet den Eintrag mit dem Zustand aus
 * data/sektionen.json. Steht ein Bereich auf "offline", faellt er hier
 * heraus - fuer alle ausser dem Admin, der ihn weiterhin sieht, mit einer
 * kleinen Marke daneben.
 */
const navItems = [
  { href: '/', label: 'Home', schluessel: 'home' },
  { href: '/streams', label: 'Streams', schluessel: 'streams' },
  { href: '/power-rankings', label: 'Rankings', schluessel: 'rankings' },
  { href: '/events', label: 'Events', schluessel: 'events' },
  { href: '/statistiken', label: 'Statistiken', schluessel: 'statistiken' },
  { href: '/tierlist', label: 'Tierlist', schluessel: 'tierlist' },
  { href: '/overlays', label: 'Overlays', schluessel: 'overlays' },
];

export default function MainHeader({ sektionenAnfang }: {
  /*
   * Der Stand der Bereiche, wie ihn der Server schon kennt.
   *
   * Ohne ihn stuende ein abgeschalteter Bereich fuer einen Wimpernschlag
   * doch in der Leiste - und ohne Javascript sogar dauerhaft.
   */
  sektionenAnfang?: { admin: boolean; staende: Record<string, { zustand: string }> };
} = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === '1';
  const isTourMode = searchParams.get('tour') === '1';
  const t = useT();
  const sektionen = useSektionen(sektionenAnfang
    ? { admin: sektionenAnfang.admin,
        staende: sektionenAnfang.staende as never,
        sektionen: navItems.map((n) => ({
          schluessel: n.schluessel, pfad: n.href, titel: n.label })) }
    : undefined);
  /*
   * Ist das Menue auf dem Handy offen?
   *
   * Auf dem Telefon passten die sieben Bereiche nicht in eine Zeile und
   * brachen auf drei um - die Leiste war damit vierhundert Pixel hoch, also
   * die halbe Bildhoehe, bevor der Inhalt ueberhaupt anfing. Ab jetzt liegen
   * sie hinter einem Knopf und klappen bei Bedarf auf.
   */
  const [menueOffen, setMenueOffen] = useState(false);

  const [profileName, setProfileName] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'unknown' | 'loading' | 'authorized' | 'unauthorized'>('unknown');
  /** Das eigene CompHub-Konto - unabhaengig vom alten VIP-Zugang. */
  const [kontoName, setKontoName] = useState<string | null>(null);
  const [kontoBild, setKontoBild] = useState<string | null>(null);
  /** Was dieses Konto ist - Admin, Manager, VIP. */
  const [kontoRolle, setKontoRolle] = useState<string | null>(null);
  const [kontoVip, setKontoVip] = useState<boolean>(false);
  const [vipBis, setVipBis] = useState<number | null>(null);
  /** Einmalige Nachricht, wenn das VIP frisch vergeben wurde. */
  const [vipNeu, setVipNeu] = useState<boolean>(false);

  /*
   * Die Kopfzeile fragte nur ein einziges Mal beim Laden.
   *
   * Damit blieb eine Marke stehen, nachdem der Admin die Rolle entzogen
   * hatte - bis jemand die Seite neu lud. Der Nutzer wollte das anders:
   * nimmt er ein Recht weg, soll die Marke verschwinden.
   *
   * Also derselbe Takt wie beim Zugang: alle dreissig Sekunden und bei
   * jeder Rueckkehr ins Fenster. Haeufiger waere Unfug - eine
   * Rechteaenderung kommt nicht auf die Sekunde an.
   */
  useEffect(() => {
    let fort = false;

    const holen = async () => {
      try {
        const antwort = await fetch('/api/konto', {
          credentials: 'same-origin', cache: 'no-store',
        });
        const j = await antwort.json();
        if (fort) return;
        setKontoName(j?.angemeldet ? (j.konto?.name ?? null) : null);
        setKontoBild(j?.angemeldet ? (j.konto?.bild ?? null) : null);
        setKontoRolle(j?.angemeldet ? (j.konto?.rolle ?? null) : null);
        setKontoVip(Boolean(j?.angemeldet && j.konto?.vip));
        setVipBis(j?.angemeldet ? (j.konto?.vipBis ?? null) : null);
        setVipNeu(Boolean(j?.angemeldet && j.konto?.vipNeu));
      } catch { /* ohne Auskunft bleibt es beim letzten Stand */ }
    };

    void Promise.resolve().then(() => { if (!fort) return holen(); });

    const uhr = setInterval(() => { void holen(); }, 30_000);
    const beiRueckkehr = () => {
      if (document.visibilityState === 'visible') void holen();
    };
    document.addEventListener('visibilitychange', beiRueckkehr);
    window.addEventListener('focus', beiRueckkehr);

    return () => {
      fort = true;
      clearInterval(uhr);
      document.removeEventListener('visibilitychange', beiRueckkehr);
      window.removeEventListener('focus', beiRueckkehr);
    };
  }, []);

  useEffect(() => {
    const verifyLogin = async () => {
      // Only show debug status on localhost
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (isLocal) setAuthStatus('loading');

      try {
        const response = await fetch('/api/auth/verify', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });

        if (!response.ok) {
          if (isLocal) setAuthStatus('unauthorized');
          throw new Error('Not authorized');
        }

        const data = await response.json();
        if (data?.authorized && data?.user) {
          setProfileName(data.user);
          if (isLocal) setAuthStatus('authorized');
          return;
        }

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('streamer_dashboard_user_avatar');
          window.localStorage.removeItem('streamer_dashboard_user_login');
          window.localStorage.removeItem('streamer_dashboard_logged_in');
        }
        if (isLocal) setAuthStatus('unauthorized');
      } catch {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('streamer_dashboard_user_avatar');
          window.localStorage.removeItem('streamer_dashboard_user_login');
          window.localStorage.removeItem('streamer_dashboard_logged_in');
        }
      }

      setProfileName(null);
    };

    verifyLogin();
  }, []);

  // Vor dem Effekt darunter deklariert - der benutzt den Setzer bereits.
  const [showVipLogin, setShowVipLogin] = useState(false);

  // Listen for external requests to open the VIP login modal (e.g. from pages)
  useEffect(() => {
    const handler = () => setShowVipLogin(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('openVipLogin', handler as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openVipLogin', handler as EventListener);
      }
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('streamer_dashboard_user_avatar');
      window.localStorage.removeItem('streamer_dashboard_user_login');
      window.localStorage.removeItem('streamer_dashboard_logged_in');
    }
    // Logout action kept for manual use, but header logout button removed per UI request.
    window.location.href = '/api/auth/logout';
  };

  /*
   * Es gibt zwei Zugaenge nebeneinander: das CompHub-Konto und den alten
   * VIP-Schluessel. Wer nur ueber den VIP-Weg drin war, sah bisher trotzdem
   * "Sign in" - die Kopfzeile fragte nur nach dem Konto. Angemeldet ist,
   * wer auf einem der beiden Wege hereingekommen ist.
   */
  const angemeldet = Boolean(kontoName || profileName);
  const anzeige = kontoName || profileName || '';

  /*
   * Ein Seitenwechsel schliesst das Menue.
   *
   * Ohne das bliebe es offen ueber der neuen Seite stehen - man haette
   * angetippt, was man wollte, saehe aber weiter nur die Liste.
   */
  useEffect(() => { setMenueOffen(false); }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-xl">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-slate-900/90 p-1 shadow-sm shadow-black/20">
            <img
              src="/logos/CompHub-Logo.png"
              alt="Logo"
              className="h-9 w-9 rounded-lg object-cover sm:h-11 sm:w-11"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">CompHub</p>
            {/* Der Untertitel kostet auf dem Handy nur Breite, die der
                Anmeldeknopf daneben braucht. */}
            <p className="hidden text-xs text-slate-500 sm:block">Fortnite Competitive</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          {isPreviewMode && isTourMode ? (
            <div className="rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300">
              <T>Preview tour active</T>
            </div>
          ) : (
            <>
              {/*
                * Ab Tablet die Leiste, darunter der Knopf weiter unten.
                * Am Desktop aendert sich damit nichts.
                */}
              <nav className="hidden flex-wrap items-center gap-2 lg:flex">
                {navItems.map((item) => {
                  /*
                   * Was ausgeblendet ist, steht hier nicht.
                   *
                   * Solange keine Auskunft da ist, bleibt alles stehen -
                   * sonst huepfte die Leiste bei jedem Seitenaufruf.
                   */
                  const zustand = sektionen.laedt
                    ? 'online' : zustandFuer(sektionen, item.schluessel);
                  if (zustand === 'offline' && !sektionen.admin) return null;

                  /*
                   * Fuer den Admin eine kleine Marke daneben: er sieht
                   * jeden Bereich, soll aber erkennen, welcher davon
                   * gerade fuer niemanden sonst offen ist.
                   */
                  const eigen = sektionen.admin
                    ? sektionen.staende[item.schluessel]?.zustand ?? 'online'
                    : 'online';

                  const params = new URLSearchParams();
                  if (isPreviewMode) params.set('preview', '1');
                  if (isTourMode) params.set('tour', '1');
                  const href = params.toString() ? `${item.href}?${params.toString()}` : item.href;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      prefetch={false}
                      title={eigen === 'standby' ? t('Standby — nur für dich sichtbar nutzbar')
                        : eigen === 'offline' ? t('Offline — nur du siehst das hier')
                        : undefined}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2
                                  text-sm transition ${
                        pathname === item.href
                          ? 'bg-slate-800 text-slate-100'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                      }`}
                    >
                      <T>{item.label}</T>
                      {eigen !== 'online' && (
                        <span aria-hidden
                          className={`h-1.5 w-1.5 rounded-full ${eigen === 'standby'
                            ? 'bg-amber-400' : 'bg-rose-500'}`} />
                      )}
                    </Link>
                  );
                })}
              </nav>
              {isPreviewMode && (
                <div className="rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300">
                  Preview mode{isTourMode ? ' / tour' : ''}
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            {/*
              * Der Menueknopf - nur auf schmalen Bildschirmen.
              *
              * Er steht links neben Konto und Anmeldung, weil man ihn dort
              * mit dem Daumen erreicht, ohne das Telefon umzugreifen.
              */}
            {!(isPreviewMode && isTourMode) && (
              <button type="button" onClick={() => setMenueOffen((o) => !o)}
                aria-expanded={menueOffen}
                aria-label={t('Menü')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg
                           border border-zinc-800 text-slate-300 transition
                           hover:border-sky-500 hover:text-sky-400 lg:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  aria-hidden>
                  {menueOffen
                    ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
                    : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
                </svg>
              </button>
            )}

            {/*
              * Die Verwaltung bleibt ein eigener Knopf und erscheint nur dem
              * Admin. Frueher stand hier fuer jeden VIP sein Name und fuehrte
              * ebenfalls nach /admin - dorthin gehoert aber nicht jeder.
              */}
            {profileName?.toLowerCase() === 'admin-juanito' && (
              <Link
                href="/admin"
                prefetch={false}
                className="rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold
                           text-slate-100 transition hover:bg-slate-700"
              >
                ADMIN
              </Link>
            )}

            {/*
              * Der Weg zum eigenen Konto - fuer alle, ob VIP oder nicht.
              *
              * Angemeldet steht hier nur noch das Bild: das Wort "Anmelden"
              * neben einem angemeldeten Konto ist eine Aufforderung ins
              * Leere. Nicht angemeldet fuehrt der Knopf auf /anmelden, wo
              * man sich ebenso registriert.
              */}
            {/*
              * Was dieses Konto ist. Neben dem Bild, nicht darauf - auf
              * sechsunddreissig Pixeln waere jede Schrift unlesbar. Zwei
              * Marken hoechstens: die Rolle und das VIP.
              */}
            {angemeldet && (kontoRolle || kontoVip) && (
              <span className="flex items-center gap-1">
                {kontoRolle && (
                  <span className="rounded-full border border-sky-500/50
                                   bg-sky-500/10 px-2 py-0.5 text-[10px]
                                   font-bold uppercase tracking-wider
                                   text-sky-400">
                    {kontoRolle}
                  </span>
                )}
                {kontoVip && (
                  <span className="rounded-full border border-amber-500/50
                                   bg-amber-500/10 px-2 py-0.5 text-[10px]
                                   font-bold uppercase tracking-wider
                                   text-amber-400"
                    title={vipBis
                      ? `${t('läuft bis')} ${new Date(vipBis).toLocaleDateString('de-DE')}`
                      : t('ohne Ende')}>
                    VIP
                  </span>
                )}
              </span>
            )}

            {angemeldet ? (
              <Link
                /*
                 * Wer ein CompHub-Konto hat, landet dort. Wer nur ueber den
                 * VIP-Schluessel drin ist, hat keines - fuer den ist die
                 * Verwaltung das Dashboard. Sonst liefe der Klick auf
                 * /konto und von dort direkt weiter zur Anmeldung.
                 */
                href={kontoName ? '/konto' : '/vip'}
                prefetch={false}
                title={anzeige}
                aria-label={`${t('Mein Konto')} — ${anzeige}`}
                className="grid h-9 w-9 place-items-center overflow-hidden
                           rounded-full border border-zinc-700 bg-slate-800
                           text-sm font-semibold uppercase text-slate-100
                           transition hover:border-sky-500"
              >
                {kontoBild
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={kontoBild} alt="" className="h-full w-full object-cover" />
                  : anzeige.trim().charAt(0)}
              </Link>
            ) : (
              <Link
                href="/anmelden"
                prefetch={false}
                /* whitespace-nowrap: auf dem Handy brach "Sign in" mitten
                   entzwei und der Knopf wurde zu einem hohen Kreis. */
                className="whitespace-nowrap rounded-full bg-sky-500 px-3 py-2
                           text-sm font-semibold text-white transition
                           hover:bg-sky-400 sm:px-4"
              >
                <T>Sign in</T>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/*
        * Die Bereiche als Liste - nur auf dem Handy, nur wenn aufgeklappt.
        *
        * Eine Liste und kein Raster: sieben Eintraege nebeneinander waeren
        * wieder das Gedraenge, das hier gerade beseitigt wurde. Jede Zeile
        * ist so hoch, dass sie sich mit dem Daumen treffen laesst.
        */}
      {menueOffen && !(isPreviewMode && isTourMode) && (
        <nav className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 lg:hidden">
          {navItems.map((item) => {
            const zustand = sektionen.laedt
              ? 'online' : zustandFuer(sektionen, item.schluessel);
            if (zustand === 'offline' && !sektionen.admin) return null;
            const eigen = sektionen.admin
              ? sektionen.staende[item.schluessel]?.zustand ?? 'online'
              : 'online';

            const params = new URLSearchParams();
            if (isPreviewMode) params.set('preview', '1');
            if (isTourMode) params.set('tour', '1');
            const href = params.toString()
              ? `${item.href}?${params.toString()}` : item.href;

            return (
              <Link key={item.href} href={href} prefetch={false}
                onClick={() => setMenueOffen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-3 text-base
                            transition ${pathname === item.href
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-300 active:bg-slate-900'}`}>
                <T>{item.label}</T>
                {eigen !== 'online' && (
                  <span aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${eigen === 'standby'
                      ? 'bg-amber-400' : 'bg-rose-500'}`} />
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/*
        * Die Nachricht zum VIP-Geschenk - genau einmal.
        *
        * Sie erscheint, solange der Nutzer sie nicht bestaetigt hat; das
        * Abhaken merkt sich der Server am Konto, nicht der Browser. Sonst
        * kaeme sie auf jedem Geraet erneut.
        */}
      {vipNeu && (
        <div className="border-b border-amber-900/40 bg-amber-950/20 px-4 py-3">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
            <span className="text-lg" aria-hidden>🎁</span>
            <p className="min-w-0 flex-1 text-sm text-amber-200">
              <T>Du hast VIP bekommen</T>
              {vipBis
                ? ` — ${t('läuft bis')} ${new Date(vipBis).toLocaleDateString('de-DE')}`
                : ` — ${t('ohne Ende')}`}
              . <span className="text-amber-200/70">
                <T>Overlays, eigene Ordner, Turnierfilter und der Vergleich
                sind jetzt frei.</T>
              </span>
            </p>
            <button
              onClick={async () => {
                setVipNeu(false);
                await fetch('/api/konto', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ was: 'vipGesehen' }),
                }).catch(() => { /* beim naechsten Mal wieder */ });
              }}
              className="rounded-lg border border-amber-700/60 px-3 py-1.5
                         text-xs font-semibold text-amber-200 transition
                         hover:border-amber-500 hover:text-amber-100">
              <T>Alles klar</T>
            </button>
          </div>
        </div>
      )}

      {showVipLogin && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setShowVipLogin(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <T>Close</T>
            </button>
            <VIPLoginForm />
          </div>
        </div>
      )}
    </header>
  );
}
