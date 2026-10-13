/*
 * Die Eckdaten der FNCS-Endspiele: Preisgeld, Teamzahl, Ort und die ersten fuenf Plaetze mit ihrem Preisgeld.
 *
 * Der Betreiber (13.10.2026): "bei jeder muss die Leaderboard dort sein", gerade bei den aelteren Finals und der Summit, zu denen
 * es bei Epic keine Bestenliste mehr gibt. Das sind oeffentliche Ergebnisse (wer wurde Erster, Zweiter ... und was gab es dafuer);
 * sie stehen hier als Tatsachen. Wo Epics Bestenliste zum Event vorhanden ist (ab Chapter 5 Season 3), gilt diese fuer Plaetze und
 * Punkte - das Preisgeld je Platz kommt dann von hier. Vollstaendige Tabellen aelterer Finals tippt der Admin von Hand ein
 * (alte Maps); hier stehen nur die ersten fuenf.
 *
 * Schluessel: "<Saison>|<Art>" mit Art gf (Grand Finals), gc (Global Championship), invitational, summit, royale, allstar.
 * Datum als "JJJJ-MM-TT".
 */

export interface FncsPlatz { rang: number; spieler: string[]; preis: string }
export interface FncsFakt {
  nr: number; kopf1: string; kopf2: string; titel: string; datum: string; preisgeld: string; teams: number;
  ort?: string; lan?: boolean; top: FncsPlatz[];
}

