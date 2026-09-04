export type Lang = 'de' | 'en';

export const translations: Record<Lang, Record<string, string>> = {
  de: {
    retry: 'Try again',
    whatThisIs: 'What this does',
    noAccess: 'No access?',
    contact: 'Contact',
    loading: 'Loading...',
    loginHint: 'Please sign in with your Discord account.',
    descriptionIntro: 'This tool shows the most important streaming and tournament data in one place.',
    liveStreamHub: '• Live-Stream Hub: Multyview or solo with EU/NA Pros.',
    customIntegration: '• Custom Integration: Add your own streamers.',
    tournamentTracker: '• Tournament Tracker: Current tournaments & live events.',
    noAccessQuestion: 'No access?',
    contactHint: 'If you believe you should have access, please contact me directly.',
    discord: 'Discord:',
    twitter: 'Twitter:',
    loginRestrictedNote: 'Note: Login is restricted to selected users. You can use the dashboard only if I have enabled your access.',
  },
  en: {
    retry: 'Try again',
    whatThisIs: 'What this does',
    noAccess: 'No access?',
    contact: 'Contact',
    loading: 'Loading...',
    loginHint: 'Please sign in with your Discord account.',
    descriptionIntro: 'This tool shows the most important streaming and tournament data in one place.',
    liveStreamHub: '• Live-Stream Hub: Multyview or solo with EU/NA Pros.',
    customIntegration: '• Custom Integration: Add your own streamers.',
    tournamentTracker: '• Tournament Tracker: Current tournaments & live events.',
    noAccessQuestion: 'No access?',
    contactHint: 'If you believe you should have access, please contact me directly.',
    discord: 'Discord:',
    twitter: 'Twitter:',
    loginRestrictedNote: 'Note: Login is restricted to selected users. You can use the dashboard only if I have enabled your access.',
  },
};

const getLang = (): Lang => {
  return 'en';
};

export const t = (key: string, fallback?: string) => {
  const lang = getLang();
  return translations[lang][key] ?? fallback ?? key;
};

export const addTranslation = (lang: Lang, key: string, value: string) => {
  translations[lang] = translations[lang] || {};
  translations[lang][key] = value;
};

export default { t, translations, addTranslation };
