/**
 * ChangeCard component displays a single change entry with status icon,
 * name, description, and cwd path. Used in both "变更中" and "项目" views.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { Zap, Archive } from 'lucide-react';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Props for the ChangeCard component. */
export interface ChangeCardProps {
  change: ChangeEntryWithCwd;
}

/**
 * Renders a card for a single change entry.
 * Shows status icon (active=green Zap, archived=amber Archive),
 * name, description, and cwd path.
 */
export function ChangeCard({ change }: ChangeCardProps): React.ReactElement {
  const isActive = change.status === 'active';

  return React.createElement(
    'div',
    {
      className:
        'relative overflow-hidden rounded-xl border bg-card text-card-foreground px-4 py-3 transition-all duration-200 group',
    },
    // Status icon at top-left
    React.createElement(
      'div',
      { className: 'flex items-start justify-between mb-1' },
      React.createElement(
        'div',
        {
          className: `flex items-center justify-center w-6 h-6 rounded-md ${
            isActive
              ? 'bg-green-500/10 text-green-500'
              : 'bg-amber-500/10 text-amber-500'
          }`,
        },
        React.createElement(isActive ? Zap : Archive, { size: 14 }),
      ),
    ),
    // Name
    React.createElement(
      'h3',
      { className: 'text-sm font-semibold leading-none truncate' },
      change.name,
    ),
    // Description (only if non-empty)
    change.description &&
      React.createElement(
        'p',
        { className: 'text-xs text-muted-foreground truncate mt-1.5' },
        change.description,
      ),
    // Cwd path
    React.createElement(
      'p',
      { className: 'text-xs text-muted-foreground/70 truncate mt-1 font-mono' },
      change.cwd,
    ),
  );
}
