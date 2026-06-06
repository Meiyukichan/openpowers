/**
 * Tests for App component - localStorage activeView persistence.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import zhCN from './i18n/locales/zh-CN.json';
import enUS from './i18n/locales/en-US.json';

// Mock logger to avoid actual logging
vi.mock('./utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockProviders = [
  {
    id: 'id-1',
    name: 'Provider One',
    notes: 'First provider',
    websiteUrl: 'https://one.example.com',
    apiKey: '',
    baseUrl: 'https://api.one.example.com',
    icon: 'sparkles',
    iconColor: '#d97706',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Helper to create a fetch mock that routes by URL */
function createMockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (url === '/openpowers/api/providers/active') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ activeProviderId: null }),
      });
    }
    if (url === '/openpowers/api/providers/proxy') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ enableOpenpowersProxy: false }),
      });
    }
    if (url === '/openpowers/api/providers') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProviders),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(null),
    });
  });
}

let i18nInstance: i18next.i18n;

describe('App - localStorage activeView persistence', () => {
  let localStorageStore: Record<string, string>;

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
    localStorageStore = {};
    const storageMock: Storage = {
      getItem: vi.fn((key: string) => {
        const val = localStorageStore[key];
        return val !== undefined ? val : null;
      }),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
      get length() {
        return Object.keys(localStorageStore).length;
      },
      key: vi.fn((index: number) => {
        return Object.keys(localStorageStore)[index] ?? null;
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
    });

    vi.stubGlobal('fetch', createMockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderApp() {
    return render(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(React.lazy(() => import('./App.js').then(mod => ({ default: mod.App }))), null),
      ),
    );
  }

  it('should default activeView to providers when localStorage is empty', async () => {
    const { App } = await import('./App.js');

    render(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(App),
      ),
    );

    // The default activeView is 'providers' so ProviderList should render providers
    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
    });
  });

  it('should restore activeView from localStorage when stored value is projects', async () => {
    localStorage.setItem('openpowers:activeView', 'projects');

    const { App } = await import('./App.js');

    render(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(App),
      ),
    );

    // When activeView is 'projects', sidebar (ProjectSidebar) should be shown,
    // and the provider list should NOT be rendered
    await screen.findByText('OpenPowers');

    // ProviderList content should NOT be visible when in projects view
    // The fetch for providers is triggered but the ProviderList component
    // is conditionally rendered as null when activeView !== 'providers'
    expect(screen.queryByText('Provider One')).not.toBeInTheDocument();
  });

  it('should persist activeView to localStorage when view changes', async () => {
    localStorage.removeItem('openpowers:activeView');

    const { App } = await import('./App.js');

    render(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(App),
      ),
    );

    await screen.findByText('OpenPowers');

    // Click the projects tab in ActivityBar
    const projectsButton = screen.getByLabelText('项目管理');
    await userEvent.setup().click(projectsButton);

    // After clicking, localStorage should have saved 'projects'
    expect(localStorage.getItem('openpowers:activeView')).toBe('projects');
  });

  it('should handle localStorage getItem throwing an error', async () => {
    const throwingStorage: Storage = {
      getItem: vi.fn(() => {
        throw new Error('localStorage unavailable');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      get length() {
        return 0;
      },
      key: vi.fn(() => null),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      writable: true,
    });

    const { App } = await import('./App.js');

    // Should NOT crash
    expect(() => {
      render(
        React.createElement(
          I18nextProvider,
          { i18n: i18nInstance },
          React.createElement(App),
        ),
      );
    }).not.toThrow();

    await screen.findByText('OpenPowers');
  });

  it('should handle localStorage setItem throwing an error', async () => {
    const throwingStorage: Storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('storage full');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      get length() {
        return 0;
      },
      key: vi.fn(() => null),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      writable: true,
    });

    const { App } = await import('./App.js');

    render(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(App),
      ),
    );

    await screen.findByText('OpenPowers');

    // Click the projects tab - should not crash even though setItem throws
    const projectsButton = screen.getByLabelText('项目管理');
    await userEvent.setup().click(projectsButton);

    // App should still be functional (no crash)
    expect(screen.getByText('OpenPowers')).toBeInTheDocument();
  });
});
