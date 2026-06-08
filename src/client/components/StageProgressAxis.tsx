/**
 * StageProgressAxis component renders a horizontal scrollable row of 7 workflow
 * stage nodes (Explore/Brainstorm/Propose/Plan/Review/Develop/Finalize).
 * Defaults to centering the first in_progress stage, supports click-to-scroll
 * with CSS transition, and applies status-specific visuals (pulse anim, ring glow,
 * green for done, gray for skipped).
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Lightbulb, FileText, ListChecks, Eye, Code2, Flag } from 'lucide-react';
import type { ChangeStage, StageStep } from '../../utils/memory.js';

// ---------------------------------------------------------------------------
// STAGE_CONFIG
// ---------------------------------------------------------------------------

/** Static configuration for the 7 workflow stages in fixed display order. */
export interface StageConfigItem {
  key: string;
  displayNameKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/** Ordered array of all 7 stage configurations for rendering. */
export const STAGE_CONFIG: StageConfigItem[] = [
  { key: 'explore', displayNameKey: 'progressAxis.stageName.explore', icon: Compass },
  { key: 'brainstorm', displayNameKey: 'progressAxis.stageName.brainstorm', icon: Lightbulb },
  { key: 'propose', displayNameKey: 'progressAxis.stageName.propose', icon: FileText },
  { key: 'plan', displayNameKey: 'progressAxis.stageName.plan', icon: ListChecks },
  { key: 'reviewArtifacts', displayNameKey: 'progressAxis.stageName.review', icon: Eye },
  { key: 'subAgentDev', displayNameKey: 'progressAxis.stageName.develop', icon: Code2 },
  { key: 'finalize', displayNameKey: 'progressAxis.stageName.finalize', icon: Flag },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps stage key to the stage data, handling special cases for subAgentDev and finalize. */
function getStageStep(stage: ChangeStage | undefined, key: string): StageStep | undefined {
  if (!stage) return undefined;
  if (key === 'subAgentDev' || key === 'finalize') {
    // Special stages: return a synthetic step from their sub-data
    if (key === 'finalize') {
      const f = stage.finalize;
      if (!f) return undefined;
      // Determine overall status: if all sub-stages done then done, etc.
      const subStatuses = [
        f.codecheck?.status,
        f.archive?.status,
        ...f.integration.map((i) => i.status),
      ];
      const allDone = subStatuses.length > 0 && subStatuses.every((s) => s === 'done');
      const allSkipped = subStatuses.length > 0 && subStatuses.every((s) => s === 'skipped');
      const status: StageStep['status'] = allDone ? 'done' : allSkipped ? 'skipped' : 'in_progress';
      return {
        title: '',
        from: '',
        to: '',
        status,
        inputPath: '',
        outputPath: '',
      };
    }
    if (key === 'subAgentDev') {
      const dev = stage.subAgentDev;
      if (!dev || dev.length === 0) return undefined;
      const allStatuses = dev.flatMap((d) => d.progress.map((p) => p.status));
      const allDone = allStatuses.length > 0 && allStatuses.every((s) => s === 'done');
      const allSkipped = allStatuses.length > 0 && allStatuses.every((s) => s === 'skipped');
      const status: StageStep['status'] = allDone ? 'done' : allSkipped ? 'skipped' : 'in_progress';
      return {
        title: '',
        from: '',
        to: '',
        status,
        inputPath: '',
        outputPath: '',
      };
    }
  }
  // Generic stages: explicit key checks for type narrowing
  if (key === 'explore') return stage.explore;
  if (key === 'brainstorm') return stage.brainstorm;
  if (key === 'propose') return stage.propose;
  if (key === 'plan') return stage.plan;
  if (key === 'reviewArtifacts') return stage.reviewArtifacts;
  return undefined;
}

/** Returns the index (0-6) of the first in_progress stage, or the last index if all done/skipped. */
function findActiveIndex(stage: ChangeStage | undefined): number {
  if (!stage) return 0;
  for (let i = 0; i < STAGE_CONFIG.length; i++) {
    const step = getStageStep(stage, STAGE_CONFIG[i].key);
    if (step && step.status === 'in_progress') return i;
  }
  // All done/skipped: center on last stage
  return STAGE_CONFIG.length - 1;
}

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface StageProgressAxisProps {
  stage?: ChangeStage;
  onStageClick?: (stageKey: string) => void;
  focusedIndex?: number;
  onFocusedIndexChange?: (index: number) => void;
  selectedStageKey?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Node width + gap in pixels, used to calculate translateX offset for centering. */
const NODE_WIDTH = 88;
const NODE_GAP = 4;
const NODE_STEP = NODE_WIDTH + NODE_GAP;

/**
 * Renders a horizontal scrollable row of 7 stage nodes with centering and
 * status-specific visuals. The visible viewport shows 3 nodes at a time.
 */
export function StageProgressAxis({
  stage,
  onStageClick,
  focusedIndex: controlledIndex,
  onFocusedIndexChange,
  selectedStageKey,
}: StageProgressAxisProps): React.ReactElement {
  const { t } = useTranslation();

  const defaultIndex = useMemo(() => findActiveIndex(stage), [stage]);
  const [internalIndex, setInternalIndex] = useState(defaultIndex);

  // Derive focusedIndex from selectedStageKey if provided
  const stageKeyIndex = useMemo(() => {
    if (!selectedStageKey) return undefined;
    return STAGE_CONFIG.findIndex((cfg) => cfg.key === selectedStageKey);
  }, [selectedStageKey]);

  const focusedIndex = controlledIndex !== undefined
    ? controlledIndex
    : stageKeyIndex !== undefined && stageKeyIndex >= 0
      ? stageKeyIndex
      : internalIndex;

  const setFocusedIndex = useCallback(
    (idx: number) => {
      if (controlledIndex !== undefined) {
        onFocusedIndexChange?.(idx);
      } else {
        setInternalIndex(idx);
      }
    },
    [controlledIndex, onFocusedIndexChange],
  );

  // Empty state
  if (!stage) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center py-8 text-sm text-muted-foreground' },
      t('progressAxis.emptyStage'),
    );
  }

  const canGoLeft = focusedIndex > 0;
  const canGoRight = focusedIndex < STAGE_CONFIG.length - 1;

  const handleLeftClick = () => {
    if (canGoLeft) {
      setFocusedIndex(focusedIndex - 1);
    }
  };

  const handleRightClick = () => {
    if (canGoRight) {
      setFocusedIndex(focusedIndex + 1);
    }
  };

  // translateX: offset so that focusedIndex node is centered in the viewport
  // The viewport width is 3 * NODE_STEP - NODE_GAP, so the center is at (viewportWidth / 2 - NODE_WIDTH / 2)
  // Each node starts at its position * NODE_STEP
  // translateX shifts the track left by: focusedIndex * NODE_STEP - (viewportWidth / 2 - NODE_WIDTH / 2)
  const viewportWidth = 3 * NODE_STEP;
  const centerOffset = (viewportWidth - NODE_WIDTH) / 2;
  const translateX = -(focusedIndex * NODE_STEP - centerOffset);

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center' },
    // Viewport with overflow hidden to clip to 3 nodes
    React.createElement(
      'div',
      {
        className: 'relative w-full overflow-hidden',
        style: { height: '96px' },
      },
      // Track that slides via translateX
      React.createElement(
        'div',
        {
          'data-stage-track': '',
          className: 'flex items-center gap-1 absolute',
          style: {
            transform: `translateX(${translateX}px)`,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          },
        },
        ...STAGE_CONFIG.map((cfg, index) => {
          const step = getStageStep(stage, cfg.key);
          const status = step?.status ?? 'skipped';
          const isFocused = index === focusedIndex;
          const IconComponent = cfg.icon;

          // Color classes per status
          const iconColorClass =
            status === 'done'
              ? 'text-emerald-500'
              : status === 'in_progress'
                ? 'text-blue-500'
                : 'text-muted-foreground/50';

          const bgColorClass =
            status === 'done'
              ? 'bg-emerald-500/10'
              : status === 'in_progress'
                ? 'bg-blue-500/10'
                : 'bg-muted/30';

          const ringClass =
            status === 'in_progress'
              ? 'ring-2 ring-blue-500/30 animate-stage-ring-glow'
              : '';

          const pulseClass = status === 'in_progress' ? 'animate-stage-pulse' : '';

          const lineColorClass =
            status === 'done'
              ? 'bg-emerald-500'
              : status === 'in_progress'
                ? 'bg-blue-500'
                : 'bg-muted-foreground/25';

          return React.createElement(
            'button',
            {
              key: cfg.key,
              'data-stage-node': '',
              'data-stage-key': cfg.key,
              type: 'button',
              className: `flex flex-col items-center gap-1.5 flex-shrink-0 rounded-lg px-1.5 py-2 transition-all duration-200 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${isFocused ? 'bg-muted/20' : ''}`,
              style: { width: `${NODE_WIDTH}px` },
              onClick: () => {
                if (index !== focusedIndex) {
                  setFocusedIndex(index);
                }
                onStageClick?.(cfg.key);
              },
            },
            // Icon circle
            React.createElement(
              'div',
              {
                className: `flex items-center justify-center w-9 h-9 rounded-full ${bgColorClass} ${ringClass} ${pulseClass} flex-shrink-0`,
              },
              React.createElement(IconComponent, {
                size: 18,
                className: iconColorClass,
              }),
            ),
            // Stage name label
            React.createElement(
              'span',
              {
                className: `text-[11px] leading-tight font-medium text-center whitespace-nowrap ${isFocused ? 'text-foreground' : 'text-muted-foreground/70'}`,
              },
              t(cfg.displayNameKey),
            ),
            // Progress dot indicator
            React.createElement(
              'div',
              { className: `w-1.5 h-1.5 rounded-full ${lineColorClass}` },
            ),
          );
        }),
      ),
    ),
    // Navigation buttons row
    React.createElement(
      'div',
      { className: 'flex items-center justify-center gap-3 mt-2' },
      React.createElement(
        'button',
        {
          'data-nav-left': '',
          type: 'button',
          disabled: !canGoLeft,
          onClick: handleLeftClick,
          className: `p-1 rounded-md transition-colors ${canGoLeft ? 'text-foreground hover:bg-muted cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'}`,
          'aria-label': t('progressAxis.scrollLeft'),
        },
        React.createElement(
          'svg',
          { xmlns: 'http://www.w3.org/2000/svg', width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const },
          React.createElement('polyline', { points: '15 18 9 12 15 6' }),
        ),
      ),
      React.createElement(
        'span',
        { className: 'text-xs text-muted-foreground select-none min-w-[3ch] text-center' },
        `${focusedIndex + 1}/${STAGE_CONFIG.length}`,
      ),
      React.createElement(
        'button',
        {
          'data-nav-right': '',
          type: 'button',
          disabled: !canGoRight,
          onClick: handleRightClick,
          className: `p-1 rounded-md transition-colors ${canGoRight ? 'text-foreground hover:bg-muted cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'}`,
          'aria-label': t('progressAxis.scrollRight'),
        },
        React.createElement(
          'svg',
          { xmlns: 'http://www.w3.org/2000/svg', width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const },
          React.createElement('polyline', { points: '9 18 15 12 9 6' }),
        ),
      ),
    ),
  );
}
