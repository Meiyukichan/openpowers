/**
 * LanguageSwitcher component provides a language toggle button.
 * Switches between Chinese (zh-CN) and English (en-US) instantly
 * and persists the choice to the backend via PUT /openpowers/api/config.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../i18n/index.js';
import { logger } from '../utils/logger.js';

/**
 * LanguageSwitcher renders a button that toggles between Chinese and English.
 * On each click, it switches the active language via i18next and persists
 * the choice to the backend config API.
 */
export function LanguageSwitcher(): React.ReactElement {
  const { i18n, t } = useTranslation();

  const targetLocale: Locale = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN';
  const label = targetLocale === 'zh-CN' ? t('app.languageSwitchToChinese') : t('app.languageSwitchToEnglish');

  const handleToggle = useCallback(async () => {
    const newLocale: Locale = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN';
    await i18n.changeLanguage(newLocale);

    // Persist to backend
    const backendLang = newLocale === 'zh-CN' ? 'chinese' : 'english';
    try {
      const response = await fetch('/openpowers/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: backendLang }),
      });
      if (!response.ok) {
        logger.error(
          `Failed to persist language: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (err) {
      logger.error(
        `Failed to persist language: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [i18n]);

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: handleToggle,
      'aria-label': label,
      className:
        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted',
    },
    label,
  );
}
