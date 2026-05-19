/**
 * ProviderList component fetches providers from /api/providers and renders them.
 * Shows a loading skeleton while fetching, an empty state when no providers exist,
 * and renders ProviderCard components for each provider.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Provider } from '../../server/providers-store.js';
import { ProviderCard } from './ProviderCard.js';

/** Props for the ProviderList component. */
interface ProviderListProps {
  onToggle: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProvider: () => void;
}

/**
 * Builds the API URL for fetching providers.
 * Uses the current origin so the app works behind any host.
 */
function getApiUrl(): string {
  return '/api/providers';
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
      'No providers configured',
    ),
    React.createElement(
      'p',
      { className: 'mt-2 max-w-lg text-sm text-muted-foreground' },
      'Get started by adding your first AI provider.',
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
        'Add your first provider',
      ),
    ),
  );
}

/**
 * ProviderList fetches and displays providers from the API.
 * Handles loading, empty, and error states.
 */
export function ProviderList({ onToggle, onEdit, onDelete, onAddProvider }: ProviderListProps): React.ReactElement {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: Provider[] = await response.json();
      setProviders(data);
    } catch (err) {
      setError('Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  if (loading) {
    return React.createElement(LoadingSkeleton);
  }

  if (error) {
    return React.createElement(
      'div',
      { className: 'flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center' },
      React.createElement(
        'p',
        { className: 'text-destructive font-medium' },
        'Failed to load providers',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => void fetchProviders(),
          className:
            'mt-4 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
        },
        'Retry',
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
        onToggle,
        onEdit,
        onDelete,
      }),
    ),
  );
}
