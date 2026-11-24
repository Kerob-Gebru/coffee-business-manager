import { Language, LanguageOption, TranslationKey, Translations } from "./types";
import { en } from "./en";
import { am } from "./am";
import { om } from "./om";

export * from "./types";
export { en, am, om };

export const DEFAULT_LANGUAGE: Language = "en";

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    locale: "en-US",
  },
  {
    code: "am",
    name: "Amharic",
    nativeName: "አማርኛ",
    locale: "am-ET",
  },
  {
    code: "om",
    name: "Afaan Oromoo",
    nativeName: "Afaan Oromoo",
    locale: "om-ET",
  },
];

export const translations: Record<Language, Translations> = {
  en,
  am,
  om,
};

/**
 * Type-safe dot-notation translation resolver with fallback to English
 */
export function getTranslation(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const activeDict = translations[lang] || translations[DEFAULT_LANGUAGE];
  const fallbackDict = translations[DEFAULT_LANGUAGE];

  const value = resolveKeyPath(activeDict, key) ?? resolveKeyPath(fallbackDict, key) ?? key;

  if (typeof value !== "string") {
    return key;
  }

  if (!params) {
    return value;
  }

  return Object.entries(params).reduce((acc, [paramKey, paramVal]) => {
    return acc.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramVal));
  }, value);
}

function resolveKeyPath(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== "object") return undefined;
    curr = curr[part];
  }
  return typeof curr === "string" ? curr : undefined;
}
