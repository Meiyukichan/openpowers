/**
 * ProjectGroup component displays changes grouped by cwd path.
 * Has a collapsible header showing cwd and change count,
 * with sorted ChangeCard components inside.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { ChevronDown, FolderGit2 } from 'lucide-react';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';
import { ChangeCard } from './ChangeCard.js';

const EXPANDED_KEY = 'furina:expandedGroups';

/** Props for the ProjectGroup component. */
export interface ProjectGroupProps {
  cwd: string;
  changes: ChangeEntryWithCwd[];
  onChangeClick?: (change: ChangeEntryWithCwd) => void;
  selectedChange?: ChangeEntryWithCwd | null;
}

/** Reads the set of expanded cwds from localStorage. */
function loadExpandedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/** Persists the set of expanded cwds to localStorage. */
function saveExpandedSet(cwds: Set<string>): void {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...cwds]));
}

/**
 * Sorts changes by updateAt descending (newest first).
 * Changes without updateAt are placed last.
 */
function sortByUpdateAtDesc(changes: ChangeEntryWithCwd[]): ChangeEntryWithCwd[] {
  return [...changes].sort((a, b) => {
    if (!a.updateAt && !b.updateAt) return 0;
    if (!a.updateAt) return 1;
    if (!b.updateAt) return -1;
    return new Date(b.updateAt).getTime() - new Date(a.updateAt).getTime();
  });
}

/**
 * Returns the project name (last path segment) from a cwd path.
 * e.g. "D:\project-code\llm\furina" → "furina"
 */
function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]/);
  return parts[parts.length - 1] || cwd;
}

/**
 * Renders a collapsible project group for a single cwd.
 * Header shows folder icon, cwd path, change count, and collapse chevron.
 * Body shows sorted ChangeCard list.
 */
export function ProjectGroup({ cwd, changes, onChangeClick, selectedChange }: ProjectGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(() => loadExpandedSet().has(cwd));
  const sorted = sortByUpdateAtDesc(changes);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      const set = loadExpandedSet();
      if (next) {
        set.add(cwd);
      } else {
        set.delete(cwd);
      }
      saveExpandedSet(set);
      return next;
    });
  };

  // Count active vs archived for the header badge
  const activeCount = changes.filter((c) => c.status === 'active').length;
  const archivedCount = changes.filter((c) => c.status === 'archived').length;

  return React.createElement(
    'div',
    { className: 'rounded-xl border border-l-[3px] border-l-blue-500/40 bg-card/60 overflow-hidden transition-all duration-200' },
    // Group header - clickable to toggle collapse
    React.createElement(
      'div',
      {
        className:
          'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors duration-150 select-none',
        onClick: toggleExpanded,
      },
      React.createElement(FolderGit2, { size: 15, className: 'text-blue-500/70 flex-shrink-0' }),
      React.createElement(
        'div',
        { className: 'flex flex-col min-w-0 flex-1 gap-0.5' },
        React.createElement(
          'span',
          { className: 'text-xs font-medium text-foreground/80 truncate', title: projectName(cwd) },
          projectName(cwd),
        ),
        React.createElement(
          'span',
          { className: 'text-[11px] text-muted-foreground/60 truncate font-mono', title: cwd },
          cwd,
        ),
      ),
      React.createElement(
        'div',
        { className: 'flex items-center gap-1.5 flex-shrink-0' },
        activeCount > 0 &&
          React.createElement(
            'span',
            { className: 'inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600 bg-green-500/10 rounded-full px-1.5 py-0.5' },
            React.createElement('span', { className: 'w-1.5 h-1.5 rounded-full bg-green-500' }),
            `${activeCount}`,
          ),
        archivedCount > 0 &&
          React.createElement(
            'span',
            { className: 'inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-500/10 rounded-full px-1.5 py-0.5' },
            React.createElement('span', { className: 'w-1.5 h-1.5 rounded-full bg-amber-500' }),
            `${archivedCount}`,
          ),
        React.createElement(
          'div',
          {
            className: `transition-transform duration-200 flex-shrink-0 ${
              expanded ? 'rotate-0' : '-rotate-90'
            }`,
          },
          React.createElement(ChevronDown, { size: 14, className: 'text-muted-foreground/60' }),
        ),
      ),
    ),
    // Group body - change cards with smooth height transition
    expanded &&
      React.createElement(
        'div',
        { className: 'px-2.5 pb-2.5 space-y-2' },
        ...sorted.map((change) =>
          React.createElement(ChangeCard, {
            key: `${change.cwd}::${change.path}`,
            change,
            showCwd: false,
            onClick: onChangeClick,
            isSelected: selectedChange
              ? `${selectedChange.cwd}::${selectedChange.path}` === `${change.cwd}::${change.path}`
              : false,
          }),
        ),
      ),
  );
}
