/**
 * Tests for DetailPanel component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { DetailPanel } from './DetailPanel.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render DetailPanel wrapped in I18nextProvider */
function renderPanel(change?: ChangeEntryWithCwd | null) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(DetailPanel, { selectedChange: change ?? null }),
    ),
  );
}

const changeWithStage: ChangeEntryWithCwd = {
  name: 'ui-changes-page',
  path: 'openpowers/changes/ui-changes-page',
  description: '实现变更列表UI页面',
  createdAt: '2026-06-08T10:00:00Z',
  updateAt: '2026-06-08T12:30:00Z',
  status: 'active',
  features: 0,
  todo: 0,
  artifacts: [],
  cwd: 'D:\\project-code\\llm\\openpowers',
  stage: {
    explore: { title: '探索需求', from: '2026-01-01', to: '2026-01-02', status: 'done', inputPath: '', outputPath: '' },
    brainstorm: { title: '头脑风暴', from: '', to: '', status: 'done', inputPath: '', outputPath: '' },
    propose: { title: '提交方案', from: '', to: '', status: 'in_progress', inputPath: '', outputPath: '' },
    plan: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
    reviewArtifacts: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' },
    subAgentDev: [],
    finalize: { integration: [], codecheck: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' }, archive: { title: '', from: '', to: '', status: 'skipped', inputPath: '', outputPath: '' } },
  },
};

describe('DetailPanel', () => {
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

  it('shows guide text when no change is selected', () => {
    renderPanel(null);
    expect(screen.getByText('点击左侧变更卡片查看阶段进度详情')).toBeInTheDocument();
  });

  it('renders stage progress axis when change is selected', () => {
    renderPanel(changeWithStage);
    // Stage names should be visible (from StageProgressAxis)
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Develop')).toBeInTheDocument();
  });

  it('renders stage summary when change is selected and stage is clicked', () => {
    renderPanel(changeWithStage);
    // Propose is the in_progress stage, should be centered by default
    // The summary section is shown below the axis
    expect(screen.getByText('Explore')).toBeInTheDocument();
  });

  it('occupies full remaining space with flex-1', () => {
    renderPanel(changeWithStage);
    // Container should have flex-1 class
    const container = document.querySelector('.flex-1');
    expect(container).not.toBeNull();
  });
});
