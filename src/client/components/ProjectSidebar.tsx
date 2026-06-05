/**
 * ProjectSidebar component (260px) - skeleton for project management view.
 * Header with title + icons, search input, and empty content area.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState } from 'react';
import { FolderKanban, History, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SidebarTab = 'projects' | 'recent';

/** 260px sidebar showing Changes header, search, and content placeholder */
export function ProjectSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SidebarTab>('recent');

  /** Shared tab button style for project/recent toggle */
  const tabBtnBase =
    'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200';
  const tabActive = 'text-blue-500 bg-blue-500/10 shadow-sm shadow-blue-500/15 hover:bg-blue-500/20';
  const tabInactive = 'text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-sm';

  return React.createElement(
    'div',
    {
      className:
        'flex flex-col w-[260px] h-full border-r overflow-hidden',
      style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.4) 0%, hsl(var(--background)) 40px, hsl(var(--background)) 100%)' },
    },
    // Header — elevated with subtle shadow
    React.createElement(
      'div',
      {
        className:
          'flex items-center justify-between px-3 py-3',
        style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.5) 0%, hsl(var(--muted)/0.15) 100%)' },
      },
      React.createElement(
        'div',
        { className: 'flex items-center gap-1.5' },
        React.createElement(Sparkles, {
          size: 14,
          className: 'text-blue-500',
          style: { filter: 'drop-shadow(0 0 3px rgba(59,130,246,0.4))' },
        }),
        React.createElement(
          'span',
          {
            className: 'text-sm font-extrabold tracking-widest uppercase',
            style: {
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #6366f1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.12em',
            },
          },
          t('projectSidebar.title'),
        ),
      ),
      React.createElement(
        'div',
        { className: 'flex items-center gap-1' },
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': t('projectSidebar.recentView'),
            title: t('projectSidebar.recentView'),
            onClick: () => setActiveTab('recent'),
            className: `${tabBtnBase} ${activeTab === 'recent' ? tabActive : tabInactive}`,
          },
          React.createElement(History, { size: 18 }),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-label': t('projectSidebar.projectView'),
            title: t('projectSidebar.projectView'),
            onClick: () => setActiveTab('projects'),
            className: `${tabBtnBase} ${activeTab === 'projects' ? tabActive : tabInactive}`,
          },
          React.createElement(FolderKanban, { size: 18 }),
        ),
      ),
    ),
    // Search input — recessed/inset style for depth
    React.createElement(
      'div',
      { className: 'px-3 pt-1 pb-2' },
      React.createElement('input', {
        type: 'text',
        placeholder: t('projectSidebar.searchPlaceholder'),
        className:
          'w-full rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 focus:bg-background focus:shadow-none transition-all duration-200',
      }),
    ),
    // Empty content area (placeholder for future implementation)
    React.createElement('div', { className: 'flex-1 bg-background' }),
  );
}
