/**
 * ProjectSidebar component (260px) - displays changes with two views:
 * "变更中" (Active): status=active changes as cards
 * "项目" (Projects): all non-removed changes grouped by cwd
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FolderKanban, Zap, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';
import { ChangeCard } from './ChangeCard.js';
import { ProjectGroup } from './ProjectGroup.js';

type SidebarTab = 'active' | 'projects';

/**
 * Builds the API URL for fetching changes.
 */
function getApiUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) {
      searchParams.set(key, value);
    }
  }
  const qs = searchParams.toString();
  return `/openpowers/api/changes/all${qs ? `?${qs}` : ''}`;
}

/**
 * Renders skeleton placeholder cards during loading.
 */
function LoadingSkeleton(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'space-y-1.5 p-2' },
    ...[0, 1, 2].map((index) =>
      React.createElement('div', {
        key: index,
        className: 'animate-pulse rounded-xl border bg-muted/40 p-4 h-20',
      }),
    ),
  );
}

/**
 * Renders the empty state with a message for the active tab.
 */
function EmptyState({ message }: { message: string }): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center flex-1 p-6 text-center' },
    React.createElement(
      'div',
      { className: 'mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted' },
      React.createElement(Zap, { size: 20, className: 'text-muted-foreground' }),
    ),
    React.createElement(
      'p',
      { className: 'text-sm text-muted-foreground' },
      message,
    ),
  );
}

/**
 * Renders the error state with a message and retry button.
 */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center flex-1 p-6 text-center' },
    React.createElement(
      'p',
      { className: 'text-sm text-destructive font-medium mb-3' },
      message,
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: onRetry,
        className:
          'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted',
      },
      t('projectSidebar.retry'),
    ),
  );
}

/** Generates a unique key for a change entry */
function changeKey(change: ChangeEntryWithCwd): string {
  return `${change.cwd}::${change.path}`;
}

/**
 * ProjectSidebar container component.
 * Manages tab switching, search state per tab, data fetching, and content rendering.
 */