export const FNCS_FAKTEN: Record<string, FncsFakt> = {
  'S10|gf': {
    nr: 1, kopf1: 'CH1 SX', kopf2: 'GRAND FINALS', titel: 'CH1 SX', datum: '2019-09-22', preisgeld: '$1.2M', teams: 32,
    top: [{ rang: 1, spieler: ['TSCHINKEN', 'STOMPY', 'AQUA'], preis: '$480K' }, { rang: 2, spieler: ['ENDRETTA', 'RITZ', 'PATE1K'], preis: '$216K' }, { rang: 3, spieler: ['BOYER', 'VEROX', 'MOTOR'], preis: '$144K' }, { rang: 4, spieler: ['T0HAJ', 'BELAEU', 'KAXIE'], preis: '$53K' }, { rang: 5, spieler: ['CRUE', 'BEEHIVE', 'CHAPIX'], preis: '$19K' }],
  },
  'S11|gf': {
    nr: 2, kopf1: 'CH2 S1', kopf2: 'GRAND FINALS', titel: 'CH2 S1', datum: '2019-12-08', preisgeld: '$919K', teams: 24,
    top: [{ rang: 1, spieler: ['REDRUSH', 'DROBBAN', 'ZNAPPY', 'WAKIE'], preis: '$300K' }, { rang: 2, spieler: ['MONGRAAL', 'BENJYFISHY', 'WOLFIEZ', 'NAYTE'], preis: '$120K' }, { rang: 3, spieler: ['AIRWAKS', 'NIKOF', 'SKITE', 'VATO'], preis: '$96K' }, { rang: 4, spieler: ['KAMO', 'PEPPER', 'FLEDERMOYS', 'RIJAS'], preis: '$72K' }, { rang: 5, spieler: ['TEEQ', 'RAKSO', '3VIL', 'KUBX'], preis: '$60K' }],
  },
  'S12|gf': {
    nr: 3, kopf1: 'CH2 S2', kopf2: 'GRAND FINALS', titel: 'CH2 S2', datum: '2020-04-19', preisgeld: '$524K', teams: 48,
    top: [{ rang: 1, spieler: ['ANDILEX', 'NAYTE'], preis: '$70K' }, { rang: 2, spieler: ['QUEASY', 'TRULEX'], preis: '$60K' }, { rang: 3, spieler: ['RAKSO', 'ARTOR'], preis: '$55K' }, { rang: 4, spieler: ['STOMPY', 'AQUA'], preis: '$45K' }, { rang: 5, spieler: ['KUBX', 'KAMI'], preis: '$40K' }],
  },
  'S12|invitational': {
    nr: 4, kopf1: 'CH2 S2', kopf2: 'GRAND FINALS', titel: 'CH2 S2 Invitational', datum: '2020-05-24', preisgeld: '$599K', teams: 100,
    top: [{ rang: 1, spieler: ['JANNISZ'], preis: '$120K' }, { rang: 2, spieler: ['WOLFIEZ'], preis: '$95K' }, { rang: 3, spieler: ['AQUA'], preis: '$70K' }, { rang: 4, spieler: ['TH0MASHD'], preis: '$60K' }, { rang: 5, spieler: ['TAYSON'], preis: '$50K' }],
  },
  'S13|gf': {
    nr: 5, kopf1: 'CH2 S3', kopf2: 'GRAND FINALS', titel: 'CH2 S3', datum: '2020-08-16', preisgeld: '$475K', teams: 100,
    top: [{ rang: 1, spieler: ['TAYSON'], preis: '$80K' }, { rang: 2, spieler: ['DECYPTOS'], preis: '$55K' }, { rang: 3, spieler: ['AYARBAFFO'], preis: '$45K' }, { rang: 4, spieler: ['HEN'], preis: '$40K' }, { rang: 5, spieler: ['SNAYZY'], preis: '$30K' }],
  },
  'S14|gf': {
    nr: 6, kopf1: 'CH2 S4', kopf2: 'GRAND FINALS', titel: 'CH2 S4', datum: '2020-11-01', preisgeld: '$624K', teams: 33,
    top: [{ rang: 1, spieler: ['MONGRAAL', 'MITR0', 'TAYSON'], preis: '$111K' }, { rang: 2, spieler: ['ANDILEX', 'XSWEEZE', 'JANNISZ'], preis: '$93K' }, { rang: 3, spieler: ['TH0MASHD', 'ANAS', 'FLIKK'], preis: '$75K' }, { rang: 4, spieler: ['KAMI', 'RAKSO', 'ARTOR'], preis: '$60K' }, { rang: 5, spieler: ['FLOWIS', 'LOUIS', 'ENDRETTA'], preis: '$45K' }],
  },
  'S15|gf': {
    nr: 7, kopf1: 'CH2 S5', kopf2: 'GRAND FINALS', titel: 'CH2 S5', datum: '2021-03-14', preisgeld: '$1.35M', teams: 33,
    top: [{ rang: 1, spieler: ['HEN', 'JANNISZ', 'CHAPIX'], preis: '$300K' }, { rang: 2, spieler: ['TH0MASHD', 'ANAS', 'FLIKK'], preis: '$210K' }, { rang: 3, spieler: ['VADEAL', 'NOAHREYLI', 'REZON'], preis: '$135K' }, { rang: 4, spieler: ['ANDILEX', 'SNAYZY', 'XSWEEZE'], preis: '$120K' }, { rang: 5, spieler: ['UMPLIFY', 'MATSOE', 'BENJYFISHY'], preis: '$105K' }],
  },
  'S16|gf': {
    nr: 8, kopf1: 'CH2 S6', kopf2: 'GRAND FINALS', titel: 'CH2 S6', datum: '2021-05-30', preisgeld: '$1.34M', teams: 32,
    top: [{ rang: 1, spieler: ['QUEASY', 'TRULEX', 'JUR3KY'], preis: '$300K' }, { rang: 2, spieler: ['REFSGAARD', 'ENDRETTA', 'MRSAVAGE'], preis: '$210K' }, { rang: 3, spieler: ['4ZR', 'TAYSON', 'NAYTE'], preis: '$135K' }, { rang: 4, spieler: ['TH0MASHD', 'ANAS', 'FLIKK'], preis: '$120K' }, { rang: 5, spieler: ['VADEAL', 'NOAHREYLI', 'REZON'], preis: '$105K' }],
  },
  'S17|allstar': {
    nr: 9, kopf1: 'CH2 S7', kopf2: 'GRAND FINALS', titel: 'CH2 S7 All-Star Solo', datum: '2021-06-26', preisgeld: '$1.14M', teams: 100,
    top: [{ rang: 1, spieler: ['TAYSON'], preis: '$150K' }, { rang: 2, spieler: ['VENO'], preis: '$120K' }, { rang: 3, spieler: ['AIRKNN'], preis: '$100K' }, { rang: 4, spieler: ['NEBS'], preis: '$80K' }, { rang: 5, spieler: ['K1NZELL'], preis: '$70K' }],
  },
  'S17|gf': {
    nr: 10, kopf1: 'CH2 S7', kopf2: 'GRAND FINALS', titel: 'CH2 S7', datum: '2021-09-05', preisgeld: '$1.35M', teams: 33,
    top: [{ rang: 1, spieler: ['KIRYACHE', 'STORMYRITE', 'TOOSE'], preis: '$300K' }, { rang: 2, spieler: ['HOTTIE', 'ELOKRATZ', 'TRIPPERNN'], preis: '$210K' }, { rang: 3, spieler: ['PINQ', 'NEBS', 'STOMPY'], preis: '$135K' }, { rang: 4, spieler: ['SETTY', 'KAMI', 'TEEQ'], preis: '$120K' }, { rang: 5, spieler: ['VENO', 'TAYSON', 'REZON'], preis: '$105K' }],
  },
  'S18|gf': {
    nr: 11, kopf1: 'CH2 S8', kopf2: 'GRAND FINALS', titel: 'CH2 S8', datum: '2021-10-31', preisgeld: '$1.35M', teams: 33,
    top: [{ rang: 1, spieler: ['SETTY', 'KAMI', 'TEEQ'], preis: '$300K' }, { rang: 2, spieler: ['FLOWIS', 'HELLFIRE', 'SKRAM'], preis: '$210K' }, { rang: 3, spieler: ['CRR', 'FASTROKI', 'AQUA'], preis: '$135K' }, { rang: 4, spieler: ['FLOKI', 'CLEMENT', 'DECYPTOS'], preis: '$120K' }, { rang: 5, spieler: ['KIRYACHE', 'STORMYRITE', 'TOOSE'], preis: '$105K' }],
  },
  'S18|royale': {
    nr: 12, kopf1: 'CH2 S8', kopf2: 'GRAND FINALS', titel: 'CH2 S8 Grand Royale', datum: '2021-11-21', preisgeld: '$2.25M', teams: 33,
    top: [{ rang: 1, spieler: ['HEN', 'TAYSON', 'CHAPIX'], preis: '$600K' }, { rang: 2, spieler: ['SETTY', 'KAMI', 'TEEQ'], preis: '$450K' }, { rang: 3, spieler: ['QUEASY', 'ANAS', 'TH0MASHD'], preis: '$270K' }, { rang: 4, spieler: ['VADEAL', 'JANNISZ', 'NOAHREYLI'], preis: '$180K' }, { rang: 5, spieler: ['SAFIK', '1LUSHA', 'PUTRICK'], preis: '$120K' }],
  },
  'S19|gf': {
    nr: 13, kopf1: 'CH3 S1', kopf2: 'GRAND FINALS', titel: 'CH3 S1', datum: '2022-03-06', preisgeld: '$1.36M', teams: 50,
    top: [{ rang: 1, spieler: ['HEN', 'QUEASY'], preis: '$300K' }, { rang: 2, spieler: ['KIRYACHE', 'STORMYRITE'], preis: '$200K' }, { rang: 3, spieler: ['TAYSON', 'TH0MASHD'], preis: '$150K' }, { rang: 4, spieler: ['VORTEX', 'JANNISZ'], preis: '$120K' }, { rang: 5, spieler: ['TRULEX', 'CHICO'], preis: '$100K' }],
  },
  'S20|gf': {
    nr: 14, kopf1: 'CH3 S2', kopf2: 'GRAND FINALS', titel: 'CH3 S2', datum: '2022-05-29', preisgeld: '$1.36M', teams: 50,
    top: [{ rang: 1, spieler: ['VENO', 'AQUA'], preis: '$300K' }, { rang: 2, spieler: ['TAYSON', 'CHAPIX'], preis: '$200K' }, { rang: 3, spieler: ['TRIPPERNN', 'TH0MASHD'], preis: '$150K' }, { rang: 4, spieler: ['MERSTACH', 'MALIBUCA'], preis: '$120K' }, { rang: 5, spieler: ['SETTY', 'KAMI'], preis: '$100K' }],
  },
  'S21|gf': {
    nr: 15, kopf1: 'CH3 S3', kopf2: 'GRAND FINALS', titel: 'CH3 S3', datum: '2022-08-14', preisgeld: '$1.36M', teams: 50,
    top: [{ rang: 1, spieler: ['VADEAL', 'JANNISZ'], preis: '$300K' }, { rang: 2, spieler: ['MERSTACH', 'MALIBUCA'], preis: '$200K' }, { rang: 3, spieler: ['QUEASY', 'VENO'], preis: '$150K' }, { rang: 4, spieler: ['JOE', 'ZANDY'], preis: '$120K' }, { rang: 5, spieler: ['PINQ', 'ANAS'], preis: '$100K' }],
  },
  'S22|invitational': {
    nr: 16, kopf1: '2022', kopf2: 'INVITATIONAL', titel: 'Invitational 2022', datum: '2022-11-13', preisgeld: '$1M', teams: 50, ort: 'Raleigh', lan: true,
    top: [{ rang: 1, spieler: ['KAMI', 'SETTY'], preis: '$200K' }, { rang: 2, spieler: ['QUEASY', 'VENO'], preis: '$140K' }, { rang: 3, spieler: ['COLD', 'CENTED'], preis: '$120K' }, { rang: 4, spieler: ['TH0MASHD', 'TRIPPERNN'], preis: '$90K' }, { rang: 5, spieler: ['PHZIN', 'KITOZ'], preis: '$70K' }],
  },
  'S23|gf': {
    nr: 17, kopf1: 'CH4 S1', kopf2: 'GRAND FINALS', titel: 'CH4 S1', datum: '2023-03-04', preisgeld: '$910K', teams: 50,
    top: [{ rang: 1, spieler: ['MERSTACH', 'TAYSON'], preis: '$200K' }, { rang: 2, spieler: ['MALIBUCA', 'TH0MASHD'], preis: '$120K' }, { rang: 3, spieler: ['JANNISZ', 'REZON'], preis: '$100K' }, { rang: 4, spieler: ['QUEASY', 'VENO'], preis: '$80K' }, { rang: 5, spieler: ['PIXIE', 'DELA'], preis: '$60K' }],
  },
  'S24|gf': {
    nr: 18, kopf1: 'CH4 S2', kopf2: 'GRAND FINALS', titel: 'CH4 S2', datum: '2023-05-14', preisgeld: '$910K', teams: 50,
    top: [{ rang: 1, spieler: ['QUEASY', 'VENO'], preis: '$200K' }, { rang: 2, spieler: ['MERSTACH', 'TAYSON'], preis: '$120K' }, { rang: 3, spieler: ['MALIBUCA', 'TH0MASHD'], preis: '$100K' }, { rang: 4, spieler: ['VANYAK3K', 'KARMY'], preis: '$80K' }, { rang: 5, spieler: ['SETTY', 'KAMI'], preis: '$60K' }],
  },
  'S25|gf': {
    nr: 19, kopf1: 'CH4 S3', kopf2: 'GRAND FINALS', titel: 'CH4 S3', datum: '2023-08-13', preisgeld: '$960K', teams: 50,
    top: [{ rang: 1, spieler: ['SWIZZY', 'PUTRICK'], preis: '$200K' }, { rang: 2, spieler: ['TRULEX', 'CHICO'], preis: '$120K' }, { rang: 3, spieler: ['MISHA', 'T3ENY'], preis: '$100K' }, { rang: 4, spieler: ['SETTY', 'KAMI'], preis: '$80K' }, { rang: 5, spieler: ['BLACHA', 'MIKSON'], preis: '$60K' }],
  },
  'S26|gc': {
    nr: 20, kopf1: '2023', kopf2: 'GLOBAL CHAMPIONSHIP', titel: 'Global Championship 2023', datum: '2023-10-16', preisgeld: '$3.9M', teams: 50, ort: 'Copenhagen', lan: true,
    top: [{ rang: 1, spieler: ['COOPER', 'MERO'], preis: '$1M' }, { rang: 2, spieler: ['SETTY', 'KAMI'], preis: '$650K' }, { rang: 3, spieler: ['TRULEX', 'CHICO'], preis: '$400K' }, { rang: 4, spieler: ['CHEATIIN', 'PIXIE'], preis: '$300K' }, { rang: 5, spieler: ['MKMKPAPA', 'SHELOM'], preis: '$200K' }],
  },
  'S28|gf': {
    nr: 21, kopf1: 'CH5 S1', kopf2: 'GRAND FINALS', titel: 'CH5 S1', datum: '2024-02-25', preisgeld: '$880K', teams: 50,
    top: [{ rang: 1, spieler: ['MERSTACH', 'MALIBUCA'], preis: '$170K' }, { rang: 2, spieler: ['QUEASY', 'TH0MASHD'], preis: '$120K' }, { rang: 3, spieler: ['KIRO', 'KIDUOO'], preis: '$100K' }, { rang: 4, spieler: ['SANGILD', 'MARIUSCOW'], preis: '$80K' }, { rang: 5, spieler: ['VICO', 'PINQ'], preis: '$60K' }],
  },
  'S29|gf': {
    nr: 22, kopf1: 'CH5 S2', kopf2: 'GRAND FINALS', titel: 'CH5 S2', datum: '2024-05-19', preisgeld: '$880K', teams: 50,
    top: [{ rang: 1, spieler: ['SWIZZY', 'VANYAK3K'], preis: '$170K' }, { rang: 2, spieler: ['CHAP', 'T3ENY'], preis: '$120K' }, { rang: 3, spieler: ['SETTY', 'KAMI'], preis: '$100K' }, { rang: 4, spieler: ['VADEAL', 'REZON'], preis: '$80K' }, { rang: 5, spieler: ['ANDILEX', 'SEYYTO'], preis: '$60K' }],
  },
  'S30|gf': {
    nr: 23, kopf1: 'CH5 S3', kopf2: 'GRAND FINALS', titel: 'CH5 S3', datum: '2024-07-28', preisgeld: '$880K', teams: 50,
    top: [{ rang: 1, spieler: ['VICO', 'FLICKZY'], preis: '$170K' }, { rang: 2, spieler: ['CHAP', 'T3ENY'], preis: '$120K' }, { rang: 3, spieler: ['SWIZZY', 'VANYAK3K'], preis: '$100K' }, { rang: 4, spieler: ['MERSTACH', 'MALIBUCA'], preis: '$80K' }, { rang: 5, spieler: ['VADEAL', 'REZON'], preis: '$60K' }],
  },
  'S31|gc': {
    nr: 24, kopf1: '2024', kopf2: 'GLOBAL CHAMPIONSHIP', titel: 'Global Championship 2024', datum: '2024-09-08', preisgeld: '$2M', teams: 50, ort: 'Fort Worth', lan: true,
    top: [{ rang: 1, spieler: ['PETERBOT', 'POLLO'], preis: '$400K' }, { rang: 2, spieler: ['QUEASY', 'TH0MASHD'], preis: '$300K' }, { rang: 3, spieler: ['TRULEX', 'CHICO'], preis: '$200K' }, { rang: 4, spieler: ['VICO', 'FLICKZY'], preis: '$160K' }, { rang: 5, spieler: ['P1NGFNZ', 'WOX'], preis: '$120K' }],
  },
  'S33|gf': {
    nr: 25, kopf1: 'CH6 S1', kopf2: 'GRAND FINALS', titel: 'CH6 S1', datum: '2025-02-16', preisgeld: '$272K', teams: 33,
    top: [{ rang: 1, spieler: ['VICO', 'VENO', 'FLICKZY'], preis: '$60K' }, { rang: 2, spieler: ['P1NGFNZ', 'WOX', 'MALIBUCA'], preis: '$40K' }, { rang: 3, spieler: ['VANYAK3K', 'PIXIE', 'MARIUSCOW'], preis: '$27K' }, { rang: 4, spieler: ['SWIZZY', 'QUEASY', 'MERSTACH'], preis: '$20K' }, { rang: 5, spieler: ['PIXX', 'DARM', 'DEMUŚ'], preis: '$16K' }],
  },
  'S34|gf': {
    nr: 26, kopf1: 'CH6 S2', kopf2: 'GRAND FINALS', titel: 'CH6 S2', datum: '2025-04-27', preisgeld: '$272K', teams: 33,
    top: [{ rang: 1, spieler: ['VANYAK3K', 'PIXIE', 'MARIUSCOW'], preis: '$60K' }, { rang: 2, spieler: ['TJINO', 'PABLOWINGU', 'FREDOXIE'], preis: '$40K' }, { rang: 3, spieler: ['PIXX', 'DARM', 'DEMUŚ'], preis: '$27K' }, { rang: 4, spieler: ['P1NGFNZ', 'WOX', 'MALIBUCA'], preis: '$20K' }, { rang: 5, spieler: ['SWIZZY', 'QUEASY', 'MERSTACH'], preis: '$16K' }],
  },
  'S36|gf': {
    nr: 27, kopf1: 'CH6 S3', kopf2: 'GRAND FINALS', titel: 'CH6 S3', datum: '2025-08-03', preisgeld: '$272K', teams: 33,
    top: [{ rang: 1, spieler: ['TJINO', 'PABLOWINGU', 'FREDOXIE'], preis: '$60K' }, { rang: 2, spieler: ['VICO', 'VENO', 'FLICKZY'], preis: '$40K' }, { rang: 3, spieler: ['VANYAK3K', 'PIXIE', 'MARIUSCOW'], preis: '$27K' }, { rang: 4, spieler: ['SETTY', 'JAPKO', 'PANZER'], preis: '$20K' }, { rang: 5, spieler: ['HRIS', 'TAYSON', 'CHICO'], preis: '$16K' }],
  },
  'S37|gc': {
    nr: 28, kopf1: '2025', kopf2: 'GLOBAL CHAMPIONSHIP', titel: 'Global Championship 2025', datum: '2025-09-07', preisgeld: '$2M', teams: 33, ort: 'Lyon', lan: true,
    top: [{ rang: 1, spieler: ['SWIZZY', 'QUEASY', 'MERSTACH'], preis: '$450K' }, { rang: 2, spieler: ['VANYAK3K', 'PIXIE', 'MARIUSCOW'], preis: '$300K' }, { rang: 3, spieler: ['SETTY', 'JAPKO', 'PANZER'], preis: '$225K' }, { rang: 4, spieler: ['IDROP', 'CHARYY', 'KAMI'], preis: '$180K' }, { rang: 5, spieler: ['RAPID', 'KHANADA', 'BOLTZ'], preis: '$135K' }],
  },
  'S40|gf': {
    nr: 29, kopf1: 'CH7 S2', kopf2: 'GRAND FINALS', titel: 'CH7 S2', datum: '2026-04-25', preisgeld: '$592K', teams: 50,
    top: [{ rang: 1, spieler: ['SKY', 'SCROLL'], preis: '$120K' }, { rang: 2, spieler: ['TJINO', 'PABLOWINGU'], preis: '$80K' }, { rang: 3, spieler: ['VICO', 'MALIBUCA'], preis: '$60K' }, { rang: 4, spieler: ['FOCUS', 'TH0MASHD'], preis: '$50K' }, { rang: 5, spieler: ['SHXRK', 'T3ENY'], preis: '$40K' }],
  },
  'S40|summit': {
    nr: 30, kopf1: 'MAJOR 1', kopf2: 'SUMMIT', titel: 'Major 1 Summit', datum: '2026-05-31', preisgeld: '$1.2M', teams: 50, ort: 'Düsseldorf', lan: true,
    top: [{ rang: 1, spieler: ['VICO', 'MALIBUCA'], preis: '$250K' }, { rang: 2, spieler: ['POLLO', 'PETERBOT'], preis: '$150K' }, { rang: 3, spieler: ['T3ENY', 'SHXRK'], preis: '$100K' }, { rang: 4, spieler: ['SKY', 'SCROLL'], preis: '$70K' }, { rang: 5, spieler: ['ACORN', 'BOLTZ'], preis: '$60K' }],
  },
};

/** "2019-09-22" -> Zeitstempel (Mittag UTC). */
export function faktDatum(d: string): number {
  return Date.parse(`${d}T12:00:00Z`);
}
