/**
 * Tests for ChangeCard component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ChangeCard } from './ChangeCard.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render ChangeCard wrapped in I18nextProvider */
function renderChangeCard(change: ChangeEntryWithCwd) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(ChangeCard, { change }),
    ),
  );
}

const activeChange: ChangeEntryWithCwd = {
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
};

const archivedChange: ChangeEntryWithCwd = {
  name: 'brainstorm-mode',
  path: 'openpowers/archive/brainstorm-mode',
  description: '补全 brainstorm mode hooks',
  createdAt: '2026-06-07T08:00:00Z',
  updateAt: '2026-06-07T14:00:00Z',
  status: 'archived',
  features: 0,
  todo: 0,
  artifacts: [],
  cwd: 'D:\\project-code\\llm\\openpowers',
};

const changeMissingDescription: ChangeEntryWithCwd = {
  name: 'minimal-change',
  path: 'openpowers/changes/minimal',
  description: '',
  createdAt: '2026-06-08T10:00:00Z',
  status: 'active',
  features: 0,
  todo: 0,
  artifacts: [],
  cwd: 'D:\\project-code\\llm\\openpowers',
};

describe('ChangeCard', () => {
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

  it('renders change name', () => {
    renderChangeCard(activeChange);
    expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
  });

  it('renders change description', () => {
    renderChangeCard(activeChange);
    expect(screen.getByText('实现变更列表UI页面')).toBeInTheDocument();
  });

  it('renders cwd path', () => {
    renderChangeCard(activeChange);
    expect(screen.getByText('D:\\project-code\\llm\\openpowers')).toBeInTheDocument();
  });

  it('displays active status icon for active change', () => {
    renderChangeCard(activeChange);
    // Active status icon should be present - check for the lucide icon element
    const card = document.querySelector('.rounded-xl');
    expect(card).toBeInTheDocument();
    // The status icon should have a specific color class for active
    expect(card?.querySelector('.text-green-500')).toBeInTheDocument();
  });

  it('displays archived status icon for archived change', () => {
    renderChangeCard(archivedChange);
    const card = document.querySelector('.rounded-xl');
    expect(card).toBeInTheDocument();
    // The status icon should have a specific color class for archived
    expect(card?.querySelector('.text-amber-500')).toBeInTheDocument();
  });

  it('shows green left border on hover for active change', () => {
    renderChangeCard(activeChange);
    const card = document.querySelector('.rounded-xl') as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe('rgb(34, 197, 94)');
    fireEvent.mouseEnter(card);
    expect(card.style.borderLeftColor).toBe('rgb(34, 197, 94)');
    fireEvent.mouseLeave(card);
    expect(card.style.borderLeftColor).not.toBe('rgb(34, 197, 94)');
  });

  it('shows amber left border on hover for archived change', () => {
    renderChangeCard(archivedChange);
    const card = document.querySelector('.rounded-xl') as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe('rgb(245, 158, 11)');
    fireEvent.mouseEnter(card);
    expect(card.style.borderLeftColor).toBe('rgb(245, 158, 11)');
    fireEvent.mouseLeave(card);
    expect(card.style.borderLeftColor).not.toBe('rgb(245, 158, 11)');
  });

  it('renders without error when description is missing', () => {
    renderChangeCard(changeMissingDescription);
    expect(screen.getByText('minimal-change')).toBeInTheDocument();
    expect(screen.getByText('D:\\project-code\\llm\\openpowers')).toBeInTheDocument();
  });
});
