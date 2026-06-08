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

/** Props for the ProjectGroup component. */
export interface ProjectGroupProps {
  cwd: string;
  changes: ChangeEntryWithCwd[];
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
 * Renders a collapsible project group for a single cwd.
 * Header shows folder icon, cwd path, change count, and collapse chevron.
 * Body shows sorted ChangeCard list.
 */
export function ProjectGroup({ cwd, changes }: ProjectGroupProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const sorted = sortByUpdateAtDesc(changes);

  return React.createElement(
    'div',
    { className: 'rounded-xl border bg-card/50 overflow-hidden' },
    // Group header - clickable to toggle collapse
    React.createElement(
      'div',
      {
        className:
          'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors duration-150 select-none',
        onClick: () => setExpanded((prev) => !prev),
      },
      React.createElement(FolderGit2, { size: 14, className: 'text-muted-foreground flex-shrink-0' }),
      React.createElement(
        'span',
        { className: 'text-xs text-muted-foreground truncate flex-1 font-mono' },
        cwd,
      ),
      React.createElement(
        'span',
        { className: 'text-xs text-muted-foreground/60 flex-shrink-0' },
        `(${changes.length})`,
      ),
      React.createElement(
        'div',
        {
          className: `transition-transform duration-200 flex-shrink-0 ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`,
        },
        React.createElement(ChevronDown, { size: 14, className: 'text-muted-foreground' }),
      ),
    ),
    // Group body - change cards
    expanded &&
      React.createElement(
        'div',
        { className: 'px-2 pb-2 space-y-1.5' },
        ...sorted.map((change) =>
          React.createElement(ChangeCard, {
            key: `${change.cwd}::${change.path}`,
            change,
          }),
        ),
      ),
  );
}
