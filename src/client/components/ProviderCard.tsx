/**
 * ProviderCard component displays a single provider with its info and hover action buttons.
 * Shows provider icon, name, notes, website URL, and enabled/disabled status.
 * Action buttons (toggle, edit, delete) appear on hover via opacity transition.
 * Styling follows cc-switch patterns: rounded-xl border, bg-card, group hover effects.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../server/providers-store.js';
import { Play, Check, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import AnthropicSvg from '../icons/anthropic.svg?url';
import DeepSeekSvg from '../icons/deepseek.svg?url';
import XiaomimimoSvg from '../icons/xiaomimimo.svg?url';
import ChatglmSvg from '../icons/chatglm.svg?url';
import MinimaxSvg from '../icons/minimax.svg?url';
import KimiSvg from '../icons/kimi.svg?url';
import BailianSvg from '../icons/bailian.svg?url';
import OpenAISvg from '../icons/openai.svg?url';

/** Props for the ProviderCard component. */
interface ProviderCardProps {
  provider: Provider;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  /** Callback to set this provider as the active provider */
  onSetActive: (provider: Provider) => void;
  /** Callback to toggle the enabled state of this provider */
  onToggleEnabled?: (provider: Provider) => void;
  /** Whether this provider is the currently active provider */
  isActive: boolean;
}

// Map of SVG filenames to Vite ?url imported module URLs
const ICON_MAP: Record<string, string> = {
  'anthropic.svg': AnthropicSvg,
  'deepseek.svg': DeepSeekSvg,
  'xiaomimimo.svg': XiaomimimoSvg,
  'chatglm.svg': ChatglmSvg,
  'minimax.svg': MinimaxSvg,
  'kimi.svg': KimiSvg,
  'bailian.svg': BailianSvg,
  'openai.svg': OpenAISvg,
};

/**
 * Renders a brand SVG icon for the provider if icon is a valid SVG filename.
 * Returns null (no icon) when icon is empty or unrecognized.
 */
function ProviderIcon({ icon }: { icon?: string }): React.ReactElement | null {
  const { t } = useTranslation();
  const svgUrl = icon ? ICON_MAP[icon] : undefined;
  if (svgUrl) {
    return React.createElement('img', {
      src: svgUrl,
      alt: t('providerCard.providerIcon'),
      width: 20,
      height: 20,
      loading: 'lazy',
    });
  }
  return null;
}

/**
 * Returns the button state configuration based on whether the provider is active.
 * Active provider: grey disabled button with Check icon and active text.
 * Inactive provider: blue button with Play icon and enable text.
 */
function getEnableButtonState(
  isActive: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
): {
  disabled: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  text: string;
} {
  if (isActive) {
    return {
      disabled: true,
      icon: Check,
      text: t('providerCard.active'),
    };
  }
  return {
    disabled: false,
    icon: Play,
    text: t('providerCard.enable'),
  };
}

/**
 * ProviderCard renders a card for a single provider.
 * Shows provider details and reveals action buttons on hover via group opacity transition.
 */
export function ProviderCard({ provider, onEdit, onDelete, onSetActive, onToggleEnabled, isActive }: ProviderCardProps): React.ReactElement {
  const { t } = useTranslation();
  const [enablePending, setEnablePending] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const buttonState = getEnableButtonState(isActive, t);
  const isDisabled = provider.enabled === false;

  const handleEnable = async () => {
    if (isActive) return;
    setEnablePending(true);
    try {
      await onSetActive(provider);
    } finally {
      setEnablePending(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!onToggleEnabled) return;
    setTogglePending(true);
    try {
      await onToggleEnabled(provider);
    } finally {
      setTogglePending(false);
    }
  };

  return React.createElement(
    'div',
    {
      className: `relative overflow-hidden rounded-xl border bg-card text-card-foreground px-4 py-4 transition-all duration-300 group flex items-center ${
        isActive
          ? 'border-blue-500/60 shadow-sm shadow-blue-500/10'
          : 'border-border hover:border-blue-500/50'
      }${isDisabled ? ' opacity-50 grayscale' : ''}`,
    },
    // Gradient overlay for active provider blue background
    React.createElement('div', {
      className: `absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none ${
        isActive ? 'opacity-100' : 'opacity-0'
      }`,
    }),
    React.createElement(
      'div',
      { className: 'relative flex items-center justify-between gap-4 w-full' },
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
          }),
        ),
        // Info
        React.createElement(
          'div',
          { className: 'min-w-0' },
          React.createElement(
            'h3',
            { className: 'text-base font-semibold leading-none truncate' },
            provider.name,
          ),
          provider.notes &&
            React.createElement(
              'p',
              { className: 'text-sm text-muted-foreground truncate mt-1' },
              provider.notes,
            ),
          provider.websiteUrl &&
            React.createElement(
              'a',
              {
                href: provider.websiteUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'text-sm text-blue-500 dark:text-blue-400 truncate mt-1.5',
              },
              provider.websiteUrl,
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
        // Enable button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleEnable,
            disabled: buttonState.disabled || enablePending,
            'aria-label': isActive ? t('providerCard.isActive', { name: provider.name }) : t('providerCard.enableProvider', { name: provider.name }),
            className: `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              buttonState.disabled
                ? 'bg-gray-200 text-muted-foreground hover:bg-gray-200 hover:text-muted-foreground dark:bg-gray-700 dark:hover:bg-gray-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`,
          },
          React.createElement(buttonState.icon, { size: 14 }),
          buttonState.text,
        ),
        // Disable/Enable toggle button
        onToggleEnabled &&
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleToggleEnabled,
              disabled: togglePending,
              'aria-label': isDisabled ? t('providerCard.enableToggle') : t('providerCard.disable'),
              className: `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isDisabled
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-900/60'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`,
            },
            React.createElement(isDisabled ? Power : PowerOff, { size: 14 }),
            isDisabled ? t('providerCard.enableToggle') : t('providerCard.disable'),
          ),
        // Edit button
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onEdit(provider),
            'aria-label': t('providerCard.editProvider', { name: provider.name }),
            title: t('providerCard.edit'),
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
            'aria-label': t('providerCard.deleteProvider', { name: provider.name }),
            title: t('providerCard.delete'),
            className:
              'p-2 rounded-lg text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors',
          },
          React.createElement(Trash2, { size: 16 }),
        ),
      ),
    ),
  );
}
