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
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProviderCard', () => {
  it('renders provider name', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
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
        onSetActive: vi.fn(),
        isActive: false,
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
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    expect(screen.getByText('https://api.test.example.com')).toBeInTheDocument();
  });

  it('renders brand SVG img when provider has a valid SVG icon filename', () => {
    render(
      React.createElement(ProviderCard, {
        provider: {
          ...baseProvider,
          icon: 'anthropic.svg',
        },
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const iconImg = document.querySelector('img[alt="Provider icon"]');
    expect(iconImg).toBeInTheDocument();
  });

  it('shows grey disabled button with Check icon and "使用中" text when provider is active', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: true,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const enableButton = screen.getByRole('button', { name: /is active/i });
    expect(enableButton).toBeDisabled();
    expect(screen.getByText('使用中')).toBeInTheDocument();
  });

  it('shows blue button with Play icon and "启用" text when provider is inactive', () => {
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const enableButton = screen.getByRole('button', { name: /enable/i });
    expect(enableButton).not.toBeDisabled();
    expect(screen.getByText('启用')).toBeInTheDocument();
  });

  it('calls onSetActive when enable button is clicked on inactive provider', async () => {
    const onSetActive = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive,
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const enableButton = screen.getByRole('button', { name: /enable/i });
    await user.click(enableButton);
    expect(onSetActive).toHaveBeenCalledWith(baseProvider);
  });

  it('does not call onSetActive when enable button is clicked on active provider', async () => {
    const onSetActive = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive,
        isActive: true,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const enableButton = screen.getByRole('button', { name: /is active/i });
    await user.click(enableButton);
    expect(onSetActive).not.toHaveBeenCalled();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
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
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete,
      }),
    );
    const deleteButton = screen.getByLabelText(/delete/i);
    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(baseProvider);
  });

  // Task 3.1: Padded card container
  it('has padding on the root element', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement.className).toContain('px-4');
  });

  // Task 3.2: Active provider blue border and shadow
  it('applies blue border and shadow classes when provider is active', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: true,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement.className).toContain('border-blue-500/60');
    expect(rootElement.className).toContain('shadow-sm');
    expect(rootElement.className).toContain('shadow-blue-500/10');
  });

  it('does not apply blue border and shadow classes when provider is inactive', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement.className).not.toContain('border-blue-500/60');
    expect(rootElement.className).not.toContain('shadow-blue-500/10');
  });

  // Task 3.3: Gradient overlay div for active provider
  it('renders a gradient overlay div with blue background for active provider', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: true,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    const overlay = rootElement.querySelector('.bg-gradient-to-r');
    expect(overlay).toBeInTheDocument();
    expect(overlay?.className).toContain('from-blue-500/10');
    expect(overlay?.className).toContain('to-transparent');
    expect(overlay?.className).toContain('pointer-events-none');
    expect(overlay?.className).toContain('opacity-100');
  });

  it('renders gradient overlay with opacity-0 for inactive provider', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    const overlay = rootElement.querySelector('.bg-gradient-to-r');
    expect(overlay).toBeInTheDocument();
    expect(overlay?.className).toContain('opacity-0');
  });

  // Task 3.4: Hover border and transition classes
  it('has hover:border-blue-500/50 class on root element', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement.className).toContain('hover:border-blue-500/50');
  });

  it('has transition-all and duration-300 classes on root element', () => {
    const { container } = render(
      React.createElement(ProviderCard, {
        provider: baseProvider,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const rootElement = container.firstElementChild as HTMLElement;
    expect(rootElement.className).toContain('transition-all');
    expect(rootElement.className).toContain('duration-300');
  });

  // bi-001: Brand SVG icon rendering
  it('renders brand SVG img when provider.icon is anthropic.svg', () => {
    render(
      React.createElement(ProviderCard, {
        provider: {
          ...baseProvider,
          icon: 'anthropic.svg',
        },
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const iconImg = document.querySelector('img[alt="Provider icon"]');
    expect(iconImg).toBeInTheDocument();
    expect(iconImg).toHaveAttribute('src', '/test-fixtures/mock-icon.svg');
  });

  it('shows no icon when provider.icon is empty string', () => {
    render(
      React.createElement(ProviderCard, {
        provider: {
          ...baseProvider,
          icon: '',
        },
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const iconImg = document.querySelector('img[alt="Provider icon"]');
    expect(iconImg).not.toBeInTheDocument();
  });

  it('shows no icon when provider.icon is undefined', () => {
    const providerWithoutIcon = { ...baseProvider };
    delete (providerWithoutIcon as Record<string, unknown>).icon;
    render(
      React.createElement(ProviderCard, {
        provider: providerWithoutIcon,
        onSetActive: vi.fn(),
        isActive: false,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const iconImg = document.querySelector('img[alt="Provider icon"]');
    expect(iconImg).not.toBeInTheDocument();
  });
});
