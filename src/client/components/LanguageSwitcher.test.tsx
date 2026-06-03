/**
 * Tests for LanguageSwitcher component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nextProvider } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { logger } from '../utils/logger.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';

/** Mock logger to verify error logging */
vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render LanguageSwitcher wrapped in I18nextProvider */
function renderWithProvider() {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(LanguageSwitcher),
    ),
  );
}

describe('LanguageSwitcher', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    i18nInstance = i18next.createInstance();
    await i18nInstance.use(initReactI18next).init({
      lng: 'zh-CN',
      fallbackLng: 'zh-CN',
      resources: {
        'zh-CN': { translation: zhCN },
        'en-US': { translation: enUS },
      },
      interpolation: { escapeValue: false },
    });
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    // Reset language to zh-CN after each test
    await act(async () => {
      await i18nInstance.changeLanguage('zh-CN');
    });
  });

  it('renders a language toggle button', () => {
    renderWithProvider();
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('renders with an aria-label', () => {
    renderWithProvider();
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBeTruthy();
  });

  it('persists language change to backend via PUT /openpowers/api/config', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');
    await user.click(button);

    expect(mockFetch).toHaveBeenCalledWith(
      '/openpowers/api/config',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('sends correct language field in PUT request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');
    await user.click(button);

    // zh-CN -> en-US should send language: 'english'
    expect(mockFetch).toHaveBeenCalledWith(
      '/openpowers/api/config',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ language: 'english' }),
      }),
    );
  });

  it('does not crash when PUT request fails with non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');

    // Should not throw
    await act(async () => {
      await user.click(button);
    });

    // Language should still change despite PUT failure
    expect(button.getAttribute('aria-label')).toBe('Switch to Chinese');
  });

  it('logs error when PUT request returns non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();
    vi.mocked(logger.error).mockClear();

    renderWithProvider();
    const button = screen.getByRole('button');

    await act(async () => {
      await user.click(button);
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist language'),
    );
  });

  it('logs error when PUT request is network unreachable', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();
    vi.mocked(logger.error).mockClear();

    renderWithProvider();
    const button = screen.getByRole('button');

    await act(async () => {
      await user.click(button);
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist language'),
    );
  });

  it('does not crash when PUT request is network unreachable', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');

    // Should not throw
    await act(async () => {
      await user.click(button);
    });

    // Language should still change despite network failure
    expect(button.getAttribute('aria-label')).toBe('Switch to Chinese');
  });

  it('switches from Chinese to English on click', async () => {
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');

    // Initially zh-CN, label is in current language (Chinese)
    expect(button.getAttribute('aria-label')).toBe('切换到英文');

    await user.click(button);

    // After click, en-US, label is in current language (English)
    expect(button.getAttribute('aria-label')).toBe('Switch to Chinese');
  });

  it('toggles back to Chinese on second click', async () => {
    const user = userEvent.setup();

    renderWithProvider();
    const button = screen.getByRole('button');

    // First click: zh-CN -> en-US, label is in English now
    await user.click(button);
    expect(button.getAttribute('aria-label')).toBe('Switch to Chinese');

    // Second click: en-US -> zh-CN, label is in Chinese now
    await user.click(button);
    expect(button.getAttribute('aria-label')).toBe('切换到英文');
  });
});
