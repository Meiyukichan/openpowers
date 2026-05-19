/**
 * ProviderCard component displays a single provider with its info and hover action buttons.
 * Shows provider icon, name, notes, base URL, and enabled/disabled status.
 * Action buttons (toggle, edit, delete) appear on hover via opacity transition.
 * Styling follows cc-switch patterns: rounded-xl border, bg-card, group hover effects.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import type { Provider } from '../../server/providers-store.js';
import { Sparkles, Cpu, Globe, Zap, Star, Cloud, Bot, Wrench, Power, PowerOff, Pencil, Trash2 } from 'lucide-react';

/** Props for the ProviderCard component. */
interface ProviderCardProps {
  provider: Provider;
  onToggle: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
}

// Map of icon names to Lucide React components
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  sparkles: Sparkles,
  cpu: Cpu,
  globe: Globe,
  zap: Zap,
  star: Star,
  cloud: Cloud,
  bot: Bot,
  wrench: Wrench,
};

/**
 * Renders an icon based on the provider's icon name.
 * Falls back to a default Cpu icon if the icon name is not recognized.
 */
function ProviderIcon({ icon, color, size = 20 }: { icon?: string; color?: string; size?: number }): React.ReactElement {
  const IconComponent = icon ? ICON_MAP[icon] : undefined;
  if (IconComponent) {
    return React.createElement(IconComponent, { size, style: { color: color || undefined } });
  }
  return React.createElement(Cpu, { size, style: { color: color || undefined } });
}

/**
 * ProviderCard renders a card for a single provider.
 * Shows provider details and reveals action buttons on hover via group opacity transition.
 */
export function ProviderCard({ provider, onToggle, onEdit, onDelete }: ProviderCardProps): React.ReactElement {
  const [togglePending, setTogglePending] = useState(false);

  const handleToggle = async () => {
    setTogglePending(true);
    try {
      await onToggle(provider);
    } finally {
      setTogglePending(false);
    }
  };

  return React.createElement(
    'div',
    {
      className: `relative overflow-hidden rounded-xl border bg-card text-card-foreground p-4 transition-all duration-300 group ${
        provider.enabled ? 'border-border' : 'border-muted opacity-60'
      }`,
    },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between gap-4' },
      // Left side: icon and info
      React.createElement(
        'div',
        { className: 'flex items-center gap-3 min-w-0 flex-1' },
        // Icon
        React.createElement(
          'div',
          {
            className:
              'h-10 w-10 rounded-lg bg-muted flex items-center justify-center border flex-shrink-0',
          },
          React.createElement(ProviderIcon, {
            icon: provider.icon,
            color: provider.iconColor,
            size: 20,
          }),
        ),
        // Info
        React.createElement(
          'div',
          { className: 'min-w-0' },
          React.createElement(
            'div',
            { className: 'flex items-center gap-2' },
            React.createElement(
              'h3',
              { className: 'text-base font-semibold leading-none truncate' },
              provider.name,
            ),
            React.createElement(
              'span',
              {
                className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  provider.enabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`,
              },
              provider.enabled ? 'Enabled' : 'Disabled',
            ),
          ),
          provider.notes &&
            React.createElement(
              'p',
              { className: 'text-sm text-muted-foreground truncate mt-1' },
              provider.notes,
            ),
          provider.baseUrl &&
            React.createElement(
              'p',
              { className: 'text-sm text-blue-500 dark:text-blue-400 truncate mt-0.5' },
              provider.baseUrl,
            ),
        ),
      ),
      // Right side: hover action buttons
      React.createElement(
        'div',
        {
          className:
            'flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        },
        // Toggle button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleToggle,
            disabled: togglePending,
            'aria-label': `Toggle ${provider.name}`,
            className: `p-2 rounded-lg transition-colors ${
              provider.enabled
                ? 'text-yellow-600 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/40'
                : 'text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40'
            }`,
          },
          React.createElement(provider.enabled ? Power : PowerOff, { size: 16 }),
        ),
        // Edit button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onEdit(provider),
            'aria-label': `Edit ${provider.name}`,
            className:
              'p-2 rounded-lg text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40 transition-colors',
          },
          React.createElement(Pencil, { size: 16 }),
        ),
        // Delete button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onDelete(provider),
            'aria-label': `Delete ${provider.name}`,
            className:
              'p-2 rounded-lg text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors',
          },
          React.createElement(Trash2, { size: 16 }),
        ),
      ),
    ),
  );
}
