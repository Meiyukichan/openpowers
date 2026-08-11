/**
 * Layout component provides the main application shell.
 * VSCode-style layout with ActivityBar on the far left,
 * optional sidebar area, and main content with header.
 * Header with 'Furina' branding, proxy toggle, session management + add button.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { Plus, Settings, RotateCcw, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmResetDialog } from './ConfirmResetDialog.js';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { ActivityBar } from './ActivityBar.js';
import type { ActivityBarView } from './ActivityBar.js';
import ClaudeSvg from '../icons/claude.svg?url';

/** Props for the Layout component. */
interface LayoutProps {
  onAddProvider: () => void;
  onReset: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  enableFurinaProxy: boolean;
  onToggleProxy: () => void;
  children: React.ReactNode;
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
  sidebar: React.ReactNode;
}

/**
 * Layout renders the application shell with ActivityBar, optional sidebar, and main content.
 * The header contains branding, a placeholder session management button, and an add provider button.
 */
export function Layout({ onAddProvider, onReset, showToast, enableFurinaProxy, onToggleProxy, children, activeView, onViewChange, sidebar }: LayoutProps): React.ReactElement {
  const { t } = useTranslation();
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
    { className: 'flex flex-col h-screen bg-background text-foreground overflow-hidden' },
    // Header (full width, top)
    React.createElement(
        'header',
        {
          className:
            'sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md',
        },
        React.createElement(
          'div',
          { className: 'flex items-center justify-between h-16 pl-[48px] pr-6' },
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
              t('app.brandName'),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                'aria-label': t('layout.settingsAriaLabel'),
                title: t('layout.settings'),
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
                'aria-label': t('layout.resetProvidersAriaLabel'),
                title: t('layout.resetProviders'),
                className:
                  'p-1 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors',
              },
              React.createElement(RotateCcw, { size: 16 }),
            ),
            React.createElement(
              'div',
              {
                title: enableFurinaProxy
                  ? t('layout.proxyRunning')
                  : t('layout.proxyOff'),
                className: 'flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50 transition-all',
              },
              React.createElement(Radio, {
                size: 14,
                className: enableFurinaProxy ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground',
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  role: 'switch',
                  'aria-checked': enableFurinaProxy,
                  'aria-label': t('layout.toggleProxyAriaLabel'),
                  onClick: onToggleProxy,
                  className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    enableFurinaProxy ? 'bg-emerald-500' : 'bg-gray-200'
                  }`,
                },
                React.createElement('span', {
                  className: `inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    enableFurinaProxy ? 'translate-x-5' : 'translate-x-0.5'
                  }`,
                }),
              ),
            ),
          ),
          // Right: session management + language switcher + add button
          React.createElement(
            'div',
            { className: 'flex items-center gap-1.5' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: handleSessionClick,
                'aria-label': t('layout.sessionManagement'),
                title: t('layout.sessionManagement'),
                className:
                  'inline-flex items-center justify-center rounded-lg border bg-muted w-9 h-8 text-muted-foreground',
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
            ),
            React.createElement(LanguageSwitcher),
            activeView === 'providers' &&
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: onAddProvider,
                  onKeyDown: handleKeyDown,
                  'aria-label': t('layout.addProviderAriaLabel'),
                  className:
                    'inline-flex items-center justify-center rounded-full bg-orange-500 text-white w-8 h-8 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30',
                },
                React.createElement(Plus, { size: 20 }),
              ),
          ),
        ),
      ),
    // Content area (ActivityBar + sidebar + main)
    React.createElement(
      'div',
      { className: 'flex flex-row flex-1 min-h-0' },
      // ActivityBar (below header, left)
      React.createElement(ActivityBar, { activeView, onViewChange }),
      // Sidebar area (conditional)
      sidebar,
      // Main content
      React.createElement(
        'main',
        { className: 'flex-1 px-6 py-8 mx-auto w-full max-w-5xl overflow-y-auto' },
        children,
      ),
    ),
    React.createElement(ConfirmResetDialog, {
      isOpen: showConfirmReset,
      title: t('layout.confirmResetTitle'),
      message: t('layout.confirmResetMessage'),
      onConfirm: handleResetConfirm,
      onCancel: handleResetCancel,
    }),
  );
}
