/**
 * LanguageSwitcher component provides a language toggle button.
 * Shows current language code (中 / EN) and toggles on click.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../i18n/index.js';
import { logger } from '../utils/logger.js';

export function LanguageSwitcher(): React.ReactElement {
  const { i18n } = useTranslation();

  const isZh = i18n.language === 'zh-CN';
  const label = isZh ? 'Switch to English' : '切换到中文';
  const displayText = isZh ? '中' : 'EN';

  const handleToggle = useCallback(async () => {
    const newLocale: Locale = isZh ? 'en-US' : 'zh-CN';
    await i18n.changeLanguage(newLocale);

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
  }, [i18n, isZh]);

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: handleToggle,
      'aria-label': label,
      title: label,
      className:
        'inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-semibold transition-colors hover:bg-accent text-muted-foreground hover:text-foreground',
    },
    displayText,
  );
}
