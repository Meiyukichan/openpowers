/**
 * Tests for ProviderList component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ProviderList } from './ProviderList.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render ProviderList wrapped in I18nextProvider */
function renderProviderList(props: Record<string, unknown> = {}) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
        ...props,
      }),
    ),
  );
}

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
  {
    id: 'id-2',
    name: 'Provider Two',
    notes: 'Second provider',
    websiteUrl: 'https://two.example.com',
    apiKey: '',
    baseUrl: 'https://api.two.example.com',
    icon: 'cpu',
    iconColor: '#10a37f',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('ProviderList', () => {
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
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading skeleton when fetching', () => {
    vi.mocked(fetch).mockReturnValue(
      new Promise(() => {
        // never resolves - stays in loading state
      }) as Promise<Response>,
    );

    renderProviderList();

    // Loading skeleton should have placeholder divs
    const skeletonCards = document.querySelectorAll('.animate-pulse');
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it('renders provider cards after successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    } as Response);

    renderProviderList();

    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
    });

    expect(screen.getByText('Provider Two')).toBeInTheDocument();
  });

  it('shows empty state when no providers', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderProviderList();

    await waitFor(() => {
      expect(screen.getByText('暂无供应商配置')).toBeInTheDocument();
    });
  });

  it('shows empty state with add button', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderProviderList();

    await waitFor(() => {
      expect(screen.getByText('添加第一个供应商')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderProviderList();

    await waitFor(() => {
      expect(screen.getByText('加载供应商失败')).toBeInTheDocument();
    });
  });

  it('passes activeProviderId to ProviderCard as isActive', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    } as Response);

    renderProviderList({ activeProviderId: 'id-1' });

    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
    });

    // Provider One is active -> should show "使用中" text
    expect(screen.getByText('使用中')).toBeInTheDocument();

    // Provider Two is inactive -> should show "启用" text
    expect(screen.getByText('启用')).toBeInTheDocument();
  });

  it('marks no provider as active when activeProviderId is null', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    } as Response);

    renderProviderList({ activeProviderId: null });

    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
    });

    // Both providers should show "启用" when no provider is active
    const enableButtons = screen.getAllByText('启用');
    expect(enableButtons.length).toBe(2);
  });
});
