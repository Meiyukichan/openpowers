/**
 * Tests for Layout component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { Layout } from './Layout.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

const defaultProps = {
  onAddProvider: vi.fn(),
  onReset: vi.fn(),
  showToast: vi.fn(),
  enableOpenpowersProxy: false,
  onToggleProxy: vi.fn(),
  activeView: 'providers' as const,
  onViewChange: vi.fn(),
  sidebar: null as React.ReactNode,
};

/** Helper to render Layout wrapped in I18nextProvider */
function renderLayout(props: Partial<typeof defaultProps> = {}, children?: React.ReactNode) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(Layout, {
        ...defaultProps,
        ...props,
        children: children || React.createElement('div', null, 'content'),
      }),
    ),
  );
}

describe('Layout', () => {
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

  it('renders the brand name OpenPowers', () => {
    renderLayout();
    expect(screen.getByText('OpenPowers')).toBeInTheDocument();
  });

  it('renders session management icon-only button (no text label)', () => {
    renderLayout();
    const sessionBtn = screen.getByLabelText('会话管理');
    expect(sessionBtn).toBeInTheDocument();
    // Icon-only: should not contain the text label
    expect(sessionBtn.textContent).toBe('');
  });

  it('session management button click has no effect', async () => {
    const user = userEvent.setup();
    renderLayout();
    const sessionBtn = screen.getByLabelText('会话管理');
    await user.click(sessionBtn);
    // Button should still exist and not throw (placeholder)
    expect(sessionBtn).toBeInTheDocument();
  });

  it('renders add button with orange background', () => {
    renderLayout();
    const addButton = screen.getByLabelText('添加供应商');
    expect(addButton.className).toContain('bg-orange-500');
  });

  it('calls onAddProvider when add button is clicked', async () => {
    const onAddProvider = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onAddProvider });
    const addButton = screen.getByLabelText('添加供应商');
    await user.click(addButton);
    expect(onAddProvider).toHaveBeenCalledOnce();
  });

  it('renders language switcher between session management and add button', () => {
    renderLayout();
    const sessionBtn = screen.getByLabelText('会话管理');
    const languageSwitcher = screen.getByLabelText('Switch to English');
    const addButton = screen.getByLabelText('添加供应商');
    // All three should be in the same parent container (right-side button group)
    expect(sessionBtn.parentElement).toBe(languageSwitcher.parentElement);
    expect(languageSwitcher.parentElement).toBe(addButton.parentElement);
    // LanguageSwitcher should be between session button and add button
    expect(sessionBtn.nextElementSibling).toBe(languageSwitcher);
    expect(languageSwitcher.nextElementSibling).toBe(addButton);
  });

  it('renders children content', () => {
    renderLayout(
      {},
      React.createElement('div', { 'data-testid': 'child' }, 'child content'),
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders reset button', () => {
    renderLayout();
    expect(screen.getByLabelText('还原供应商')).toBeInTheDocument();
  });

  it('shows confirm dialog when reset button is clicked', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onReset });
    const resetBtn = screen.getByLabelText('还原供应商');
    await user.click(resetBtn);
    // Confirm dialog should appear
    expect(screen.getByText('确认还原')).toBeInTheDocument();
    expect(screen.getByText('是否还原Claude配置？')).toBeInTheDocument();
    expect(screen.getByText('确定')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
    // onReset should NOT have been called yet
    expect(onReset).not.toHaveBeenCalled();
  });

  it('calls onReset when confirm button is clicked in dialog', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onReset });
    const resetBtn = screen.getByLabelText('还原供应商');
    await user.click(resetBtn);
    const confirmBtn = screen.getByText('确定');
    await user.click(confirmBtn);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('does not call onReset when cancel button is clicked in dialog', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onReset });
    const resetBtn = screen.getByLabelText('还原供应商');
    await user.click(resetBtn);
    const cancelBtn = screen.getByText('取消');
    await user.click(cancelBtn);
    expect(onReset).not.toHaveBeenCalled();
    // Dialog should be dismissed
    expect(screen.queryByText('确认还原')).not.toBeInTheDocument();
  });

  it('renders Anthropic API proxy toggle switch', () => {
    renderLayout();
    const toggle = screen.getByRole('switch', { name: '切换 Anthropic API 代理' });
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle switch calls onToggleProxy when clicked', async () => {
    const onToggleProxy = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onToggleProxy });
    const toggle = screen.getByRole('switch', { name: '切换 Anthropic API 代理' });
    await user.click(toggle);
    expect(onToggleProxy).toHaveBeenCalledOnce();
  });

  it('toggle switch reflects enableOpenpowersProxy prop', () => {
    const { rerender } = renderLayout({ enableOpenpowersProxy: true });
    const toggle = screen.getByRole('switch', { name: '切换 Anthropic API 代理' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    rerender(
      React.createElement(
        I18nextProvider,
        { i18n: i18nInstance },
        React.createElement(Layout, {
          ...defaultProps,
          enableOpenpowersProxy: false,
          children: React.createElement('div', null, 'content'),
        }),
      ),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle switch is placed after reset button in left group', () => {
    renderLayout();
    const resetBtn = screen.getByLabelText('还原供应商');
    const toggle = screen.getByRole('switch', { name: '切换 Anthropic API 代理' });
    // Toggle wrapper should be after reset button in the left group
    expect(resetBtn.nextElementSibling).toBe(toggle.parentElement);
  });

  it('renders Claude brand SVG icon to the left of OpenPowers title', () => {
    renderLayout();
    const claudeIcon = document.querySelector('img[alt="Claude"]');
    expect(claudeIcon).toBeInTheDocument();
    const title = screen.getByText('OpenPowers');
    // Claude icon should be positioned immediately before the title
    expect(title.previousElementSibling).toBe(claudeIcon);
  });

  it('renders language switcher button', () => {
    renderLayout();
    // When locale is zh-CN, aria-label shows the target language (English)
    expect(screen.getByLabelText('Switch to English')).toBeInTheDocument();
  });

  it('renders language switcher between session management and add button (order check)', () => {
    renderLayout();
    const sessionBtn = screen.getByLabelText('会话管理');
    const addBtn = screen.getByLabelText('添加供应商');
    // Language switcher button should be rendered between session management and add button
    const langBtn = screen.getByLabelText('Switch to English');
    expect(sessionBtn.parentElement).toBe(langBtn.parentElement);
    // Session management is before language switcher
    const groupContainer = sessionBtn.parentElement!;
    const buttons = groupContainer.children;
    const langIndex = Array.from(buttons).indexOf(langBtn);
    const addIndex = Array.from(buttons).indexOf(addBtn);
    expect(langIndex).toBeLessThan(addIndex);
  });

  // --- ActivityBar tests ---

  it('renders ActivityBar component', () => {
    renderLayout();
    expect(screen.getByLabelText('供应商管理')).toBeInTheDocument();
    expect(screen.getByLabelText('项目管理')).toBeInTheDocument();
  });

  it('calls onViewChange when ActivityBar providers button is clicked', async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onViewChange, activeView: 'projects' });
    const providersBtn = screen.getByLabelText('供应商管理');
    await user.click(providersBtn);
    expect(onViewChange).toHaveBeenCalledWith('providers');
  });

  it('calls onViewChange when ActivityBar projects button is clicked', async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    renderLayout({ onViewChange, activeView: 'providers' });
    const projectsBtn = screen.getByLabelText('项目管理');
    await user.click(projectsBtn);
    expect(onViewChange).toHaveBeenCalledWith('projects');
  });

  // --- Sidebar tests ---

  it('renders sidebar when sidebar prop is provided and activeView is projects', () => {
    const sidebar = React.createElement('div', { 'data-testid': 'sidebar' }, 'sidebar content');
    renderLayout({ sidebar, activeView: 'projects' });
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('does not render sidebar area when sidebar prop is null', () => {
    renderLayout({ sidebar: null });
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  // --- Conditional add button tests ---

  it('renders add button when activeView is providers', () => {
    renderLayout({ activeView: 'providers' });
    const addButton = screen.getByLabelText('添加供应商');
    expect(addButton).toBeInTheDocument();
    expect(addButton.className).toContain('bg-orange-500');
  });

  it('does not render add button when activeView is projects', () => {
    renderLayout({ activeView: 'projects' });
    expect(screen.queryByLabelText('添加供应商')).not.toBeInTheDocument();
  });

  // --- Layout structure tests ---

  it('renders root layout with flex-col vertical structure', () => {
    renderLayout();
    const rootDiv = document.querySelector('.flex-col.h-screen');
    expect(rootDiv).toBeInTheDocument();
  });
});
