/**
 * ProjectSidebar component (260px) - skeleton for project management view.
 * Header with title + icons, search input, and empty content area.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { FolderKanban, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** 260px sidebar showing OpenPowers Changes header, search, and content placeholder */
export function ProjectSidebar(): React.ReactElement {
  const { t } = useTranslation();

  return React.createElement(
    'div',
    {
      className:
        'flex flex-col w-[260px] h-full border-r bg-muted/20 overflow-hidden',
    },
    // Header
    React.createElement(
      'div',
      {
        className:
          'flex items-center justify-between px-3 py-2 border-b bg-muted/50',
      },
      React.createElement(
        'span',
        { className: 'text-sm font-medium text-foreground' },
        t('projectSidebar.title'),
      ),
      React.createElement(
        'div',
        { className: 'flex items-center gap-1' },
        React.createElement(FolderKanban, {
          size: 16,
          className: 'text-muted-foreground',
        }),
        React.createElement(History, {
          size: 16,
          className: 'text-muted-foreground',
        }),
      ),
    ),
    // Search input
    React.createElement(
      'div',
      { className: 'px-3 py-2' },
      React.createElement('input', {
        type: 'text',
        placeholder: t('projectSidebar.searchPlaceholder'),
        className:
          'w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
      }),
    ),
    // Empty content area (placeholder for future implementation)
    React.createElement('div', { className: 'flex-1' }),
  );
}
