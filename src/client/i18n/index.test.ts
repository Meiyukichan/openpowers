/**
 * Tests for i18n initialization module.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backendLangToLocale, localeToHtmlLang, initI18n } from './index.js';

describe('backendLangToLocale', () => {
  it('maps "chinese" to "zh-CN"', () => {
    expect(backendLangToLocale('chinese')).toBe('zh-CN');
  });

  it('maps "english" to "en-US"', () => {
    expect(backendLangToLocale('english')).toBe('en-US');
  });

  it('returns "zh-CN" for unknown values', () => {
    expect(backendLangToLocale('unknown' as 'chinese')).toBe('zh-CN');
  });
});

describe('localeToHtmlLang', () => {
  it('maps "zh-CN" to "zh-CN"', () => {
    expect(localeToHtmlLang('zh-CN')).toBe('zh-CN');
  });

  it('maps "en-US" to "en"', () => {
    expect(localeToHtmlLang('en-US')).toBe('en');
  });

  it('returns "en" for unknown locales', () => {
    expect(localeToHtmlLang('fr')).toBe('en');
  });
});

describe('initI18n', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches language from /openpowers/api/config and initializes i18next', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ language: 'english' }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const i18n = await initI18n();

    expect(mockFetch).toHaveBeenCalledWith('/openpowers/api/config');
    expect(i18n.language).toBe('en-US');
  });

  it('falls back to "zh-CN" when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const i18n = await initI18n();

    expect(i18n.language).toBe('zh-CN');
    // Should still have called fetch
    expect(mockFetch).toHaveBeenCalledWith('/openpowers/api/config');
  });

  it('falls back to "zh-CN" when response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const i18n = await initI18n();

    expect(i18n.language).toBe('zh-CN');
  });

  it('falls back to "zh-CN" when language field is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const i18n = await initI18n();

    expect(i18n.language).toBe('zh-CN');
  });
});
