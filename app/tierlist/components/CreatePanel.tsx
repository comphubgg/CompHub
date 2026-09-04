'use client';

import React, { useEffect, useState } from 'react';
import { Region } from '../types';
import { storageService } from '../services/storageService';
import { FlaggenWahl, FLAGGEN_MIT_GLOBUS } from './FlaggenWahl';
import { FLAG_CODES, getRegionFromCountryCode, REGION_LABELS } from '../utils/constants';

interface CreatePanelProps {
  mode: 'solo' | 'duo';
  onCreatePlayer: (name: string, region: Region, countryCode: string) => Promise<void>;
  onCreateDuo: (player1: string, player2: string, countryCode1: string, countryCode2: string) => Promise<void>;
  existingEntries: any[];
  /**
   * Zum vorhandenen Spieler fuehren.
   *
   * Wer einen Namen anlegt, den es schon gibt, soll nicht nur eine Absage
   * bekommen, sondern den vorhandenen Eintrag sehen. Gesetzt wird dafuer die
   * Suche ueber der Liste - dann steht er dort ganz oben.
   */
  onShowExisting?: (name: string) => void;
  disabled?: boolean;
}

/**
 * CreatePanel: Form for creating new players/duos
 */
export const CreatePanel: React.FC<CreatePanelProps> = ({
  mode,
  onCreatePlayer,
  onCreateDuo,
  existingEntries,
  onShowExisting,
  disabled = false,
}) => {
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [region, setRegion] = useState<Region>('EU');
  const [countryCode, setCountryCode] = useState('flag-GLOBE');
  const [countryCode2, setCountryCode2] = useState('flag-GLOBE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownPlayers, setKnownPlayers] = useState<Record<string, { region: string; twitter?: string; countryCode?: string }>>({});
  const [candidateNames, setCandidateNames] = useState<string[]>([]);
  const [suggestions1, setSuggestions1] = useState<string[]>([]);
  const [suggestions2, setSuggestions2] = useState<string[]>([]);

  useEffect(() => {
    try {
      const buildId = process?.env?.NEXT_PUBLIC_BUILD_ID || process?.env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process?.env?.VERCEL_GIT_COMMIT_SHA || null;
      console.log('[CreatePanel] mounted - buildId:', buildId, 'mode:', mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const flagCodes = FLAGGEN_MIT_GLOBUS;
  const regions = Object.entries(REGION_LABELS) as [Region, string][];

  /**
   * Kein Land aus der Region raten.
   *
   * Frueher wurde aus "EU" Deutschland und aus "NAC" die Vereinigten
   * Staaten. Das ist keine Vorbelegung, sondern eine Behauptung - in der
   * EU-Region spielen Franzosen, Polen und Daenen. Vorbelegt wird deshalb
   * die Weltkugel; wer die Herkunft kennt, waehlt sie aus.
   */
  const getDefaultCountryForRegion = (_regionValue: Region) => 'flag-GLOBE';

  useEffect(() => {
    if (mode === 'solo') {
      const defaultCode = getDefaultCountryForRegion(region);
      setCountryCode(defaultCode);
    }
  }, [mode, region]);

  useEffect(() => {
    setError(null);
  }, [mode]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const resp = await fetch('/api/players');
        if (!resp.ok) return;
        const json = await resp.json();
        if (!mounted) return;

        const apiPlayers = json.players || {};
        const apiRegions = json.regions || {};

        const allLists = storageService.getTierLists() || [];
        let storedEntries: any[] = [];
        for (const l of allLists) {
          try {
            if (Array.isArray(l.entries)) {
              storedEntries = storedEntries.concat(l.entries);
            }
          } catch {
            // ignore
          }
        }

        try {
          const lists = storageService.getTierLists() || [];
          const staticGlobal = lists.find(x => x.listId === 'static-tierlist');
          if (staticGlobal && Array.isArray(staticGlobal.entries)) storedEntries = storedEntries.concat(staticGlobal.entries);
        } catch {
          // ignore
        }

        const mergedPlayers: Record<string, { region: string; twitter?: string; countryCode?: string }> = {};
        const setNames = new Set<string>();

        const addCandidate = (name: string, info: { region: string; countryCode?: string }) => {
          const normalized = String(name).trim().toUpperCase();
          if (!normalized) return;
          if (!setNames.has(normalized)) {
            setNames.add(normalized);
            mergedPlayers[normalized] = info;
          }
        };

        for (const l of allLists) {
          if (l.mode !== 'solo') continue;
          const combinedEntries = [...(l.entries || [])];

          for (const e of combinedEntries) {
            if (e.isDuo) continue;
            const p: any = e.data;
            const pname = p.name?.trim();
            if (!pname) continue;
            addCandidate(pname, { region: p.region || 'EU', countryCode: p.countryCode || '' });
          }
        }

        Object.keys(apiPlayers || {}).forEach(n => addCandidate(n, apiPlayers[n]));
        (apiRegions.NAC_PLAYERS || []).forEach((n: string) => addCandidate(n, { region: 'NAC', countryCode: '' }));
        (apiRegions.EU_PLAYERS || []).forEach((n: string) => addCandidate(n, { region: 'EU', countryCode: 'de' }));

        setKnownPlayers(mergedPlayers as any);
        const namesArr = Array.from(setNames);
        setCandidateNames(namesArr);
        console.log('[CreatePanel] loaded knownPlayers:', Object.keys(mergedPlayers).length, 'candidates:', namesArr.length);
      } catch {
        // ignore
      }
    };

    load();
    return () => { mounted = false; };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    setError(null);
    setLoading(true);

    try {
      if (mode === 'solo') {
        if (!player1.trim()) {
          setError('Player name required');
          return;
        }

        // Denselben Namen nicht zweimal anlegen.
        //
        // Verglichen wird ohne Gross- und Kleinschreibung und ohne
        // Sonderzeichen: "Vic0" und "vic0" sind derselbe Mensch, und eine
        // zweite Kachel dazu waere nur verwirrend.
        const schluessel = (n: string) =>
          String(n).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const gesucht = schluessel(player1);
        const schonDa = (existingEntries || []).find((entry: any) =>
          !entry.isDuo && schluessel(entry?.data?.name ?? '') === gesucht);

        if (schonDa) {
          const name = schonDa.data?.name ?? player1.trim();
          setError(`„${name}“ steht schon in der Liste.`);
          onShowExisting?.(name);
          return;
        }

        const selectedRegion = region || getRegionFromCountryCode(countryCode);
        await onCreatePlayer(player1.trim(), selectedRegion, countryCode);
        setPlayer1('');
      } else {
        if (!player1.trim() || !player2.trim()) {
          setError('Both player names required');
          return;
        }

        const normalized1 = player1.trim().toLowerCase();
        const normalized2 = player2.trim().toLowerCase();

        if (normalized1 === normalized2) {
          setError('A duo requires two different player names');
          return;
        }

        const usedNames = new Set<string>();
        for (const entry of existingEntries) {
          if (!entry.isDuo) continue;
          const duo = entry.data as any;
          if (duo.player1?.name) usedNames.add(duo.player1.name.trim().toLowerCase());
          if (duo.player2?.name) usedNames.add(duo.player2.name.trim().toLowerCase());
        }

        if (usedNames.has(normalized1) || usedNames.has(normalized2)) {
          setError('Each player name may only be used once in the current duo list');
          return;
        }

        await onCreateDuo(player1.trim(), player2.trim(), countryCode, countryCode2);
        setPlayer1('');
        setPlayer2('');
      }
    } catch (err: any) {
      const msg = err?.message || `Failed to create ${mode === 'solo' ? 'player' : 'duo'}`;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const findSuggestions = (text: string) => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const names = candidateNames.length ? candidateNames : Object.keys(knownPlayers || {});
    // Only suggest names that exist in the current solo list (`existingEntries`).
    const soloNameSet = new Set(
      (existingEntries || [])
        .filter((e: any) => !e.isDuo)
        .map((e: any) => {
          const p = e.data || {};
          const name = (p.name || p.player1 || p.p1 || '').toString().trim().toUpperCase();
          return name;
        })
    );

    return names
      .filter(n => {
        if (!n) return false;
        const normalized = n.toString().trim().toUpperCase();
        if (!soloNameSet.has(normalized)) return false;
        return n.toLowerCase().includes(q);
      })
      .slice(0, 8);
  };

  const selectSuggestion = (which: 1 | 2, name: string) => {
    const info = knownPlayers[name];
    let regionSelected = info?.region;
    let usedCountryCode = info?.countryCode;
    if (!regionSelected) {
      if ((knownPlayers || {})[name] && (knownPlayers || {})[name].region) {
        regionSelected = (knownPlayers || {})[name].region;
      }
    }
    if (!regionSelected) regionSelected = 'EU';
    const defaultCode = getDefaultCountryForRegion(regionSelected as any);
    const finalCode = usedCountryCode || defaultCode;
    if (which === 1) {
      setPlayer1(name);
      setRegion(regionSelected as any);
      setCountryCode(finalCode);
      setSuggestions1([]);
    } else {
      setError(null);
      setPlayer2(name);
      setCountryCode2(finalCode);
      setSuggestions2([]);
    }
  };

  if (disabled) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="create-panel">
      <div className="create-panel-title">
        {mode === 'solo' ? 'CREATE A SOLO' : 'CREATE A DUO'}
      </div>

      <div className="create-panel-row create-panel-row--compact">
        <div className="create-panel-field create-panel-player">
          <input
            type="text"
            placeholder={mode === 'solo' ? 'Player name...' : 'Player 1...'}
            value={player1}
            onChange={e => {
              const v = e.target.value.toUpperCase();
              setError(null);
              setPlayer1(v);
              setSuggestions1(mode === 'duo' ? findSuggestions(v) : []);
            }}
            disabled={disabled || loading}
          />
          {mode === 'duo' && suggestions1.length > 0 && !disabled && (
            <div className="autocomplete-list">
              {suggestions1.map(s => {
                const info = knownPlayers[s] || { region: 'EU' };
                const previewCode = info.countryCode || getDefaultCountryForRegion(info.region as any);
                return (
                  <div key={s} className="autocomplete-item" onClick={() => selectSuggestion(1, s)}>
                    <img src={`/flags/${previewCode}.png`} alt={previewCode} style={{ width: 20, height: 14, marginRight: 8, borderRadius: 2 }} />
                    <span style={{ marginRight: 8 }}>{s}</span>
                    <small style={{ color: 'rgba(255,255,255,0.45)' }}>{info.region}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <FlaggenWahl wert={countryCode}
          aus={disabled || loading} onWahl={setCountryCode} />
      </div>

      {mode === 'duo' && (
        <div className="create-panel-row create-panel-row--compact">
          <div className="create-panel-field create-panel-player">
            <input
              type="text"
              placeholder="Player 2..."
              value={player2}
              onChange={e => {
                const v = e.target.value.toUpperCase();
                setError(null);
                setPlayer2(v);
                setSuggestions2(findSuggestions(v));
              }}
              disabled={disabled || loading}
            />
            {suggestions2.length > 0 && (
              <div className="autocomplete-list">
                {suggestions2.map(s => {
                  const info = knownPlayers[s] || { region: 'EU' };
                  const previewCode = info.countryCode || getDefaultCountryForRegion(info.region as any);
                  return (
                    <div key={s} className="autocomplete-item" onClick={() => selectSuggestion(2, s)}>
                      <img src={`/flags/${previewCode}.png`} alt={previewCode} style={{ width: 20, height: 14, marginRight: 8, borderRadius: 2 }} />
                      <span style={{ marginRight: 8 }}>{s}</span>
                      <small style={{ color: 'rgba(255,255,255,0.45)' }}>{info.region}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <FlaggenWahl wert={countryCode2}
            aus={disabled || loading} onWahl={setCountryCode2} />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button type="submit" disabled={disabled || loading}>
        {loading ? 'Creating...' : mode === 'solo' ? 'Create Solo' : 'Create Duo'}
      </button>
    </form>
  );
};
