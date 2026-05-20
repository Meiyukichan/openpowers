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

  it('calls onReset when reset button is clicked', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        onReset,
        children: React.createElement('div', null, 'content'),
      }),
    );
    const resetBtn = screen.getByLabelText(/reset providers/i);
    await user.click(resetBtn);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
