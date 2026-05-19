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

describe('Layout', () => {
  it('renders the brand name Claude', () => {
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('renders session management placeholder button', () => {
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        children: React.createElement('div', null, 'content'),
      }),
    );
    expect(screen.getByText('会话管理')).toBeInTheDocument();
  });

  it('session management button click has no effect', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
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
        onAddProvider: vi.fn(),
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
        children: React.createElement('div', null, 'content'),
      }),
    );
    const addButton = screen.getByLabelText(/add provider/i);
    await user.click(addButton);
    expect(onAddProvider).toHaveBeenCalledOnce();
  });

  it('renders children content', () => {
    render(
      React.createElement(Layout, {
        onAddProvider: vi.fn(),
        children: React.createElement('div', { 'data-testid': 'child' }, 'child content'),
      }),
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
