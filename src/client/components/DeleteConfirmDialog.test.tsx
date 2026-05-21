/**
 * Tests for DeleteConfirmDialog component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Provider } from '../../server/providers-store.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';

const baseProvider: Provider = {
  id: 'test-id-1',
  name: 'Test Provider',
  notes: 'A test note',
  websiteUrl: 'https://example.com',
  apiKey: 'sk-test-123',
  baseUrl: 'https://api.example.com',
  icon: 'sparkles',
  iconColor: '#d97706',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('DeleteConfirmDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders confirmation message', () => {
    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.getByText('确定要删除该供应商吗？')).toBeInTheDocument();
  });

  it('shows the provider name in the confirmation', () => {
    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.getByText(/Test Provider/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: false,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.queryByText('确定要删除该供应商吗？')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    const cancelButton = screen.getByText('取消');
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls DELETE API and onSuccess when confirm is clicked', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
    } as Response);

    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess,
        showToast: vi.fn(),
      }),
    );

    const confirmButton = screen.getByText('确认删除');
    await user.click(confirmButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/openpowers/api/providers/test-id-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('closes dialog on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(DeleteConfirmDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    const backdrop = document.querySelector('.fixed.inset-0')?.firstChild as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
