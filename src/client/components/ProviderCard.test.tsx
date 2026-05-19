/**
 * Tests for ProviderCard component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Provider } from '../../server/providers-store.js';
import { ProviderCard } from './ProviderCard.js';

const baseProvider: Provider = {
  id: 'test-id-1',
  name: 'Test Provider',
  notes: 'A test provider for testing',
  websiteUrl: 'https://test.example.com',
  apiKey: '',
  baseUrl: 'https://api.test.example.com',
  icon: 'sparkles',
  iconColor: '#d97706',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProviderCard', () => {
  it('renders provider name', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText('Test Provider')).toBeInTheDocument();
  });

  it('renders provider notes', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText('A test provider for testing')).toBeInTheDocument();
  });

  it('renders base URL', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText('https://api.test.example.com')).toBeInTheDocument();
  });

  it('shows enabled badge when provider is enabled', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText(/enabled/i)).toBeInTheDocument();
  });

  it('shows disabled badge when provider is disabled', () => {
    const disabledProvider = { ...baseProvider, enabled: false };
    render(
      React.createElement(ProviderCard, {
        provider: disabledProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
  });

  it('renders icon element when provider has an icon', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    // The icon container should exist
    const iconContainer = document.querySelector('.rounded-lg');
    expect(iconContainer).toBeInTheDocument();
  });

  it('calls onToggle when toggle button is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const toggleButton = screen.getByLabelText(/toggle/i);
    await user.click(toggleButton);
    expect(onToggle).toHaveBeenCalledWith(baseProvider);
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit,
        onDelete: vi.fn(),
      }),
    );
    const editButton = screen.getByLabelText(/edit/i);
    await user.click(editButton);
    expect(onEdit).toHaveBeenCalledWith(baseProvider);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onDelete,
      }),
    );
    const deleteButton = screen.getByLabelText(/delete/i);
    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(baseProvider);
  });
});
