'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { FlaggenWahl } from './FlaggenWahl';
import { TierListEntry } from '../types';
import { getPrimaryRegion, isDuo, cleanPlayerName } from '../utils/helpers';

import { useT } from '@/app/components/SprachProvider';
interface PlayerCardProps {
  entry: TierListEntry;
  variant?: 'list' | 'pool';
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onReturnToPool?: () => void;
  isAdmin?: boolean;
  /**
   * Einen Namen aendern.
   *
   * Bewusst fuer jeden und nicht nur fuer den Admin: wer keine Rechte hat,
   * aendert damit seine eigene Ansicht - fortgeschrieben wird die
   * offizielle Liste ohnehin nur vom Admin.
   */
  onRename?: (rohName: string, neuerName: string, welcher?: 1 | 2) => void;
  /**
   * Der gepflegte Anzeigename zu einem Turniernamen.
   *
   * Genau wie beim Land: im Eintrag steht der Name, unter dem jemand
   * angetreten ist, im Profil der, unter dem der Betreiber ihn kennt.
   * Angezeigt wird der aus dem Profil, gesucht und zugeordnet wird weiter
   * ueber den echten.
   */
  anzeigeVon?: (name: string) => string | undefined;
  /**
   * Das gepflegte Land zu einem Namen.
   *
   * Im Eintrag steht zwar ein Kuerzel, aber das ist eine Kopie vom Tag des
   * Anlegens. Wer die Flagge spaeter woanders pflegt - im Leaderboard, auf
   * einer Turnierkarte -, will sie hier genauso sehen. Deshalb gilt das
   * Profil, und das Kuerzel im Eintrag ist nur der Rueckfall.
   */
  landVon?: (name: string) => string | undefined;
  /**
   * Die Herkunft eines Spielers festhalten.
   *
   * Geschrieben wird ins Profil, nicht in den Tierlist-Eintrag: dieselbe
   * Flagge soll dann auch im Leaderboard und auf den Turnierkarten stehen.
   */
  onLand?: (name: string, land: string) => void;
  currentUser?: string;
  onDelete?: () => void;
  disabled?: boolean;
}

/**
 * PlayerCard: Displays a draggable player or duo card
 */
/**
 * Ein Name, der sich per Doppelklick aendern laesst.
 *
 * Bewusst kein Stift daneben: die Kacheln stehen dicht an dicht, und ein
 * weiteres Zeichen je Zeile machte die Reihe unruhig. Ein Doppelklick auf
 * den Namen oeffnet ihn, Enter uebernimmt, Escape verwirft.
 */
