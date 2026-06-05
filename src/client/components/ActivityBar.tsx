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

  return React.createElement(
    'div',
    {
      className:
        'flex flex-col items-center w-12 h-full border-r bg-muted/30 pt-3 gap-1',
    },
    // Server (providers) icon button
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onViewChange('providers'),
        'aria-label': t('layout.activityBar.providersAriaLabel'),
        title: t('layout.activityBar.providers'),
        className: `relative flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
          activeView === 'providers'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`,
      },
      activeView === 'providers' &&
        React.createElement('div', {
          className: 'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-blue-500 rounded-r-full',
        }),
      React.createElement(Server, { size: 22 }),
    ),
    // FolderKanban (projects) icon button
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onViewChange('projects'),
        'aria-label': t('layout.activityBar.projectsAriaLabel'),
        title: t('layout.activityBar.projects'),
        className: `relative flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
          activeView === 'projects'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`,
      },
      activeView === 'projects' &&
        React.createElement('div', {
          className: 'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-blue-500 rounded-r-full',
        }),
      React.createElement(FolderKanban, { size: 22 }),
    ),
  );
}
