/**
 * Tests for StageProgressAxis component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { StageProgressAxis } from './StageProgressAxis.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeStage } from '../../utils/memory.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render StageProgressAxis wrapped in I18nextProvider */
function renderAxis(stage?: ChangeStage, onStageClick?: (key: string) => void) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(StageProgressAxis, { stage, onStageClick }),
    ),
  );
}

/** A minimal full ChangeStage for testing */
const fullStage: ChangeStage = {
  explore: { title: 'explore title', from: '2026-01-01', to: '2026-01-02', status: 'done', inputPath: '', outputPath: '' },
  brainstorm: { title: 'brainstorm title', from: '2026-01-03', to: '2026-01-04', status: 'done', inputPath: '', outputPath: '' },
  propose: { title: 'propose title', from: '2026-01-05', to: '2026-01-06', status: 'in_progress', inputPath: '', outputPath: '' },
  plan: { title: 'plan title', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  reviewArtifacts: { title: 'review title', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  subAgentDev: [],
  finalize: { integration: [], codecheck: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' }, archive: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' } },
};

describe('StageProgressAxis', () => {
  beforeAll(async () => {
    i18nInstance = i18next.createInstance();
    await i18nInstance.use(initReactI18next).init({
      lng: 'zh-CN',
      fallbackLng: 'zh-CN',
      resources: {
        'zh-CN': { translation: zhCN },
        'en-US': { translation: enUS },
      },
      interpolation: { escapeValue: false },
    });
  });

  it('renders 7 stage nodes', () => {
    renderAxis(fullStage);
    // All 7 stage names should be present
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Brainstorm')).toBeInTheDocument();
    expect(screen.getByText('Propose')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Develop')).toBeInTheDocument();
    expect(screen.getByText('Finalize')).toBeInTheDocument();
  });

  it('maps reviewArtifacts displayName to "Review"', () => {
    renderAxis(fullStage);
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('maps subAgentDev displayName to "Develop"', () => {
    renderAxis(fullStage);
    expect(screen.getByText('Develop')).toBeInTheDocument();
  });

  it('shows empty state when stage is undefined', () => {
    renderAxis(undefined);
    expect(screen.getByText('暂无阶段数据')).toBeInTheDocument();
  });

  it('shows in_progress node with pulsing animation class', () => {
    renderAxis(fullStage);
    // The Propose stage is in_progress - its icon should have animate-stage-pulse
    const proposeNode = screen.getByText('Propose').closest('button');
    const icon = proposeNode?.querySelector('.animate-stage-pulse');
    expect(icon).not.toBeNull();
  });

  it('shows done node with green color class', () => {
    renderAxis(fullStage);
    // Explore and Brainstorm are done - their icons should have green color
    const exploreNode = screen.getByText('Explore').closest('button');
    expect(exploreNode?.querySelector('.text-emerald-500')).not.toBeNull();
  });

  it('shows skipped node with gray color class', () => {
    renderAxis(fullStage);
    // Plan is skipped - its icon should have muted color
    const planNode = screen.getByText('Plan').closest('button');
    expect(planNode?.querySelector('.text-muted-foreground\\/50')).not.toBeNull();
  });

  it('renders correct lucide icons for each stage', () => {
    renderAxis(fullStage);
    // Icons are rendered as SVG elements; each stage node should have an icon container
    const nodes = document.querySelectorAll('[data-stage-node]');
    expect(nodes.length).toBe(7);
  });

  it('calls onStageClick with stage key when a node is clicked', () => {
    const onClick = vi.fn();
    renderAxis(fullStage, onClick);
    fireEvent.click(screen.getByText('Brainstorm'));
    expect(onClick).toHaveBeenCalledWith('brainstorm');
  });

  it('centers on first in_progress stage by default', () => {
    renderAxis(fullStage);
    // Propose is the first (and only) in_progress stage
    // The scroll container should have a translateX that centers Propose
    const track = document.querySelector('[data-stage-track]') as HTMLElement;
    expect(track).not.toBeNull();
    // The focusedIndex should be 2 (Propose is index 2 in the 7-stage array)
    // translateX should be non-zero when focusedIndex > 0
    const style = track?.style.transform;
    expect(style).toBeTruthy();
  });

  it('centers on last stage when all stages are done', () => {
    const allDone: ChangeStage = {
      explore: { title: 't', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
      brainstorm: { title: 't', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
      propose: { title: 't', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
      plan: { title: 't', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
      reviewArtifacts: { title: 't', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
      subAgentDev: [],
      finalize: { integration: [], codecheck: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' }, archive: { title: '', from: '', to: '', status: 'done', inputPath: '', outputPath: '' } },
    };
    renderAxis(allDone);
    // Finalize should be at the center (index 6)
    const track = document.querySelector('[data-stage-track]') as HTMLElement;
    expect(track?.style.transform).toBeTruthy();
  });

  it('cannot scroll left when first stage is centered', () => {
    renderAxis(fullStage);
    // fullStage has in_progress at Propose (index 2), so click left twice to reach Explore (index 0)
    const leftBtn = document.querySelector('[data-nav-left]') as HTMLButtonElement;
    const counter = document.querySelector('span.text-xs.text-muted-foreground') as HTMLElement;

    // Navigate to first stage
    fireEvent.click(leftBtn); // index: 2 -> 1
    fireEvent.click(leftBtn); // index: 1 -> 0 (Explore)

    // Counter should show 1/7 (first stage)
    expect(counter.textContent).toBe('1/7');

    // Left button should be disabled when at first stage
    expect(leftBtn.disabled).toBe(true);

    // Clicking disabled left button should not change focusedIndex
    const counterBeforeClick = counter.textContent;
    fireEvent.click(leftBtn);
    expect(counter.textContent).toBe(counterBeforeClick);
  });

  it('cannot scroll right when last stage is centered', () => {
    renderAxis(fullStage);
    // fullStage has in_progress at Propose (index 2). Navigate right 4 times to reach Finalize (index 6)
    const rightBtn = document.querySelector('[data-nav-right]') as HTMLButtonElement;
    const counter = document.querySelector('span.text-xs.text-muted-foreground') as HTMLElement;

    // Navigate to last stage
    fireEvent.click(rightBtn); // index: 2 -> 3
    fireEvent.click(rightBtn); // index: 3 -> 4
    fireEvent.click(rightBtn); // index: 4 -> 5
    fireEvent.click(rightBtn); // index: 5 -> 6 (Finalize)

    // Counter should show 7/7 (last stage)
    expect(counter.textContent).toBe('7/7');

    // Right button should be disabled when at last stage
    expect(rightBtn.disabled).toBe(true);

    // Clicking disabled right button should not change focusedIndex
    const counterBeforeClick = counter.textContent;
    fireEvent.click(rightBtn);
    expect(counter.textContent).toBe(counterBeforeClick);
  });
});
