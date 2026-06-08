/**
 * Tests for ProjectGroup component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ProjectGroup } from './ProjectGroup.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';
import type { ChangeEntryWithCwd } from '../../server/changes/shared.js';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render ProjectGroup wrapped in I18nextProvider */
function renderProjectGroup(cwd: string, changes: ChangeEntryWithCwd[]) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(ProjectGroup, { cwd, changes }),
    ),
  );
}

const changes: ChangeEntryWithCwd[] = [
  {
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
  },
  {
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
  },
  {
    name: 'older-change',
    path: 'openpowers/changes/older',
    description: 'An older change',
    createdAt: '2026-06-05T10:00:00Z',
    updateAt: '2026-06-06T10:00:00Z',
    status: 'active',
    features: 0,
    todo: 0,
    artifacts: [],
    cwd: 'D:\\project-code\\llm\\openpowers',
  },
];

describe('ProjectGroup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('renders cwd path in group header', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    // The cwd appears in both header and cards; verify at least one instance
    const cwdElements = screen.getAllByText(/D:\\project-code\\llm\\openpowers/);
    expect(cwdElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders active and archived counts in group header', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    // 2 active + 1 archived = 3 total shown as individual badges
    expect(screen.getByText('2')).toBeInTheDocument(); // active count
    expect(screen.getByText('1')).toBeInTheDocument(); // archived count
  });

  it('is collapsed by default', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    expect(screen.queryByText('ui-changes-page')).not.toBeInTheDocument();
    expect(screen.queryByText('brainstorm-mode')).not.toBeInTheDocument();
    expect(screen.queryByText('older-change')).not.toBeInTheDocument();
  });

  it('expands group when header is clicked', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    const header = document.querySelector('.cursor-pointer');
    expect(header).toBeInTheDocument();

    fireEvent.click(header!);

    // Cards should be visible after click
    expect(screen.getByText('ui-changes-page')).toBeInTheDocument();
  });

  it('collapses group again when clicked after expand', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    const header = document.querySelector('.cursor-pointer');

    // Expand
    fireEvent.click(header!);
    expect(screen.getByText('ui-changes-page')).toBeInTheDocument();

    // Collapse
    fireEvent.click(header!);
    expect(screen.queryByText('ui-changes-page')).not.toBeInTheDocument();
  });

  it('renders changes sorted by updateAt descending', () => {
    renderProjectGroup('D:\\project-code\\llm\\openpowers', changes);
    fireEvent.click(document.querySelector('.cursor-pointer')!);

    const nameElements = document.querySelectorAll('.rounded-xl h3');
    const names = Array.from(nameElements).map((el) => el.textContent);

    expect(names[0]).toBe('ui-changes-page'); // 2026-06-08 (newest)
    expect(names[1]).toBe('brainstorm-mode'); // 2026-06-07
    expect(names[2]).toBe('older-change'); // 2026-06-06 (oldest)
  });

  it('places changes with undefined updateAt last in sort order', () => {
    const changesWithMissingUpdateAt: ChangeEntryWithCwd[] = [
      {
        name: 'no-update-at',
        path: 'openpowers/changes/no-update',
        description: 'Change without updateAt',
        createdAt: '2026-06-08T10:00:00Z',
        updateAt: undefined,
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        cwd: 'D:\\project-code\\llm\\openpowers',
      },
      {
        name: 'has-update-at',
        path: 'openpowers/changes/has-update',
        description: 'Change with updateAt',
        createdAt: '2026-06-07T08:00:00Z',
        updateAt: '2026-06-07T14:00:00Z',
        status: 'active',
        features: 0,
        todo: 0,
        artifacts: [],
        cwd: 'D:\\project-code\\llm\\openpowers',
      },
      {
        name: 'also-no-update',
        path: 'openpowers/changes/also-no-update',
        description: 'Another change without updateAt',
        createdAt: '2026-06-06T10:00:00Z',
        updateAt: undefined,
        status: 'archived',
        features: 0,
        todo: 0,
        artifacts: [],
        cwd: 'D:\\project-code\\llm\\openpowers',
      },
    ];

    renderProjectGroup('D:\\project-code\\llm\\openpowers', changesWithMissingUpdateAt);
    fireEvent.click(document.querySelector('.cursor-pointer')!);

    const nameElements = document.querySelectorAll('.rounded-xl h3');
    const names = Array.from(nameElements).map((el) => el.textContent);

    // Changes with updateAt should come first
    expect(names[0]).toBe('has-update-at');
    // Changes without updateAt should be last (order preserved between them)
    expect(names[1]).toBe('no-update-at');
    expect(names[2]).toBe('also-no-update');
  });
});
