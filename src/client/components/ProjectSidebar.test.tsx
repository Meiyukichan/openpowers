/**
 * Tests for ProjectSidebar component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ProjectSidebar } from './ProjectSidebar.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render ProjectSidebar wrapped in I18nextProvider */
function renderProjectSidebar(props?: { onChangeClick?: (change: ChangeEntryWithCwd) => void; selectedChange?: ChangeEntryWithCwd | null }) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(ProjectSidebar, props || {}),
    ),
  );
}

const mockActiveChanges = [
  {
    name: 'ui-changes-page',
    path: 'openpowers/changes/ui-changes-page',
    description: '实现变更列表UI页面',
    createdAt: '2026-06-08T10:00:00Z',
    updateAt: '2026-06-08T12:30:00Z',
    status: 'active' as const,
    features: 0,
    todo: 0,
    artifacts: [],
    cwd: 'D:\\project-code\\llm\\openpowers',
  },
  {
    name: 'fe-002',
    path: 'openpowers/changes/fe-002',
    description: 'Another feature',
    createdAt: '2026-06-08T09:00:00Z',
    updateAt: '2026-06-08T11:00:00Z',
    status: 'active' as const,
    features: 0,
    todo: 0,
    artifacts: [],
    cwd: 'D:\\project-code\\llm\\openpowers',
  },
];

const mockAllChanges = [
  ...mockActiveChanges,
  {
    name: 'archived-feature',
    path: 'openpowers/archive/archived',
    description: 'An archived feature',
    createdAt: '2026-06-07T08:00:00Z',
    updateAt: '2026-06-07T14:00:00Z',
    status: 'archived' as const,
    features: 0,
    todo: 0,
    artifacts: [],
    cwd: 'D:\\project-code\\llm\\openpowers',
  },
  {
    name: 'removed-feature',
    path: 'openpowers/archive/removed',
    description: 'A removed feature',
    createdAt: '2026-06-06T10:00:00Z',
    status: 'removed' as const,
    features: 0,
    todo: 0,
    artifacts: [],
    cwd: 'D:\\project-code\\llm\\other-project',
  },
];

