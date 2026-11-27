import { Link } from 'react-router-dom';
import { Glas } from './Glas';

/** Unbekannte Adresse innerhalb eines Bereichs: freundliche Glas-Karte mit dem Weg zurueck (frueher ein deutscher "Wird gebaut"-Kreisel). */
export default function Baustelle({ text = 'This page does not exist.', zurueck = '/competitive', ziel = 'Competitive overview' }: { text?: string; zurueck?: string; ziel?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Glas className="w-full max-w-md p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">404</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">Page not found</h1>
        <p className="mt-2 text-sm text-white/55">{text}</p>
        <Link to={zurueck} className="mt-5 inline-block rounded-full bg-sky-400 px-5 py-2 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Back to the {ziel}</Link>
      </Glas>
    </div>
  );
}
