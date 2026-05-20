/**
 * Layout component provides the main application shell.
 * Header with 'Claude' branding on the left,
 * and session management + circular orange '+' buttons on the right for adding providers.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { Plus, Settings } from 'lucide-react';

/** Props for the Layout component. */
interface LayoutProps {
  onAddProvider: () => void;
  children: React.ReactNode;
}

/**
 * Layout renders the application shell with a fixed header and scrollable main content area.
 * The header contains branding, a placeholder session management button, and an add provider button.
 */
export function Layout({ onAddProvider, children }: LayoutProps): React.ReactElement {
  const handleSessionClick = () => {
    // Placeholder - no effect
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
          React.createElement(
            'h1',
            { className: 'text-xl font-semibold text-blue-500 dark:text-blue-400' },
            'Claude',
          ),
          React.createElement(Settings, {
            size: 18,
            className: 'text-muted-foreground',
          }),
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
  );
}
