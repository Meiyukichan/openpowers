/**
 * Tests for EditProviderDialog component.
 * @vitest-environment jsdom
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import type { Provider } from '../../server/providers-store.js';
import { EditProviderDialog } from './EditProviderDialog.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render EditProviderDialog wrapped in I18nextProvider */
function renderDialog(props: Record<string, unknown>) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(EditProviderDialog, props),
    ),
  );
}

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

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dialog with correct title', () => {
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    expect(screen.getByText('编辑供应商')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderDialog({
        isOpen: false,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    expect(screen.queryByText('编辑供应商')).not.toBeInTheDocument();
  });

  it('pre-fills form fields including model fields with current provider data', () => {
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const nameInput = screen.getByPlaceholderText('供应商名称') as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText('备注（可选）') as HTMLInputElement;
    const websiteUrlInput = screen.getByPlaceholderText('官网链接（可选）') as HTMLInputElement;
    const apiKeyInput = screen.getByPlaceholderText('API Key') as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText('请求地址（可选）') as HTMLInputElement;
    const defaultModelInput = screen.getByPlaceholderText('默认模型') as HTMLInputElement;
    const sonnetModelInput = screen.getByPlaceholderText('Sonnet 模型') as HTMLInputElement;
    const opusModelInput = screen.getByPlaceholderText('Opus 模型') as HTMLInputElement;
    const haikuModelInput = screen.getByPlaceholderText('Haiku 模型') as HTMLInputElement;

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
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    expect(screen.queryByText('供应商模板')).not.toBeInTheDocument();
    expect(screen.queryByText('Claude Official')).not.toBeInTheDocument();
  });

  it('shows footer with cancel and save buttons', () => {
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
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

    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess,
        showToast: vi.fn(),
    });

    const nameInput = screen.getByPlaceholderText('供应商名称');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Provider');

    const saveButton = screen.getByText('保存');
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/furina/api/providers/test-id-1',
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
      }));
  });

  it('validates required fields before submit', async () => {
    const user = userEvent.setup();
    const providerWithEmptyName = { ...baseProvider, name: '', apiKey: '' };
    const onSuccess = vi.fn();

    renderDialog({
        isOpen: true,
        provider: providerWithEmptyName,
        onClose: vi.fn(),
        onSuccess,
        showToast: vi.fn(),
    });

    const saveButton = screen.getByText('保存');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('请输入供应商名称')).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // f-01: API Key validation button tests

  it('shows validate API Key button below the API key input field', () => {
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key');
    expect(validateBtn).toBeInTheDocument();
    expect(validateBtn.tagName).toBe('BUTTON');
  });

  it('validate button is enabled when both baseUrl and apiKey have values', () => {
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key') as HTMLButtonElement;
    // baseProvider has both baseUrl and apiKey — button should be enabled
    expect(validateBtn.disabled).toBe(false);
  });

  it('validate button is disabled when baseUrl or apiKey is empty', async () => {
    // Provider with empty apiKey and baseUrl
    const emptyProvider = { ...baseProvider, apiKey: '', baseUrl: '' };
    renderDialog({
        isOpen: true,
        provider: emptyProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key') as HTMLButtonElement;
    // Both empty — disabled
    expect(validateBtn.disabled).toBe(true);
  });

  it('shows green success text with model count when API key is valid', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: true, models: ['model-a', 'model-b', 'model-c'] }) } as Response;
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response;
    });

    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key');
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText(/有效.*3.*个模型可用/)).toBeInTheDocument();
    });
    const successEl = screen.getByText(/有效.*3.*个模型可用/);
    expect(successEl.className).toContain('green');
  });

  it('shows red error text when API key is invalid', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: false, error: 'Authentication failed: invalid API key' }) } as Response;
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response;
    });

    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key');
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText('Authentication failed: invalid API key')).toBeInTheDocument();
    });
    const errorEl = screen.getByText('Authentication failed: invalid API key');
    expect(errorEl.parentElement!.className).toContain('red');
  });

  it('resets validation result when user modifies baseUrl or apiKey', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: true, models: ['model-x'] }) } as Response;
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response;
    });

    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    // Click validate — should show success
    await user.click(screen.getByText('验证 API Key'));
    await waitFor(() => {
      expect(screen.getByText(/有效.*1.*个模型可用/)).toBeInTheDocument();
    });
    // Modify the apiKey field
    await user.type(screen.getByPlaceholderText('API Key'), 'extra');
    // Validation result should be cleared
    expect(screen.queryByText(/有效.*1.*个模型可用/)).not.toBeInTheDocument();
  });

  it('shows timeout error text when validation encounters network error', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        throw new Error('Network error');
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response;
    });

    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const validateBtn = screen.getByText('验证 API Key');
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText('验证超时')).toBeInTheDocument();
    });
    const timeoutEl = screen.getByText('验证超时');
    expect(timeoutEl.parentElement!.className).toContain('red');
  });

  it('closes dialog on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({
        isOpen: true,
        provider: baseProvider,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    const backdrop = document.querySelector('.fixed.inset-0')?.firstChild as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
