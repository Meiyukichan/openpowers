/**
 * Layout component provides the main application shell.
 * Header with 'OpenPowers' branding on the left,
 * and session management + circular orange '+' buttons on the right for adding providers.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { Plus, Settings, RotateCcw, Radio } from 'lucide-react';
import { ConfirmResetDialog } from './ConfirmResetDialog.js';
import ClaudeSvg from '../icons/claude.svg?url';

/** Props for the Layout component. */
interface LayoutProps {
  onAddProvider: () => void;
  onReset: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  enableOpenpowersProxy: boolean;
  onToggleProxy: () => void;
  children: React.ReactNode;
}

/**
 * Layout renders the application shell with a fixed header and scrollable main content area.
 * The header contains branding, a placeholder session management button, and an add provider button.
 */
export function Layout({ onAddProvider, onReset, showToast, enableOpenpowersProxy, onToggleProxy, children }: LayoutProps): React.ReactElement {
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handleSessionClick = () => {
    // Placeholder - no effect
  };

  const handleResetClick = () => {
    setShowConfirmReset(true);
  };

  const handleResetConfirm = () => {
    setShowConfirmReset(false);
    onReset();
  };

  const handleResetCancel = () => {
    setShowConfirmReset(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAddProvider();
    }
  };

  return React.createElement(
    'div',
    { className: 'flex flex-col min-h-screen bg-background text-foreground' },
    // Header
    React.createElement(
      'header',
      {
        className:
          'sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md',
      },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between h-16 px-6 mx-auto max-w-5xl' },
        // Left: brand
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement('img', {
            src: ClaudeSvg,
            alt: 'Claude',
            width: 24,
            height: 24,
            loading: 'lazy',
          }),
          React.createElement(
            'h1',
            { className: 'text-xl font-semibold text-blue-500 dark:text-blue-400' },
            'OpenPowers',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': 'Settings',
              title: '设置',
              className: 'p-1 rounded-md text-muted-foreground hover:text-muted-foreground transition-colors',
            },
            React.createElement(Settings, {
              size: 18,
              className: 'text-muted-foreground',
            }),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleResetClick,
              'aria-label': 'Reset providers',
              title: '还原Claude配置',
              className:
                'p-1 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors',
            },
            React.createElement(RotateCcw, { size: 16 }),
          ),
          React.createElement(
            'div',
            {
              title: enableOpenpowersProxy
                ? 'Anthropic API proxy is running - localhost:3939'
                : 'Turn on Anthropic API proxy for providers that need model mapping or format conversion. Configured address: localhost:3939',
              className: 'flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50 transition-all',
            },
            React.createElement(Radio, {
              size: 14,
              className: enableOpenpowersProxy ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground',
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                role: 'switch',
                'aria-checked': enableOpenpowersProxy,
                'aria-label': 'Toggle Anthropic API proxy',
                onClick: onToggleProxy,
                className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  enableOpenpowersProxy ? 'bg-emerald-500' : 'bg-gray-200'
                }`,
              },
              React.createElement('span', {
                className: `inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  enableOpenpowersProxy ? 'translate-x-5' : 'translate-x-0.5'
                }`,
              }),
            ),
          ),
        ),
        // Right: session management + add button
        React.createElement(
          'div',
          { className: 'flex items-center gap-1.5' },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleSessionClick,
              className:
                'inline-flex items-center gap-1.5 rounded-lg border bg-muted px-3 py-1.5 text-sm text-muted-foreground',
            },
            React.createElement(
              'svg',
              {
                xmlns: 'http://www.w3.org/2000/svg',
                width: '14',
                height: '14',
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2',
                strokeLinecap: 'round' as const,
                strokeLinejoin: 'round' as const,
              },
              React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
              React.createElement('polyline', { points: '12 6 12 12 16 14' }),
            ),
            '会话管理',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: onAddProvider,
              onKeyDown: handleKeyDown,
              'aria-label': 'Add provider',
              className:
                'inline-flex items-center justify-center rounded-full bg-orange-500 text-white w-8 h-8 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30',
            },
            React.createElement(Plus, { size: 20 }),
          ),
        ),
      ),
    ),
    // Main content
    React.createElement(
      'main',
      { className: 'flex-1 px-6 py-8 mx-auto w-full max-w-5xl' },
      children,
    ),
    React.createElement(ConfirmResetDialog, {
      isOpen: showConfirmReset,
      title: '确认还原',
      message: '是否还原Claude配置？',
      onConfirm: handleResetConfirm,
      onCancel: handleResetCancel,
    }),
  );
}
