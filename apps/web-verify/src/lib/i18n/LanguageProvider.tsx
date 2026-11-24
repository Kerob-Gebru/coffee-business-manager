"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import {
  Language,
  LanguageOption,
  TranslationKey,
  Translations,
} from "./types";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getTranslation,
  translations,
} from "./index";

const STORAGE_KEY = "coffee_manager_language";

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  tRaw: Translations;
  locale: string;
  languages: LanguageOption[];
  isLoaded: boolean;
}

const defaultContextValue: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key, params) => getTranslation(DEFAULT_LANGUAGE, key, params),
  tRaw: translations[DEFAULT_LANGUAGE],
  locale: "en-US",
  languages: SUPPORTED_LANGUAGES,
  isLoaded: false,
};

const LanguageContext = createContext<LanguageContextValue>(defaultContextValue);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from localStorage on client-side mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored && (stored === "en" || stored === "am" || stored === "om")) {
        setLanguageState(stored);
        document.documentElement.lang = stored;
      } else {
        document.documentElement.lang = DEFAULT_LANGUAGE;
      }
    } catch {
      // Storage unavailable / blocked
      document.documentElement.lang = DEFAULT_LANGUAGE;
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const setLanguage = useCallback((newLang: Language) => {
    if (newLang === "en" || newLang === "am" || newLang === "om") {
      setLanguageState(newLang);
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch {}
      if (typeof document !== "undefined") {
        document.documentElement.lang = newLang;
      }
    }
  }, []);

  const locale = useMemo(() => {
    const opt = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    return opt?.locale || "en-US";
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      return getTranslation(language, key, params);
    },
    [language]
  );

  const tRaw = useMemo(() => {
    return translations[language] || translations[DEFAULT_LANGUAGE];
  }, [language]);

  const contextValue = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t,
    tRaw,
    locale,
    languages: SUPPORTED_LANGUAGES,
    isLoaded,
  }), [language, setLanguage, t, tRaw, locale, isLoaded]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  return context || defaultContextValue;
}

export const useLanguage = useTranslation;
