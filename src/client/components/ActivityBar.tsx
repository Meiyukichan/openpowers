/**
 * ActivityBar component - vertical icon bar (48px) on the far left.
 * Provides view switching between providers and projects.
 * VSCode-style: selected icon has highlight background + left border indicator.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { Server, FolderKanban } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ActivityBarView = 'providers' | 'projects';

interface ActivityBarProps {
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
}

/** 48px vertical bar with Server and FolderKanban icon buttons */
export function ActivityBar({ activeView, onViewChange }: ActivityBarProps): React.ReactElement {
  const { t } = useTranslation();

  /** Shared icon button styles */
  const iconBtnBase = 'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200';
  const iconBtnActive = 'bg-blue-500/10 text-blue-500 shadow-md shadow-blue-500/20';
  const iconBtnInactive = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:shadow-sm hover:scale-105';

  return React.createElement(
    'div',
    {
      className:
        'flex flex-col items-center w-12 h-full border-r pt-3 gap-1.5',
      style: { background: 'linear-gradient(180deg, hsl(var(--muted)/0.5) 0%, hsl(var(--muted)/0.2) 100%)' },
    },
    // Server (providers) icon button
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onViewChange('providers'),
        'aria-label': t('layout.activityBar.providersAriaLabel'),
        title: t('layout.activityBar.providers'),
        className: `${iconBtnBase} ${activeView === 'providers' ? iconBtnActive : iconBtnInactive}`,
      },
      activeView === 'providers' &&
        React.createElement('div', {
          className:
            'absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] bg-blue-500 rounded-r-full shadow-md shadow-blue-500/50',
        }),
      React.createElement(Server, { size: 20 }),
    ),
    // FolderKanban (projects) icon button
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onViewChange('projects'),
        'aria-label': t('layout.activityBar.projectsAriaLabel'),
        title: t('layout.activityBar.projects'),
        className: `${iconBtnBase} ${activeView === 'projects' ? iconBtnActive : iconBtnInactive}`,
      },
      activeView === 'projects' &&
        React.createElement('div', {
          className:
            'absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] bg-blue-500 rounded-r-full shadow-md shadow-blue-500/50',
        }),
      React.createElement(FolderKanban, { size: 20 }),
    ),
  );
}
