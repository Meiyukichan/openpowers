/**
 * Tests for Layout component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Layout } from './Layout.js';

const defaultProps = {
  onAddProvider: vi.fn(),
  onReset: vi.fn(),
  showToast: vi.fn(),
  enableOpenpowersProxy: false,
  onToggleProxy: vi.fn(),
};

describe('Layout', () => {
  it('renders the brand name OpenPowers', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(screen.getByText('OpenPowers')).toBeInTheDocument();
  });

  it('renders session management placeholder button', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(screen.getByText('会话管理')).toBeInTheDocument();
  });

  it('session management button click has no effect', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const sessionBtn = screen.getByText('会话管理');
    await user.click(sessionBtn);
    // Button should still exist and not throw (placeholder)
    expect(sessionBtn).toBeInTheDocument();
  });

  it('renders add button with orange background', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const addButton = screen.getByLabelText(/add provider/i);
    expect(addButton.className).toContain('bg-orange-500');
  });

  it('calls onAddProvider when add button is clicked', async () => {
    const onAddProvider = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        onAddProvider,
        onReset: vi.fn(),
        showToast: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    const addButton = screen.getByLabelText(/add provider/i);
    await user.click(addButton);
    expect(onAddProvider).toHaveBeenCalledOnce();
  });

  it('session management button is adjacent to add button in right-side group', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const sessionBtn = screen.getByText('会话管理').closest('button');
    const addButton = screen.getByLabelText(/add provider/i);
    // Both buttons should share the same parent container (right-side button group)
    expect(sessionBtn?.parentElement).toBe(addButton.parentElement);
    // Session button should be the previous sibling of the add button
    expect(addButton.previousElementSibling).toBe(sessionBtn);
  });

  it('renders children content', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', { 'data-testid': 'child' }, 'child content'),
      }),
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(screen.getByLabelText(/reset providers/i)).toBeInTheDocument();
  });

  it('shows confirm dialog when reset button is clicked', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        onReset,
        showToast: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    const resetBtn = screen.getByLabelText(/reset providers/i);
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
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        onReset,
        showToast: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    const resetBtn = screen.getByLabelText(/reset providers/i);
    await user.click(resetBtn);
    const confirmBtn = screen.getByText('确定');
    await user.click(confirmBtn);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('does not call onReset when cancel button is clicked in dialog', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        onReset,
        showToast: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    const resetBtn = screen.getByLabelText(/reset providers/i);
    await user.click(resetBtn);
    const cancelBtn = screen.getByText('取消');
    await user.click(cancelBtn);
    expect(onReset).not.toHaveBeenCalled();
    // Dialog should be dismissed
    expect(screen.queryByText('确认还原')).not.toBeInTheDocument();
  });

  it('renders Claude Desktop local routing toggle switch', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const toggle = screen.getByRole('switch', { name: /toggle claude desktop local routing/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle switch calls onToggleProxy when clicked', async () => {
    const onToggleProxy = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        ...defaultProps,
        onToggleProxy,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const toggle = screen.getByRole('switch', { name: /toggle claude desktop local routing/i });
    await user.click(toggle);
    expect(onToggleProxy).toHaveBeenCalledOnce();
  });

  it('toggle switch reflects enableOpenpowersProxy prop', () => {
    const { rerender } = render(
      React.createElement(Layout, {
        ...defaultProps,
        enableOpenpowersProxy: true,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const toggle = screen.getByRole('switch', { name: /toggle claude desktop local routing/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    rerender(
      React.createElement(Layout, {
        ...defaultProps,
        enableOpenpowersProxy: false,
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle switch is placed after reset button in left group', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const resetBtn = screen.getByLabelText(/reset providers/i);
    const toggle = screen.getByRole('switch', { name: /toggle claude desktop local routing/i });
    // Toggle wrapper should be after reset button in the left group
    expect(resetBtn.nextElementSibling).toBe(toggle.parentElement);
  });

  it('renders Claude brand SVG icon to the left of OpenPowers title', () => {
    render(
      React.createElement(Layout, {
        ...defaultProps,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const claudeIcon = document.querySelector('img[alt="Claude"]');
    expect(claudeIcon).toBeInTheDocument();
    const title = screen.getByText('OpenPowers');
    // Claude icon should be positioned immediately before the title
    expect(title.previousElementSibling).toBe(claudeIcon);
  });
});
