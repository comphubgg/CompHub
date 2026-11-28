import { useEffect, useState, type ComponentType } from 'react';
import { Link, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import Schale from '../../ds/Schale';
import { Leer, Laedt } from '../../ds/Bausteine';
import { useWer, type Wer } from '../../teile/Anmeldung';
import Kontrollraum from './Kontrollraum';
import Rahmen from './Rahmen';
import Live from './Live';
import VipZugaenge from './VipZugaenge';
import Vips from './Vips';
import Spieler from './Spieler';
import Sektionen from './Sektionen';
import Kontakt from './Kontakt';
import { portiert } from './port/Portiert';
import TweetSeite from './tweets/page';
import KontenSeite from './accounts/page';
import PrognosenSeite from './predictions/page';
import ReplaysSeite from './replays/page';
import ReplaySeite from './replay/page';
import OrgsSeite from './orgs/page';
import AwardsEditor from './awards/AwardsEditor';
import FotoPool from './fotos-pool/page';
import FotoCredits from './fotos-credits/page';
import FlaggenSeite from './flaggen/page';
import ProspectsSeite from './prospects/page';
import AlteMaps from './alte-maps/Werkzeug';
import PostIdeenSeite from './post-ideen/page';
import TikTokSeite from './tiktok/page';
import PlakateSeite from './plakate/page';
import ArchivSeite from './archive/page';
import BildvorratSeite from './assets/page';
import WechselSeite from './switch/page';
import DiensteSeite from './services/page';
import PartnerSeite from './partner/page';
import LootRouten from './loot-routen/page';
import AlleEpicFreunde from './epic-friends/page';
import StatusSeite from './status/page';
import { Schnellzugriff, SiteDashboard, VipWerkzeuge } from './dashboard/page';
import { werkzeugNach } from './werkzeuge';
import { NurAdmins } from './teile';

/*
 * Der Admin-Bereich im Hub (/admin, Betreiber 26.11.2026: "als Admin muss ich auch meine Admin-Tools und alles sehen. Du darfst nicht einfach Sachen
 * entfernen."). Seit 28.11.2026 im Design-System 3.0: dieselbe Schale wie Competitive/Community/Streamer (Kopf, EINE Leiste mit allen Werkzeugen,
 * Menue-Fenster, Strg+K - Seiten in src/ds/seiten.ts aus werkzeuge.ts), Akzent amber. Startseite ist der Kontrollraum (was jetzt wartet).
 * Jedes Werkzeug der echten Seite steht in werkzeuge.ts; die im Hub gebauten haben "Classic view" (die echte Seite im Rahmen, Rahmen.tsx).
 * Nur fuer Admins - alle anderen sehen eine freundliche Karte ohne Leiste.
 */
const EIGEN: Record<string, ComponentType<{ klassisch: () => void }>> = { live: Live, 'vip-access': VipZugaenge, vips: Vips, players: Spieler, sections: Sektionen, contact: Kontakt,
  tweets: portiert(TweetSeite, 'Content'),
  accounts: portiert(KontenSeite, 'Users & Access'),
  predictions: portiert(PrognosenSeite, 'Content'),
  replays: portiert(ReplaysSeite, 'Data & Replays'),
  replay: portiert(ReplaySeite, 'Data & Replays'),
  orgs: portiert(OrgsSeite, 'Players & Teams'),
  awards: portiert(AwardsEditor, 'Content'),
  'fotos-pool': portiert(FotoPool, 'Players & Teams'),
  'fotos-credits': portiert(FotoCredits, 'Players & Teams'),
  flaggen: portiert(FlaggenSeite, 'Players & Teams'),
  prospects: portiert(ProspectsSeite, 'Players & Teams'),
  'alte-maps': portiert(AlteMaps, 'Content'),
  'post-ideen': portiert(PostIdeenSeite, 'Content'),
  'tiktok': portiert(TikTokSeite, 'Content'),
  'plakate': portiert(PlakateSeite, 'Content'),
  'archive': portiert(ArchivSeite, 'Content'),
  'assets': portiert(BildvorratSeite, 'Content'),
  'switch': portiert(WechselSeite, 'Users & Access'),
  'services': portiert(DiensteSeite, 'Users & Access'),
  'partner': portiert(PartnerSeite, 'Inbox'),
  'loot-routen': LootRouten,
  'epic-friends': AlleEpicFreunde,
  status: StatusSeite,
  'vip-tools': VipWerkzeuge,
  'quick-access': Schnellzugriff,
  'site-dashboard': SiteDashboard,
};

/** check-admin selbst nachfragen, solange useWer noch nichts weiss - sonst blitzte kurz "admins only" auf. */
function useAdmin(): Wer | null | 'laedt' {
  const { wer } = useWer();
  const [eigen, setEigen] = useState<Wer | null | 'laedt'>('laedt');
  useEffect(() => {
    fetch('/api/auth/check-admin', { cache: 'no-store' }).then((r) => r.json()).then(setEigen).catch(() => setEigen(null));
  }, [wer?.userName]);
  return wer ?? eigen;
}

export default function Admin() {
  const wer = useAdmin();
  // Ohne Admin-Recht keine Leiste - die Namen der Werkzeuge gehen niemanden etwas an
  if (wer === 'laedt' || !wer?.isAdmin) {
    return (
      <div data-bereich="admin" className="min-h-screen">
        <Kopf bereich="admin" />
        <main className="px-4 py-7 lg:px-8">{wer === 'laedt' ? <Laedt text="Checking your rights" /> : <NurAdmins text="The admin area is for CompHub admins only." />}</main>
      </div>
    );
  }
  return (
    <Schale bereich="admin">
      <Routes>
        <Route index element={<Kontrollraum />} />
        <Route path=":slug/*" element={<Werkzeugseite />} />
      </Routes>
    </Schale>
  );
}

/** Ein Werkzeug: im Hub gebaut (mit "Classic view") oder die echte Seite im Rahmen. ?classic=1 zeigt immer die echte Seite. */
function Werkzeugseite() {
  const { slug = '' } = useParams();
  const [p, setP] = useSearchParams();
  const w = werkzeugNach(slug);
  if (!w) return <Leer text="This tool does not exist."><Link to="/admin" className="knopf-leer">Back to the control room →</Link></Leer>;
  // Die Seite gibt es im Hub schon (Maps, Scrims, Awards, Tagesposts) - dorthin; ?classic=1 zeigt weiter die echte Seite.
  if (w.hub && p.get('classic') !== '1') return <Navigate to={w.hub} replace />;
  const Eigen = EIGEN[w.slug];
  const klassisch = p.get('classic') === '1';
  if (Eigen && !klassisch) return <Eigen key={w.slug} klassisch={() => setP({ classic: '1' })} />;
  return <Rahmen key={w.slug} pfad={w.pfad} titel={w.titel} nativ={Eigen ? () => setP({}) : undefined} />;
}
