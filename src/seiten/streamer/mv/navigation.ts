import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/* next/navigation im Hub: Suchparameter und Router ueber react-router. */
export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useRouter() {
  const nav = useNavigate();
  return { push: (u: string) => nav(u), replace: (u: string) => nav(u, { replace: true }), refresh: () => {}, back: () => nav(-1) };
}
export function usePathname() { return useLocation().pathname; }
