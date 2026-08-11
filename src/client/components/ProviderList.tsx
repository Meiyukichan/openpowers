/**
 * ProviderList component fetches providers from /furina/api/providers and renders them.
 * Shows a loading skeleton while fetching, an empty state when no providers exist,
 * and renders ProviderCard components for each provider.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../server/providers-store.js';
import { ProviderCard } from './ProviderCard.js';

/** Props for the ProviderList component. */
interface ProviderListProps {
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProvider: () => void;
  /** Callback to set a provider as the active provider */
  onSetActive: (provider: Provider) => void;
  /** Callback to toggle the enabled state of a provider */
  onToggleEnabled?: (provider: Provider) => void;
  /** The ID of the currently active provider, or null if none */
  activeProviderId?: string | null;
  /** Incrementing this value triggers a re-fetch of the provider list */
  refreshTrigger?: number;
}

/**
 * Builds the API URL for fetching providers.
 * Uses the current origin so the app works behind any host.
 */
function getApiUrl(): string {
  return '/furina/api/providers';
}

/**
 * Renders skeleton placeholder cards during loading.
 */
function LoadingSkeleton(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'space-y-3' },
    ...[0, 1, 2].map((index) =>
      React.createElement('div', {
        key: index,
        className: 'animate-pulse rounded-xl border bg-muted/40 p-4 h-24',
      }),
    ),
  );
}

/**
 * Renders the empty state with an option to add the first provider.
 */
function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center' },
    React.createElement(
      'div',
      { className: 'mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted' },
      React.createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: '28',
          height: '28',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round' as const,
          strokeLinejoin: 'round' as const,
          className: 'text-muted-foreground',
        },
        React.createElement('path', { d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2' }),
        React.createElement('circle', { cx: '9', cy: '7', r: '4' }),
        React.createElement('path', { d: 'M23 21v-2a4 4 0 00-3-3.87' }),
        React.createElement('path', { d: 'M16 3.13a4 4 0 010 7.75' }),
      ),
    ),
    React.createElement(
      'h3',
      { className: 'text-lg font-semibold' },
      t('providerList.noProviders'),
    ),
    React.createElement(
      'p',
      { className: 'mt-2 max-w-lg text-sm text-muted-foreground' },
      t('providerList.getStarted'),
    ),
    React.createElement(
      'div',
      { className: 'mt-6' },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onAdd,
          className:
            'inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors',
        },
        React.createElement(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            width: '16',
            height: '16',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '2',
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
            className: 'mr-2',
          },
          React.createElement('line', { x1: '12', y1: '5', x2: '12', y2: '19' }),
          React.createElement('line', { x1: '5', y1: '12', x2: '19', y2: '12' }),
        ),
        t('providerList.addFirstProvider'),
      ),
    ),
  );
}

/**
 * ProviderList fetches and displays providers from the API.
 * Handles loading, empty, and error states.
 */
export function ProviderList({ onEdit, onDelete, onAddProvider, onSetActive, onToggleEnabled, activeProviderId, refreshTrigger }: ProviderListProps): React.ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const response = await fetch(getApiUrl());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: Provider[] = await response.json();
      setProviders(data);
    } catch (err) {
      setErrorKey('providerList.failedToLoad');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders, refreshTrigger]);

  if (loading) {
    return React.createElement(LoadingSkeleton);
  }

  if (errorKey) {
    return React.createElement(
      'div',
      { className: 'flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center' },
      React.createElement(
        'p',
        { className: 'text-destructive font-medium' },
        t(errorKey),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => void fetchProviders(),
          className:
            'mt-4 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
        },
        t('providerList.retry'),
      ),
    );
  }

  if (providers.length === 0) {
    return React.createElement(EmptyState, { onAdd: onAddProvider });
  }

  return React.createElement(
    'div',
    { className: 'space-y-3' },
    ...providers.map((provider) =>
      React.createElement(ProviderCard, {
        key: provider.id,
        provider,
        onEdit,
        onDelete,
        onSetActive,
        onToggleEnabled,
        isActive: activeProviderId === provider.id,
      }),
    ),
  );
}
