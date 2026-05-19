/**
 * Tests for AddProviderDialog component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AddProviderDialog } from './AddProviderDialog.js';

describe('AddProviderDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dialog with correct title', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    expect(screen.getByText('添加供应商')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: false,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    expect(screen.queryByText('添加供应商')).not.toBeInTheDocument();
  });

  it('shows form fields: name, notes, websiteUrl, apiKey, baseUrl', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    expect(screen.getByPlaceholderText(/provider name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/notes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/website url/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/api key/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/base url/i)).toBeInTheDocument();
  });

  it('shows preset selector grid with provider names', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    expect(screen.getByText('Claude Official')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
  });

  it('pre-fills name and baseUrl when a preset is selected', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    const presetButton = screen.getByText('DeepSeek');
    await user.click(presetButton);

    const nameInput = screen.getByPlaceholderText(/provider name/i) as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText(/base url/i) as HTMLInputElement;
    expect(nameInput.value).toBe('DeepSeek');
    expect(baseUrlInput.value).toBe('https://api.deepseek.com/anthropic');
  });

  it('shows validation errors when submitting with empty required fields', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess,
      }),
    );
    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/api key is required/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
      }),
    );
    const cancelButton = screen.getByText('取消');
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('submits provider data via POST and calls onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose,
        onSuccess,
      }),
    );

    await user.type(screen.getByPlaceholderText(/provider name/i), 'My Provider');
    await user.type(screen.getByPlaceholderText(/api key/i), 'test-key-123');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.example.com');

    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/providers',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('closes dialog on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
      }),
    );
    const backdrop = document.querySelector('.fixed.inset-0')?.firstChild as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show advanced fields like model selector, speed test, or common config', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    expect(screen.queryByText(/model selector/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/speed test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/common config/i)).not.toBeInTheDocument();
  });

  it('only shows Claude-specific presets and not non-Claude presets', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    // All visible preset names should be from the Claude-specific presets list
    expect(screen.getByText('Claude Official')).toBeInTheDocument();
    // Non-Claude presets like OpenAI should not appear
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    expect(screen.queryByText('ChatGPT')).not.toBeInTheDocument();
  });

  it('form fields start empty when no preset is selected', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    );
    const nameInput = screen.getByPlaceholderText(/provider name/i) as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText(/notes/i) as HTMLInputElement;
    const websiteUrlInput = screen.getByPlaceholderText(/website url/i) as HTMLInputElement;
    const apiKeyInput = screen.getByPlaceholderText(/api key/i) as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText(/base url/i) as HTMLInputElement;
    expect(nameInput.value).toBe('');
    expect(notesInput.value).toBe('');
    expect(websiteUrlInput.value).toBe('');
    expect(apiKeyInput.value).toBe('');
    expect(baseUrlInput.value).toBe('');
  });
});
