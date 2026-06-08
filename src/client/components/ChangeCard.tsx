/**
 * ChangeCard component displays a single change entry with status icon,
 * name, description, and cwd path. Used in both "变更中" and "项目" views.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { Zap, Archive } from 'lucide-react';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Props for the ChangeCard component. */
export interface ChangeCardProps {
  change: ChangeEntryWithCwd;
  /** Whether to show the cwd path tag. Defaults to true. */
  showCwd?: boolean;
}

/** Default (non-hovered) left border color */
const DEFAULT_BORDER_COLOR = 'hsl(240 3.8% 46.1% / 0.25)'; // muted-foreground/25

/** Hovered left border color by status */
const HOVER_BORDER_COLORS: Record<string, string> = {
  active: '#22c55e',   // green-500
  archived: '#f59e0b', // amber-500
};

/**
 * Renders a card for a single change entry.
 * Shows status icon (active=green Zap, archived=amber Archive),
 * name, description, and cwd path.
 */
export function ChangeCard({ change, showCwd = true }: ChangeCardProps): React.ReactElement {
  const isActive = change.status === 'active';
  const iconBg = isActive ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500';
  const [hovered, setHovered] = useState(false);

  const borderLeftColor = hovered
    ? (HOVER_BORDER_COLORS[change.status] ?? DEFAULT_BORDER_COLOR)
    : DEFAULT_BORDER_COLOR;

  return React.createElement(
    'div',
    {
      className:
        'relative overflow-hidden rounded-xl border border-l-[3px] bg-card text-card-foreground px-3.5 py-3 transition-all duration-200 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.1)]',
      style: { borderLeftColor },
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
    // Top row: status icon + name
    React.createElement(
      'div',
      { className: 'flex items-center gap-2.5 mb-1.5' },
      React.createElement(
        'div',
        { className: `flex items-center justify-center w-7 h-7 rounded-lg ${iconBg} flex-shrink-0` },
        React.createElement(isActive ? Zap : Archive, { size: 15 }),
      ),
      React.createElement(
        'h3',
        { className: 'text-sm font-semibold leading-tight truncate', title: change.name },
        change.name,
      ),
    ),
    // Description (only if non-empty)
    change.description &&
      React.createElement(
        'p',
        { className: 'text-xs text-muted-foreground leading-relaxed line-clamp-2 ml-[38px]', title: change.description },
        change.description,
      ),
    // Cwd path — subtle mono tag
    showCwd &&
      React.createElement(
        'div',
        { className: 'ml-[38px] mt-2 flex items-center gap-1.5' },
        React.createElement(
          'span',
          {
            className:
              'inline-block text-[11px] leading-none text-muted-foreground/70 font-mono bg-muted/50 rounded px-1.5 py-1 truncate max-w-full',
            title: change.cwd,
          },
          change.cwd,
        ),
      ),
  );
}
