/**
 * i18n initialization module.
 * Initializes i18next with translation resources and fetches the default
 * language from the backend config API on startup.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import { logger } from '../utils/logger.js';

/** Backend language value as stored in config. */
export type BackendLang = 'chinese' | 'english';

/** i18next locale identifier. */
export type Locale = 'zh-CN' | 'en-US';

/**
 * Maps a backend language value to the corresponding i18next locale.
 * 'chinese' -> 'zh-CN', 'english' -> 'en-US'
 */
export function backendLangToLocale(lang: BackendLang | string): Locale {
  if (lang === 'english') return 'en-US';
  return 'zh-CN';
}

/**
 * Maps an i18next locale to the HTML lang attribute value.
 * 'zh-CN' -> 'zh-CN', 'en-US' -> 'en'
 */
export function localeToHtmlLang(locale: Locale | string): string {
  if (locale === 'zh-CN') return 'zh-CN';
  return 'en';
}

/**
 * Fetches the default language from the backend config API and initializes
 * i18next with all translation resources. Falls back to 'chinese' (zh-CN)
 * if the backend is unreachable.
 */
export async function initI18n(): Promise<typeof i18next> {
  let backendLang: BackendLang = 'chinese';

  try {
    const response = await fetch('/openpowers/api/config');
    if (response.ok) {
      const data: { language?: BackendLang } = await response.json();
      if (data.language === 'chinese' || data.language === 'english') {
        backendLang = data.language;
      }
    }
  } catch (err) {
    logger.error(
      `Failed to fetch language config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const locale = backendLangToLocale(backendLang);

  await i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'zh-CN',
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
  });

  return i18next;
}