export function ProjectSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SidebarTab>('active');

  // Per-tab search state
  const [activeSearch, setActiveSearch] = useState('');
  const [projectsSearch, setProjectsSearch] = useState('');

  // Data and loading state
  const [changes, setChanges] = useState<ChangeEntryWithCwd[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current search term based on active tab
  const searchTerm = activeTab === 'active' ? activeSearch : projectsSearch;

  // Debounced fetch on mount and when tab/search changes
  useEffect(() => {
    let cancelled = false;
    const params: Record<string, string> = {};
    if (activeTab === 'active') {
      params.status = 'active';
    }
    if (searchTerm !== '') {
      params.query = searchTerm;
    }
    const isProjectTab = activeTab === 'projects';

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setErrorKey(null);
      try {
        const response = await fetch(getApiUrl(params));
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const json = await response.json() as { ok: boolean; data: ChangeEntryWithCwd[] };
        let data = json.data;
        // For project view, filter out removed changes client-side
        if (isProjectTab) {
          data = data.filter((c) => c.status !== 'removed');
        }
        if (!cancelled) {
          setChanges(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErrorKey('projectSidebar.failedToLoad');
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [activeTab, searchTerm, refreshTrigger]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (activeTab === 'active') {
        setActiveSearch(value);
      } else {
        setProjectsSearch(value);
      }
    },
    [activeTab],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Tab button styles
  const tabBtnBase =
    'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200';
  const tabActive = 'text-blue-500 bg-blue-500/10 shadow-sm shadow-blue-500/15 hover:bg-blue-500/20';
  const tabInactive = 'text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-sm';

  // Retry handler
  const handleRetry = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Memoized project grouping: group by cwd, sort groups by latest updateAt
  const sortedGroups = useMemo(() => {
    if (activeTab !== 'projects' || changes.length === 0) return [];
    const groups: Map<string, ChangeEntryWithCwd[]> = new Map();
    for (const change of changes) {
      const existing = groups.get(change.cwd);
      if (existing) {
        existing.push(change);
      } else {
        groups.set(change.cwd, [change]);
      }
    }

    // Sort groups by latest updateAt within each group
    return Array.from(groups.entries()).sort(([, a], [, b]) => {
      const aLatest = Math.max(...a.map((c) => (c.updateAt ? new Date(c.updateAt).getTime() : 0)));
      const bLatest = Math.max(...b.map((c) => (c.updateAt ? new Date(c.updateAt).getTime() : 0)));
      return bLatest - aLatest;
    });
  }, [changes, activeTab]);

  // Render content based on state
  const renderContent = (): React.ReactElement => {
    if (loading) {
      return React.createElement(LoadingSkeleton);
    }

    if (errorKey) {
      return React.createElement(ErrorState, {
        message: t(errorKey),
        onRetry: handleRetry,
      });
    }

    if (changes.length === 0) {
      const emptyKey = activeTab === 'active' ? 'projectSidebar.emptyActive' : 'projectSidebar.emptyProject';
      return React.createElement(EmptyState, { message: t(emptyKey) });
    }

    if (activeTab === 'active') {
      // Render flat list of change cards
      return React.createElement(
        'div',
        { className: 'flex-1 overflow-y-auto p-2 space-y-1.5' },
        ...changes.map((change) =>
          React.createElement(ChangeCard, {
            key: changeKey(change),
            change,
          }),
        ),
      );
    }

    return React.createElement(
      'div',
      { className: 'flex-1 overflow-y-auto p-2 space-y-1.5' },
      ...sortedGroups.map(([cwd, groupChanges]) =>
        React.createElement(ProjectGroup, {
          key: cwd,
          cwd,
          changes: groupChanges,
        }),
      ),
    );
  };

  return React.createElement(
    'div',
    {
      className:
        'flex flex-col w-[260px] h-full border-r overflow-hidden',
      style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.4) 0%, hsl(var(--background)) 40px, hsl(var(--background)) 100%)' },
    },
    // Header — elevated with subtle shadow
    React.createElement(
      'div',
      {
        className:
          'flex items-center justify-between px-3 py-3',
        style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.5) 0%, hsl(var(--muted)/0.15) 100%)' },
      },
      React.createElement(
        'div',
        { className: 'flex items-center gap-1.5' },
        React.createElement(Sparkles, {
          size: 14,
          className: 'text-blue-500',
          style: { filter: 'drop-shadow(0 0 3px rgba(59,130,246,0.4))' },
        }),
        React.createElement(
          'span',
          {
            className: 'text-sm font-extrabold tracking-widest uppercase',
            style: {
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #6366f1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.12em',
            },
          },
          t('projectSidebar.title'),
        ),
      ),
      React.createElement(
        'div',
        { className: 'flex items-center gap-1' },
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': t('projectSidebar.activeView'),
            title: t('projectSidebar.activeView'),
            onClick: () => setActiveTab('active'),
            className: `${tabBtnBase} ${activeTab === 'active' ? tabActive : tabInactive}`,
          },
          React.createElement(Zap, { size: 18 }),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': t('projectSidebar.projectView'),
            title: t('projectSidebar.projectView'),
            onClick: () => setActiveTab('projects'),
            className: `${tabBtnBase} ${activeTab === 'projects' ? tabActive : tabInactive}`,
          },
          React.createElement(FolderKanban, { size: 18 }),
        ),
      ),
    ),
    // Search input — recessed/inset style for depth
    React.createElement(
      'div',
      { className: 'px-3 pt-1 pb-2' },
      React.createElement('input', {
        type: 'text',
        placeholder: t('projectSidebar.searchPlaceholder'),
        value: searchTerm,
        onChange: handleSearchChange,
        className:
          'w-full rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 focus:bg-background focus:shadow-none transition-all duration-200',
      }),
    ),
    // Content area
    renderContent(),
  );
}
