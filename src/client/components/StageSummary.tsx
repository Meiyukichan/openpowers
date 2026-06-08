/**
 * StageSummary component displays detailed information for the currently
 * selected stage. Renders conditionally based on stage type:
 * - Generic stages: title, from→to time, status
 * - Finalize: sub-stage list (integration, codecheck, archive)
 * - subAgentDev: feature progress list
 * Shows "no data" prompt when stage data is missing.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChangeStage, StageStep } from '../../utils/memory.js';

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface StageSummaryProps {
  stage?: ChangeStage;
  selectedStageKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the StageStep for a given key from the ChangeStage. */
function getStageData(stage: ChangeStage | undefined, key: string): StageStep | undefined {
  if (!stage) return undefined;
  if (key === 'subAgentDev' || key === 'finalize') return undefined;
  // Generic stages: explicit key checks for type narrowing
  if (key === 'explore') return stage.explore;
  if (key === 'brainstorm') return stage.brainstorm;
  if (key === 'propose') return stage.propose;
  if (key === 'plan') return stage.plan;
  if (key === 'reviewArtifacts') return stage.reviewArtifacts;
  return undefined;
}

/** Status badge color mapping */
const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  skipped: 'bg-muted text-muted-foreground border-muted-foreground/20',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders a status badge for a given status string. */
function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.skipped;
  return React.createElement(
    'span',
    {
      className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClass}`,
    },
    status,
  );
}

/** Renders a single StageStep row with title, time, and status. */
function StageStepRow({ step }: { step: StageStep }): React.ReactElement {
  const { t } = useTranslation();
  return React.createElement(
    'div',
    { className: 'rounded-lg bg-muted/30 px-3 py-2.5' },
    // Title + Status
    React.createElement(
      'div',
      { className: 'flex items-center justify-between mb-1' },
      React.createElement(
        'span',
        { className: 'text-sm font-medium text-foreground truncate', title: step.title },
        step.title || t('detailPanel.noData'),
      ),
      React.createElement(StatusBadge, { status: step.status }),
    ),
    // Time range
    (step.from || step.to) &&
      React.createElement(
        'div',
        { className: 'text-[11px] text-muted-foreground' },
        t('detailPanel.fromTo', { from: step.from || '-', to: step.to || '-' }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Renders stage summary details based on the selected stage key.
 * Handles generic stages, Finalize sub-stages, and Develop feature lists.
 */
export function StageSummary({ stage, selectedStageKey }: StageSummaryProps): React.ReactElement {
  const { t } = useTranslation();

  // No stage data at all
  if (!stage) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
      t('detailPanel.noData'),
    );
  }

  // No stage selected by user — show guide hint
  if (!selectedStageKey) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
      t('detailPanel.guideText'),
    );
  }

  // --- Finalize ---
  if (selectedStageKey === 'finalize') {
    const finalize = stage.finalize;
    if (!finalize) {
      return React.createElement(
        'div',
        { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
        t('detailPanel.noData'),
      );
    }

    const subStages: { labelKey: string; item: StageStep | StageStep[] }[] = [
      { labelKey: 'detailPanel.subStage.integration', item: finalize.integration },
      { labelKey: 'detailPanel.subStage.codecheck', item: finalize.codecheck },
      { labelKey: 'detailPanel.subStage.archive', item: finalize.archive },
    ];

    return React.createElement(
      'div',
      { className: 'space-y-3' },
      ...subStages.map(({ labelKey, item }) =>
        React.createElement(
          'div',
          { key: labelKey, className: 'space-y-1.5' },
          React.createElement(
            'h4',
            { className: 'text-xs font-semibold text-muted-foreground uppercase tracking-wider' },
            t(labelKey),
          ),
          Array.isArray(item)
            ? item.length > 0
              ? React.createElement(
                  'div',
                  { className: 'space-y-1' },
                  ...item.map((step, i) =>
                    React.createElement(StageStepRow, { key: i, step }),
                  ),
                )
              : React.createElement(
                  'p',
                  { className: 'text-xs text-muted-foreground' },
                  t('detailPanel.noData'),
                )
            : React.createElement(StageStepRow, { step: item }),
        ),
      ),
    );
  }

  // --- Develop (subAgentDev) ---
  if (selectedStageKey === 'subAgentDev') {
    const dev = stage.subAgentDev;
    if (!dev || dev.length === 0) {
      return React.createElement(
        'div',
        { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
        t('detailPanel.noFeatureData'),
      );
    }

    return React.createElement(
      'div',
      { className: 'space-y-3' },
      ...dev.map((feature) =>
        React.createElement(
          'div',
          { key: feature.featureId, className: 'rounded-lg border bg-card/50 px-3 py-2.5' },
          React.createElement(
            'div',
            { className: 'flex items-center gap-2 mb-2' },
            React.createElement(
              'span',
              { className: 'text-xs font-semibold text-foreground' },
              feature.featureId,
            ),
          ),
          React.createElement(
            'div',
            { className: 'space-y-1.5' },
            ...feature.progress.map((step, i) =>
              React.createElement(StageStepRow, { key: i, step }),
            ),
          ),
        ),
      ),
    );
  }

  // --- Generic stage ---
  const step = getStageData(stage, selectedStageKey);
  if (!step) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-6 text-sm text-muted-foreground' },
      t('detailPanel.noData'),
    );
  }

  return React.createElement(
    'div',
    { className: 'space-y-3' },
    React.createElement(StageStepRow, { step }),
  );
}
