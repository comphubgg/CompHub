'use client';

import { useEffect, useState } from 'react';

export default function DevDebug() {
  const [auth, setAuth] = useState<string>('idle');
  const [tournaments, setTournaments] = useState<string>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

  const checkAuth = async () => {
    setAuth('loading');
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/verify', { cache: 'no-store' });
      if (!res.ok) {
        setAuth('error');
        setAuthError(`HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      setAuth(j?.authorized ? 'ok' : 'unauthorized');
    } catch (e: any) {
      setAuth('error');
      setAuthError(e?.message || String(e));
    }
  };

  const fetchTournaments = async () => {
    setTournaments('loading');
    setTournamentsError(null);
    try {
      const res = await fetch('/api/tournaments', { cache: 'no-store' });
      if (!res.ok) {
        setTournaments('error');
        setTournamentsError(`HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      setTournaments(j?.success ? `ok (${j.count || j.tournaments?.length || 0})` : 'error');
    } catch (e: any) {
      setTournaments('error');
      setTournamentsError(e?.message || String(e));
    }
  };

  useEffect(() => {
    checkAuth();
    fetchTournaments();
  }, []);

  // Auto-hide when both checks are OK
  useEffect(() => {
    if (!visible) return;
    const authOk = auth === 'ok';
    const toursOk = tournaments === 'ok' || tournaments.startsWith('ok');
    if (authOk && toursOk) {
      const t = setTimeout(() => setVisible(false), 1000);
      return () => clearTimeout(t);
    }
  }, [auth, tournaments, visible]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Show Dev Debug"
        style={{position:'fixed', right:12, bottom:12, zIndex:9999, background:'#071029', color:'#9cf', padding:'8px 10px', borderRadius:8, fontSize:12, border:'none', boxShadow:'0 6px 18px rgba(0,0,0,0.6)'}}
      >
        DEV
      </button>
    );
  }

  return (
    <div style={{position:'fixed', right:12, bottom:12, zIndex:9999, background:'#0b1220', color:'#fff', padding:10, borderRadius:8, fontSize:12, boxShadow:'0 6px 18px rgba(0,0,0,0.6)'}}>
      <div style={{fontWeight:700, marginBottom:6}}>DEV DEBUG</div>
      <div style={{marginBottom:6}}>
        <div><strong>/api/auth/verify:</strong> {auth} {authError && <span style={{color:'#f88'}}> — {authError}</span>}</div>
        <div style={{marginTop:6}}><strong>/api/tournaments:</strong> {tournaments} {tournamentsError && <span style={{color:'#f88'}}> — {tournamentsError}</span>}</div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button onClick={checkAuth} style={{padding:'6px 8px', borderRadius:6, background:'#123', color:'#9cf', border:'none'}}>Check Auth</button>
        <button onClick={fetchTournaments} style={{padding:'6px 8px', borderRadius:6, background:'#123', color:'#9cf', border:'none'}}>Fetch Tournaments</button>
      </div>
    </div>
  );
}
