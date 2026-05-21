/**
 * Tests for EditProviderDialog component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Provider } from '../../server/providers-store.js';
import { EditProviderDialog } from './EditProviderDialog.js';

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
  defaultModel: 'claude-sonnet-4.6',
  sonnetModel: 'claude-sonnet-4.6',
  opusModel: 'claude-opus-4.7',
  haikuModel: 'claude-haiku-4.5',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('EditProviderDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dialog with correct title', () => {
    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.getByText('编辑供应商')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      React.createElement(EditProviderDialog, {
        isOpen: false,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.queryByText('编辑供应商')).not.toBeInTheDocument();
  });

  it('pre-fills form fields including model fields with current provider data', () => {
    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    const nameInput = screen.getByPlaceholderText(/provider name/i) as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText(/notes/i) as HTMLInputElement;
    const websiteUrlInput = screen.getByPlaceholderText(/website url/i) as HTMLInputElement;
    const apiKeyInput = screen.getByPlaceholderText(/api key/i) as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText(/base url/i) as HTMLInputElement;
    const defaultModelInput = screen.getByPlaceholderText(/default model/i) as HTMLInputElement;
    const sonnetModelInput = screen.getByPlaceholderText(/sonnet model/i) as HTMLInputElement;
    const opusModelInput = screen.getByPlaceholderText(/opus model/i) as HTMLInputElement;
    const haikuModelInput = screen.getByPlaceholderText(/haiku model/i) as HTMLInputElement;

    expect(nameInput.value).toBe('Test Provider');
    expect(notesInput.value).toBe('A test note');
    expect(websiteUrlInput.value).toBe('https://example.com');
    expect(apiKeyInput.value).toBe('sk-test-123');
    expect(baseUrlInput.value).toBe('https://api.example.com');
    expect(defaultModelInput.value).toBe('claude-sonnet-4.6');
    expect(sonnetModelInput.value).toBe('claude-sonnet-4.6');
    expect(opusModelInput.value).toBe('claude-opus-4.7');
    expect(haikuModelInput.value).toBe('claude-haiku-4.5');
  });

  it('does not show preset selector', () => {
    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.queryByText('Preset Providers')).not.toBeInTheDocument();
    expect(screen.queryByText('Claude Official')).not.toBeInTheDocument();
  });

  it('shows footer with cancel and save buttons', () => {
    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(EditProviderDialog, {
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

  it('submits updated data via PUT and calls onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess,
        showToast: vi.fn(),
      }),
    );

    const nameInput = screen.getByPlaceholderText(/provider name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Provider');

    const saveButton = screen.getByText('保存');
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/openpowers/api/providers/test-id-1',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Provider',
          apiKey: 'sk-test-123',
          defaultModel: 'claude-sonnet-4.6',
          sonnetModel: 'claude-sonnet-4.6',
          opusModel: 'claude-opus-4.7',
          haikuModel: 'claude-haiku-4.5',
          notes: 'A test note',
          websiteUrl: 'https://example.com',
          baseUrl: 'https://api.example.com',
        }),
      }),
    );
  });

  it('validates required fields before submit', async () => {
    const user = userEvent.setup();
    const providerWithEmptyName = { ...baseProvider, name: '', apiKey: '' };
    const onSuccess = vi.fn();

    render(
      React.createElement(EditProviderDialog, {
        isOpen: true,
        provider: providerWithEmptyName,
        onClose: vi.fn(),
        onSuccess,
        showToast: vi.fn(),
      }),
    );

    const saveButton = screen.getByText('保存');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('closes dialog on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(EditProviderDialog, {
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