const NameFeld: React.FC<{
  klasse: string;
  wert: string;
  aendern?: (name: string) => void;
}> = ({ klasse, wert, aendern }) => {
  const t = useT();
  const [offen, setOffen] = React.useState(false);
  const [entwurf, setEntwurf] = React.useState(wert);

  if (!aendern) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={klasse}>{wert}</span>
      </div>
    );
  }

  if (offen) {
    return (
      <input
        className={`namensfeld ${klasse}`}
        autoFocus
        value={entwurf}
        onChange={(e) => setEntwurf(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onBlur={() => { aendern(entwurf); setOffen(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { aendern(entwurf); setOffen(false); }
          if (e.key === 'Escape') { setEntwurf(wert); setOffen(false); }
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className={klasse} title={t('Doppelklick zum Umbenennen')}
        style={{ cursor: 'text' }}
        onDoubleClick={(e) => { e.stopPropagation(); setEntwurf(wert); setOffen(true); }}>
        {wert}
      </span>
    </div>
  );
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  entry,
  variant = 'list',
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onReturnToPool,
  isAdmin = false,
  onRename,
  landVon,
  anzeigeVon,
  onLand,
  currentUser,
  onDelete,
  disabled = false,
}) => {
  const t = useT();
  const entryData = entry.data || {};
  const isDuoEntry = isDuo(entryData);

  /**
   * Bearbeitet wird nur in der Liste, nicht in der Tierliste.
   *
   * Eine Kachel, die schon auf einem Rang liegt, wird geschoben - nicht
   * geaendert. Stift und Doppelklick dort machen die Reihen unruhig und
   * fuehren dazu, dass man beim Sortieren versehentlich einen Namen
   * aufklappt. Wer etwas aendern will, tut es an einer Stelle: in der Liste
   * daneben, aus der die Kacheln kommen.
   */
  const bearbeitbar = variant === 'pool' && isAdmin && !disabled;

  let player1Country: string | undefined;
  let player2Country: string | undefined;
  let displayRegion: string;
  let player1Name: string;
  let player2Name: string | undefined;

  let player1Region: string | undefined;
  let player2Region: string | undefined;
  if (isDuoEntry) {
    const duo = entryData as any;
    player1Country = duo.player1?.countryCode;
    player2Country = duo.player2?.countryCode;
    player1Region = duo.player1?.region;
    player2Region = duo.player2?.region;
    displayRegion = duo.region || player1Region || player2Region || 'EU';
    player1Name = cleanPlayerName(duo.player1?.name || '');
    player2Name = cleanPlayerName(duo.player2?.name || '');
  } else {
    const player = entryData as any;
    player1Country = player.countryCode;
    player2Country = undefined;
    player1Region = getPrimaryRegion(player);
    displayRegion = player1Region;
    player1Name = cleanPlayerName(player.name || '');
    player2Name = undefined;
  }

  const isGlobal = !!entry.data.isGlobal;
  const [bearbeitet, setBearbeitet] = React.useState(false);
  // Solange das Fenster offen ist, darf die Kachel nicht gezogen werden -
  // sonst startet ein Zug, waehrend man im Namensfeld markiert.

  /*
   * Die Flagge zu einem Laenderkuerzel.
   *
   * "global" hat hier nichts mehr zu suchen. Vorher stand am Anfang
   *
   *     if (isGlobalFlag) return '/flags/flag-GLOBE.png';
   *
   * und damit gewann die Weltkugel gegen jede gepflegte Flagge. In der
   * Kachel sah man deshalb den Globus, waehrend im Bearbeiten-Fenster
   * daneben das richtige Land stand - dort wird das Kuerzel direkt
   * benutzt. Bei "Sky + Scroll" war sogar dk/dk gespeichert und trotzdem
   * nicht zu sehen.
   *
   * Dass jemand in mehreren Regionen spielt, zeigt ohnehin das eigene
   * Globus-Abzeichen weiter unten. Herkunft und Umherziehen sind zwei
   * verschiedene Angaben und brauchen zwei verschiedene Zeichen.
   */
  const getCountryFlag = (countryCode?: string) => {
    // Ohne bekannte Herkunft steht die Weltkugel, nicht irgendein Land.
    //
    // Vorher stand hier die Flagge der Vereinigten Staaten als Rueckfall -
    // das ist keine fehlende Angabe, sondern eine falsche: jeder Spieler
    // ohne gepflegtes Land sah nach einem Amerikaner aus.
    if (!countryCode) return '/flags/flag-GLOBE.png';
    return `/flags/${countryCode.toLowerCase()}.png`;
  };

  // Das Profil geht vor dem Kuerzel im Eintrag.
  const land1 = landVon?.(player1Name) ?? player1Country;
  const land2 = player2Name ? (landVon?.(player2Name) ?? player2Country) : player2Country;
  const flag1Url = getCountryFlag(land1);
  const flag2Url = isDuoEntry ? getCountryFlag(land2) : undefined;
  /*
   * Eine ganze Flagge nur, wenn beide wirklich dasselbe Land haben.
   *
   * Verglichen werden die aufgeloesten Werte, nicht die Kuerzel aus dem
   * Eintrag. Sonst wurde geteilt, obwohl beide Flaggen aus dem Profil kamen
   * und dieselbe waren.
   */
  const einLand = Boolean(land1 && land2
    && land1.toLowerCase() === land2.toLowerCase());

  /*
   * Was auf der Kachel steht - der gepflegte Name, sonst der aus dem Spiel.
   *
   * "player1Name" bleibt daneben stehen und wird nicht ersetzt: an ihm
   * haengen Flagge, Rangliste und das Zusammenlegen von Dubletten. Wer den
   * Anzeigenamen zum Schluessel machte, verloere all das beim ersten
   * Umbenennen.
   */
  const anzeige1 = anzeigeVon?.(player1Name) || player1Name;
  const anzeige2 = player2Name
    ? (anzeigeVon?.(player2Name) || player2Name) : player2Name;
  const cardClass = `${variant === 'pool' ? 'pool-duo-card' : 'duo-card'} ${isDuoEntry ? '' : 'solo-entry'}`;

  const isOwner = Boolean(
    currentUser &&
    (entry.localOnly || entry.data.createdBy?.trim().toLowerCase() === currentUser)
  );
  
  const regionText = displayRegion || 'Unknown';
  const regionClass = String(regionText).toLowerCase();

  return (
    <div
      draggable={!disabled && !bearbeitet}
      onClick={e => {
        if (!disabled && variant === 'list' && onReturnToPool) {
          e.stopPropagation();
          onReturnToPool();
        }
      }}
      onDragStart={disabled ? undefined : (event) => {
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', entry.id);
        } catch {
          // Some browsers require setData for drag to work reliably.
        }
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        if (disabled) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={disabled ? undefined : (event) => {
        event.preventDefault();
        onDrop?.(event);
      }}
      className={`${cardClass} ${isDragging ? 'dragging' : ''} ${disabled ? 'locked-card' : ''}`}
    >
      <div className="flag-badge-wrapper">
        {isDuoEntry ? (
          einLand ? (
            <img src={flag1Url} alt={land1} className="full-flag" />
          ) : (
            <>
              <div
                className="flag-half flag-half-left"
                style={{ backgroundImage: `url(${flag1Url})` }}
              />
              <div
                className="flag-half flag-half-right"
                style={{ backgroundImage: `url(${flag2Url})` }}
              />
            </>
          )
        ) : (
          <img src={flag1Url} alt={land1 ?? ''} className="full-flag" />
        )}
        {isGlobal && (
          <div className="global-flag-badge">
            <img src="/flags/flag-GLOBE.png" alt="Global" className="global-flag" title="Global Player" />
          </div>
        )}
      </div>
      <div className="player-names">
        {isDuoEntry ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <NameFeld klasse="player1" wert={anzeige1}
              aendern={bearbeitbar && onRename
                ? (n) => onRename(player1Name, n, 1) : undefined} />
            <NameFeld klasse="player2" wert={anzeige2 ?? ''}
              aendern={bearbeitbar && onRename
                ? (n) => onRename(player2Name ?? '', n, 2) : undefined} />
          </div>
        ) : (
          <NameFeld klasse="player1" wert={anzeige1}
            aendern={bearbeitbar && onRename
              ? (n) => onRename(player1Name, n) : undefined} />
        )}
      </div>
      {/* Stift und Kreuz sieht nur der Admin.
          Wer sich anmeldet, ohne Admin zu sein, legt sich seine eigene
          Auswahl an - an den offiziellen Eintraegen aendert er nichts.
          Frueher genuegte "ist der Ersteller", und ein hinzugefuegter
          Spieler liess sich auch von anderen umbenennen. */}
      {bearbeitbar && (onRename || onDelete) && (
        <div className="admin-card-actions">
          {(onRename || onLand) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setBearbeitet((b) => !b);
              }}
              className="admin-edit-btn"
              title={t('Name und Flagge ändern')}
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="admin-delete-btn"
              title="Delete entry"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Das Fenster haengt bewusst nicht in der Kachel, sondern direkt am
          Dokument.
          Als Kind der Kachel wanderte jeder Klick darin weiter zur Kachel:
          die reagiert auf Klick und Ziehen, und das Fenster flackerte oder
          das Flaggenraster schloss sich sofort wieder. Ueber ein Portal
          gibt es diesen Weg nicht mehr. */}
      {bearbeitet && typeof document !== 'undefined' && createPortal(
        <div className="kachel-bearbeiten-grund"
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setBearbeitet(false);
          }}>
          <div className="kachel-bearbeiten"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}>
            <p className="kachel-bearbeiten-titel">
              {isDuoEntry ? 'Duo bearbeiten' : 'Spieler bearbeiten'}
            </p>
            {(isDuoEntry ? [1, 2] : [1]).map((nr) => {
              // Der echte Name bleibt der Schluessel, im Feld steht der
              // gepflegte - genau das will man hier ja aendern.
              const name = nr === 1 ? player1Name : (player2Name ?? '');
              const gezeigt = (nr === 1 ? anzeige1 : anzeige2) ?? '';
              const land = (nr === 1
                ? (landVon?.(player1Name) ?? player1Country)
                : land2) ?? 'flag-GLOBE';
              return (
                <div key={nr} className="kachel-bearbeiten-zeile">
                  {/* Die Flagge gehoert zu den offiziellen Angaben und laesst
                      sich nur als Admin aendern. Wer keine Rechte hat, sieht
                      sie hier nur - der Name bleibt fuer jeden aenderbar. */}
                  {onLand ? (
                    <FlaggenWahl wert={land} groesse={26}
                      onWahl={(code) => onLand(name, code === 'flag-GLOBE' ? '' : code)} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/flags/${land || 'flag-GLOBE'}.png`} alt=""
                      style={{ width: 26, height: 26, borderRadius: '50%',
                               objectFit: 'cover', flex: '0 0 26px' }} />
                  )}
                  <input
                    defaultValue={gezeigt}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onRename?.(name, (e.target as HTMLInputElement).value, nr as 1 | 2);
                        setBearbeitet(false);
                      }
                      if (e.key === 'Escape') setBearbeitet(false);
                    }}
                    onBlur={(e) => onRename?.(name, e.target.value, nr as 1 | 2)}
                  />
                </div>
              );
            })}
            <p className="kachel-bearbeiten-hinweis">
              {onLand
                ? 'Die Flagge gilt danach überall — auch im Leaderboard und auf den Karten.'
                : 'Die Flagge lässt sich nur als Admin ändern.'}
            </p>
            <button type="button" className="kachel-fertig"
              onClick={() => setBearbeitet(false)}>fertig</button>
          </div>
        </div>,
        document.body,
      )}


    </div>
  );
};
