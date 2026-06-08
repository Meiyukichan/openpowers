/**
 * DetailPanel component displays the stage progress axis and summary
 * for a selected change. When no change is selected, shows a guide prompt
 * instructing the user to click a change card. Takes up flex-1 space.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';
import { StageProgressAxis } from './StageProgressAxis.js';
import { StageSummary } from './StageSummary.js';

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface DetailPanelProps {
  selectedChange: ChangeEntryWithCwd | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the detail panel for the selected change.
 * Shows StageProgressAxis + StageSummary when a change is selected,
 * or a guide prompt when no change is selected.
 */
export function DetailPanel({ selectedChange }: DetailPanelProps): React.ReactElement {
  const { t } = useTranslation();

  const [selectedStageKey, setSelectedStageKey] = useState<string | undefined>(undefined);

  const handleStageClick = useCallback((stageKey: string) => {
    setSelectedStageKey(stageKey);
  }, []);

  // No change selected - show guide
  if (!selectedChange) {
    return React.createElement(
      'div',
      { className: 'flex-1 flex items-center justify-center' },
      React.createElement(
        'div',
        { className: 'flex flex-col items-center gap-3 text-center p-8' },
        React.createElement(
          'div',
          { className: 'flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10' },
          React.createElement(Sparkles, { size: 28, className: 'text-blue-500/60' }),
        ),
        React.createElement(
          'p',
          { className: 'text-sm text-muted-foreground max-w-xs' },
          t('detailPanel.guideText'),
        ),
      ),
    );
  }

  return React.createElement(
    'div',
    { className: 'flex-1 flex flex-col overflow-y-auto' },
    // Header with change name
    React.createElement(
      'div',
      { className: 'px-6 pt-6 pb-2' },
      React.createElement(
        'h2',
        { className: 'text-lg font-bold text-foreground truncate', title: selectedChange.name },
        selectedChange.name,
      ),
      selectedChange.description &&
        React.createElement(
          'p',
          { className: 'text-xs text-muted-foreground mt-1 line-clamp-2', title: selectedChange.description },
          selectedChange.description,
        ),
    ),
    // Stage Progress Axis
    React.createElement(
      'div',
      { className: 'px-6 py-4' },
      React.createElement(StageProgressAxis, {
        stage: selectedChange.stage,
        onStageClick: handleStageClick,
        selectedStageKey,
      }),
    ),
    // Divider
    React.createElement('hr', { className: 'mx-6 border-border' }),
    // Stage Summary
    React.createElement(
      'div',
      { className: 'flex-1 px-6 py-4 overflow-y-auto' },
      React.createElement(StageSummary, {
        stage: selectedChange.stage,
        selectedStageKey,
      }),
    ),
  );
}