describe('ProjectSidebar', () => {
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
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows "变更中" tab as active by default', () => {
    // Mock fetch to never resolve (stays in loading)
    vi.mocked(fetch).mockReturnValue(
      new Promise(() => {}) as Promise<Response>,
    );

    renderProjectSidebar();

    // The active tab button should have the active style class
    const activeBtn = document.querySelector('.text-blue-500');
    expect(activeBtn).toBeInTheDocument();
    // The button aria-label should say "变更中"
    expect(screen.getByLabelText('变更中')).toBeInTheDocument();
  });

  it('switches to projects tab when clicked', () => {
    vi.mocked(fetch).mockReturnValue(
      new Promise(() => {}) as Promise<Response>,
    );

    renderProjectSidebar();

    const projectsBtn = screen.getByLabelText('项目');
    fireEvent.click(projectsBtn);

    // Projects button should now have active style
    const projectsTabBtn = projectsBtn.closest('button');
    expect(projectsTabBtn?.className).toContain('text-blue-500');
  });

  it('shows loading skeleton during fetch', () => {
    vi.mocked(fetch).mockReturnValue(
      new Promise(() => {}) as Promise<Response>,
    );

    renderProjectSidebar();

    // Loading skeleton should have animate-pulse divs
    const skeletonCards = document.querySelectorAll('.animate-pulse');
    expect(skeletonCards.length).toBeGreaterThan(0);
  });

  it('renders active change cards after successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar();

    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    expect(screen.getByText('fe-002')).toBeInTheDocument();
  });

  it('shows empty state when active changes list is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: [] }),
    } as Response);

    renderProjectSidebar();

    await waitFor(() => {
      expect(screen.getByText('暂无变更中项目')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderProjectSidebar();

    await waitFor(() => {
      expect(screen.getByText('加载变更失败')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    renderProjectSidebar();

    await waitFor(() => {
      expect(screen.getByText('重试')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch returns non-OK HTTP status', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    renderProjectSidebar();

    await waitFor(() => {
      expect(screen.getByText('加载变更失败')).toBeInTheDocument();
    });
  });

  it('fetches with status=active for active tab', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar();

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/openpowers/api/changes/all?status=active'),
      );
    });
  });

  it('switches to projects tab and renders project groups', async () => {
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      // Return mockAllChanges for all calls; project view filters removed client-side
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: mockAllChanges }),
      }) as Promise<Response>;
    });

    renderProjectSidebar();

    // Wait for initial active tab fetch to complete
    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    const callsAfterActiveFetch = callCount;

    // Switch to projects tab
    const projectsBtn = screen.getByLabelText('项目');
    fireEvent.click(projectsBtn);

    // Wait for the project tab fetch to fire (callCount increases)
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(callsAfterActiveFetch);
    });

    // After the second fetch resolves, the loading skeleton should disappear and
    // the project view should render. Wait for no loading skeleton to confirm.
    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(0);
    });

    // Groups are collapsed by default; expand a group to see its cards
    const groupHeaders = document.querySelectorAll('.cursor-pointer');
    groupHeaders.forEach((header) => fireEvent.click(header));

    // Archived change should be shown after expanding groups
    await waitFor(() => {
      expect(screen.getByText('archived-feature')).toBeInTheDocument();
    });

    // Removed change should NOT be shown (client-side filtered)
    expect(screen.queryByText('removed-feature')).not.toBeInTheDocument();
  });

  it('shows empty state in projects tab when no changes', async () => {
    // Return active changes first (for initial active tab fetch), then empty for project tab
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: callCount === 1 ? mockActiveChanges : [] }),
      }) as Promise<Response>;
    });

    renderProjectSidebar();

    // Wait for initial active tab fetch to complete
    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    // Switch to projects tab
    const projectsBtn = screen.getByLabelText('项目');
    fireEvent.click(projectsBtn);

    // Wait for empty state text
    await waitFor(() => {
      expect(screen.getByText('暂无项目变更')).toBeInTheDocument();
    });
  });

  it('debounces search input by 300ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
      }) as Promise<Response>;
    });

    renderProjectSidebar();

    // Advance time past debounce for initial fetch
    await act(() => vi.advanceTimersByTimeAsync(300));

    // flush pending promises
    await act(() => Promise.resolve());

    expect(screen.getByText('ui-changes-page')).toBeInTheDocument();

    const initialCallCount = callCount;

    // Find the search input
    const searchInput = screen.getByPlaceholderText('搜索...');

    // Type in search box
    fireEvent.change(searchInput, { target: { value: 'ui' } });

    // Advance timers by 200ms - should NOT trigger fetch yet
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(callCount).toBe(initialCallCount); // Still only initial fetch

    // Advance to 300ms - should trigger fetch
    await act(() => vi.advanceTimersByTimeAsync(100));

    // flush pending promises
    await act(() => Promise.resolve());

    expect(callCount).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });

  it('preserves search state per tab', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar();

    // Wait for initial fetch (debounce 300ms)
    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    // Type in search on active tab
    const searchInput = screen.getByPlaceholderText('搜索...');
    fireEvent.change(searchInput, { target: { value: 'ui-search' } });

    // Wait for debounce
    await waitFor(
      () => {
        expect(searchInput).toHaveValue('ui-search');
      },
      { timeout: 1000 },
    );

    // Switch to projects tab
    const projectsBtn = screen.getByLabelText('项目');
    fireEvent.click(projectsBtn);

    // Search input should be cleared (project tab has its own search state)
    expect(searchInput).toHaveValue('');

    // Type something on project tab
    fireEvent.change(searchInput, { target: { value: 'project-search' } });

    // Switch back to active tab
    const activeBtn = screen.getByLabelText('变更中');
    fireEvent.click(activeBtn);

    // Search should be restored to active tab's search term
    expect(searchInput).toHaveValue('ui-search');
  });

  it('clears search and refetches without query when search box is cleared', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar();

    // Wait for initial fetch with status=active only (debounce 300ms)
    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    // Type in search
    const searchInput = screen.getByPlaceholderText('搜索...');
    fireEvent.change(searchInput, { target: { value: 'ui' } });

    // Wait for debounce to trigger fetch with query
    await waitFor(
      () => {
        const calls = vi.mocked(fetch).mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).toContain('query=ui');
      },
      { timeout: 2000 },
    );

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Wait for debounce - last fetch should not include query parameter
    await waitFor(
      () => {
        const calls = vi.mocked(fetch).mock.calls;
        const lastCall = calls[calls.length - 1]?.[0] as string;
        expect(lastCall).not.toContain('query=');
      },
      { timeout: 2000 },
    );
  });

  it('passes onChangeClick to ChangeCard in active tab', async () => {
    const onChangeClick = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar({ onChangeClick });

    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    // Click a change card
    fireEvent.click(screen.getByText('ui-changes-page'));
    expect(onChangeClick).toHaveBeenCalled();
  });

  it('passes isSelected to ChangeCard when selectedChange matches', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: mockActiveChanges }),
    } as Response);

    renderProjectSidebar({ selectedChange: mockActiveChanges[0] });

    await waitFor(() => {
      expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
    });

    // The selected card should have blue-500 border color
    const cards = document.querySelectorAll('.rounded-xl');
    let found = false;
    cards.forEach((card) => {
      if ((card as HTMLElement).style.borderLeftColor === 'rgb(59, 130, 246)') {
        found = true;
      }
    });
    expect(found).toBe(true);
  });
});
