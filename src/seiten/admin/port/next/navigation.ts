import { useLocation, useNavigate, useSearchParams as useRrSuche } from 'react-router-dom';

/* next/navigation fuer die portierten Werkzeuge - ueber react-router des Hubs. */
export function useSearchParams() { return useRrSuche()[0]; }
export function usePathname() { return useLocation().pathname; }
export function useRouter() {
  const geh = useNavigate();
  return { push: (z: string) => geh(z), replace: (z: string) => geh(z, { replace: true }), back: () => geh(-1), refresh: () => {}, prefetch: () => {} };
}
