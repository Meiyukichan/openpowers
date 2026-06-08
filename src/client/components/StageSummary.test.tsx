/**
 * Tests for StageSummary component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { StageSummary } from './StageSummary.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeStage } from '../../utils/memory.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render StageSummary wrapped in I18nextProvider */
function renderSummary(stage?: ChangeStage, selectedKey?: string) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(StageSummary, { stage, selectedStageKey: selectedKey }),
    ),
  );
}

const fullStage: ChangeStage = {
  explore: { title: '探索需求', from: '2026-01-01', to: '2026-01-02', status: 'done', inputPath: '', outputPath: '' },
  brainstorm: { title: '头脑风暴', from: '2026-01-03', to: '2026-01-04', status: 'done', inputPath: '', outputPath: '' },
  propose: { title: '提交方案', from: '2026-01-05', to: '2026-01-06', status: 'in_progress', inputPath: '', outputPath: '' },
  plan: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  reviewArtifacts: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  subAgentDev: [
    {
      featureId: 'ui-01',
      progress: [
        { title: 'task1', from: '2026-01-10', to: '2026-01-11', status: 'done', inputPath: '', outputPath: '' },
        { title: 'task2', from: '2026-01-12', to: '2026-01-13', status: 'in_progress', inputPath: '', outputPath: '' },
      ],
    },
    {
      featureId: 'ui-02',
      progress: [
        { title: 'task3', from: '2026-01-14', to: '2026-01-15', status: 'in_progress', inputPath: '', outputPath: '' },
      ],
    },
  ],
  finalize: {
    integration: [
      { title: '集成测试A', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
    ],
    codecheck: { title: '代码审查', from: '', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
    archive: { title: '归档', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
  },
};

describe('StageSummary', () => {
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

  it('shows generic stage summary with title and status', () => {
    renderSummary(fullStage, 'explore');
    // Title
    expect(screen.getByText('探索需求')).toBeInTheDocument();
    // Status
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('shows time range for generic stage', () => {
    renderSummary(fullStage, 'explore');
    expect(screen.getByText('2026-01-01 → 2026-01-02')).toBeInTheDocument();
  });

  it('shows no data when stage key does not exist in data', () => {
    renderSummary(fullStage, 'explore');
    // explore exists, so this should show data
    expect(screen.getByText('探索需求')).toBeInTheDocument();
  });

  it('shows no data when stage is undefined', () => {
    renderSummary(undefined, 'explore');
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('shows guide hint when selectedStageKey is undefined', () => {
    renderSummary(fullStage, undefined);
    // Should show guide text encouraging user to select a stage
    expect(screen.getByText('点击左侧变更卡片查看阶段进度详情')).toBeInTheDocument();
  });

  it('renders Finalize sub-stage list', () => {
    renderSummary(fullStage, 'finalize');
    // Should show sub-stage heading names
    expect(screen.getByText('集成测试')).toBeInTheDocument();
    expect(screen.getByText('代码检查')).toBeInTheDocument();
    // "归档" appears both as heading and as title (archive's title="归档"), so use getAllByText
    expect(screen.getAllByText('归档').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Finalize sub-stage statuses', () => {
    renderSummary(fullStage, 'finalize');
    // Each sub-stage has a status badge
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText('skipped')).toBeInTheDocument();
  });

  it('renders Develop feature list', () => {
    renderSummary(fullStage, 'subAgentDev');
    // Feature IDs should be displayed
    expect(screen.getByText('ui-01')).toBeInTheDocument();
    expect(screen.getByText('ui-02')).toBeInTheDocument();
  });

  it('shows feature progress statuses', () => {
    renderSummary(fullStage, 'subAgentDev');
    // Progress items with statuses
    expect(screen.getByText('task1')).toBeInTheDocument();
    expect(screen.getByText('task2')).toBeInTheDocument();
  });

  it('shows empty feature message when subAgentDev is empty', () => {
    const stage: ChangeStage = {
      ...fullStage,
      subAgentDev: [],
    };
    renderSummary(stage, 'subAgentDev');
    expect(screen.getByText('暂无 feature 数据')).toBeInTheDocument();
  });
});
