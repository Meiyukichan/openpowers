/**
 * Tests for ProviderList component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ProviderList } from './ProviderList.js';

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

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
      }),
    );

    // Loading skeleton should have placeholder divs
    const skeletonCards = document.querySelectorAll('.animate-pulse');
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it('renders provider cards after successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    } as Response);

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
      }),
    );

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

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/No providers configured/i)).toBeInTheDocument();
    });
  });

  it('shows empty state with add button', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Add your first provider/i)).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load providers/i)).toBeInTheDocument();
    });
  });

  it('passes activeProviderId to ProviderCard as isActive', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    } as Response);

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
        activeProviderId: 'id-1',
      }),
    );

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

    render(
      React.createElement(ProviderList, {
        onSetActive: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddProvider: vi.fn(),
        activeProviderId: null,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Provider One')).toBeInTheDocument();
    });

    // Both providers should show "启用" when no provider is active
    const enableButtons = screen.getAllByText('启用');
    expect(enableButtons.length).toBe(2);
  });
});
