"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { t as defaultT, type Lang } from "@/app/lib/i18n";

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("multihub_lang") : null;
      if (stored === "en") return "en";
    } catch (e) {
      // ignore
    }
    return "de";
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("multihub_lang", lang);
        document.documentElement.lang = lang === "en" ? "en" : "de";
      }
    } catch (e) {
      // ignore
    }
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);

  const translate = (key: string, fallback?: string) => {
    return defaultT(key, fallback);
  };

  return <I18nContext.Provider value={{ lang, setLang, t: translate }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

export default LanguageProvider;

