/**
 * Tests for AddProviderDialog component.
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
import { AddProviderDialog } from './AddProviderDialog.js';
import zhCN from '../i18n/locales/zh-CN.json';
import enUS from '../i18n/locales/en-US.json';

/** Dedicated i18next instance for test isolation */
let i18nInstance: i18next.i18n;

/** Helper to render AddProviderDialog wrapped in I18nextProvider */
function renderDialog(props: Record<string, unknown>) {
  return render(
    React.createElement(
      I18nextProvider,
      { i18n: i18nInstance },
      React.createElement(AddProviderDialog, props),
    ),
  );
}

// Template data returned by the API for all tests
const mockTemplates = [
  { name: 'TestProvider1', baseUrl: 'https://api.test1.com', iconSvg: 'anthropic.svg', websiteUrl: 'https://test1.com', defaultModel: 'model1', sonnetModel: 'model1-sonnet', opusModel: 'model1-opus', haikuModel: 'model1-haiku', source: 'builtin' },
  { name: 'TestProvider2', baseUrl: 'https://api.test2.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '', source: 'builtin' },
];

describe('AddProviderDialog', () => {
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
    // Default mock: return templates for GET /templates, success for everything else
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/templates' && init?.method === 'POST') {
        return { ok: true, status: 201, json: () => Promise.resolve({}) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dialog with correct title', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    // Wait for templates to load
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    renderDialog({
        isOpen: false,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    expect(screen.queryByText('添加供应商')).not.toBeInTheDocument();
  });

  it('shows form fields: name, notes, websiteUrl, apiKey, baseUrl, and model fields', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('供应商名称')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('备注（可选）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('官网链接（可选）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('API Key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请求地址（可选）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('默认模型')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Sonnet 模型')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Opus 模型')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Haiku 模型')).toBeInTheDocument();
  });

  it('fetches template list from GET /furina/api/providers/templates on mount', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/furina/api/providers/templates');
    });
  });

  it('shows preset selector section with label "供应商模板"', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('供应商模板')).toBeInTheDocument();
    });
  });

  it('shows preset selector grid with provider names from API', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    expect(screen.getByText('TestProvider2')).toBeInTheDocument();
  });

  it('pre-fills name, baseUrl, and model fields when a preset is selected', async () => {
    const user = userEvent.setup();
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    const presetButton = screen.getByText('TestProvider1');
    await user.click(presetButton);

    const nameInput = screen.getByPlaceholderText('供应商名称') as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText('请求地址（可选）') as HTMLInputElement;
    const defaultModelInput = screen.getByPlaceholderText('默认模型') as HTMLInputElement;
    const sonnetModelInput = screen.getByPlaceholderText('Sonnet 模型') as HTMLInputElement;
    const opusModelInput = screen.getByPlaceholderText('Opus 模型') as HTMLInputElement;
    const haikuModelInput = screen.getByPlaceholderText('Haiku 模型') as HTMLInputElement;
    expect(nameInput.value).toBe('TestProvider1');
    expect(baseUrlInput.value).toBe('https://api.test1.com');
    expect(defaultModelInput.value).toBe('model1');
    expect(sonnetModelInput.value).toBe('model1-sonnet');
    expect(opusModelInput.value).toBe('model1-opus');
    expect(haikuModelInput.value).toBe('model1-haiku');
  });

  it('shows validation errors when submitting with empty required fields', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess,
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加')).toBeInTheDocument();
    });
    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('请输入供应商名称')).toBeInTheDocument();
    });
    expect(screen.getByText('请输入 API Key')).toBeInTheDocument();
    expect(screen.getByText('请输入默认模型')).toBeInTheDocument();
    expect(screen.getByText('请输入 Sonnet 模型')).toBeInTheDocument();
    expect(screen.getByText('请输入 Opus 模型')).toBeInTheDocument();
    expect(screen.getByText('请输入 Haiku 模型')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('取消')).toBeInTheDocument();
    });
    const cancelButton = screen.getByText('取消');
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('submits provider data via POST including model fields and calls onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    // Override fetch for this test: templates call succeeds first, then POST
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose,
        onSuccess,
        showToast: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('供应商名称')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('供应商名称'), 'My Provider');
    await user.type(screen.getByPlaceholderText('API Key'), 'test-key-123');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.example.com');
    await user.type(screen.getByPlaceholderText('默认模型'), 'claude-sonnet-4.6');
    await user.type(screen.getByPlaceholderText('Sonnet 模型'), 'claude-sonnet-4.6');
    await user.type(screen.getByPlaceholderText('Opus 模型'), 'claude-opus-4.7');
    await user.type(screen.getByPlaceholderText('Haiku 模型'), 'claude-haiku-4.5');

    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/furina/api/providers',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Provider',
          apiKey: 'test-key-123',
          defaultModel: 'claude-sonnet-4.6',
          sonnetModel: 'claude-sonnet-4.6',
          opusModel: 'claude-opus-4.7',
          haikuModel: 'claude-haiku-4.5',
          baseUrl: 'https://api.example.com',
        }),
      }));
  });

  it('closes dialog on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    const backdrop = document.querySelector('.fixed.inset-0')?.firstChild as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show advanced fields like model selector, speed test, or common config', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    expect(screen.queryByText(/model selector/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/speed test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/common config/i)).not.toBeInTheDocument();
  });

  it('only shows templates from the API response', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    // Presets from the deleted presets.ts should not appear
    expect(screen.queryByText('Claude Official')).not.toBeInTheDocument();
    expect(screen.queryByText('DeepSeek')).not.toBeInTheDocument();
  });

  // bi-001: Brand SVG icons in preset selector
  it('preset buttons with valid iconSvg render brand SVG img tag', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    // Each preset button with an iconSvg should contain an img tag
    const presetImgs = document.querySelectorAll('button img[alt="供应商图标"]');
    expect(presetImgs.length).toBeGreaterThan(0);
  });

  it('custom preset "自定义配置" with empty iconSvg shows no icon img', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('自定义配置')).toBeInTheDocument();
    });
    const customBtn = screen.getByText('自定义配置').closest('button');
    expect(customBtn).toBeInTheDocument();
    const imgInCustomBtn = customBtn?.querySelector('img');
    expect(imgInCustomBtn).not.toBeInTheDocument();
  });

  it('form fields start empty when no preset is selected', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('自定义配置')).toBeInTheDocument();
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
    expect(nameInput.value).toBe('');
    expect(notesInput.value).toBe('');
    expect(websiteUrlInput.value).toBe('');
    expect(apiKeyInput.value).toBe('');
    expect(baseUrlInput.value).toBe('');
    expect(defaultModelInput.value).toBe('');
    expect(sonnetModelInput.value).toBe('');
    expect(opusModelInput.value).toBe('');
    expect(haikuModelInput.value).toBe('');
  });

  // pt-002: "添加为模板" button sends POST to templates endpoint
  it('sends POST to /furina/api/providers/templates with form data excluding apiKey', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
    });

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('供应商名称'), 'My Template');
    await user.type(screen.getByPlaceholderText('API Key'), 'secret-key');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.example.com');
    await user.type(screen.getByPlaceholderText('默认模型'), 'model-x');
    await user.type(screen.getByPlaceholderText('Sonnet 模型'), 'model-s');
    await user.type(screen.getByPlaceholderText('Opus 模型'), 'model-o');
    await user.type(screen.getByPlaceholderText('Haiku 模型'), 'model-h');
    await user.type(screen.getByPlaceholderText('官网链接（可选）'), 'https://example.com');
    await user.type(screen.getByPlaceholderText('备注（可选）'), 'some notes');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/furina/api/providers/templates',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    // Verify the call body does not include apiKey or notes (provider-specific fields)
    const fetchCalls = vi.mocked(fetch).mock.calls;
    const postCall = fetchCalls.find((call) =>
      typeof call[0] === 'string' && call[0] === '/furina/api/providers/templates'
      && call[1] && (call[1] as RequestInit).method === 'POST'
    );
    expect(postCall).toBeDefined();
    const postBody = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(postBody.name).toBe('My Template');
    expect(postBody.baseUrl).toBe('https://api.example.com');
    expect(postBody.defaultModel).toBe('model-x');
    expect(postBody.sonnetModel).toBe('model-s');
    expect(postBody.opusModel).toBe('model-o');
    expect(postBody.haikuModel).toBe('model-h');
    expect(postBody.websiteUrl).toBe('https://example.com');
    // apiKey must NOT be present
    expect(postBody.apiKey).toBeUndefined();
    // notes must NOT be present (template-only fields)
    expect(postBody.notes).toBeUndefined();
  });

  it('shows success toast when template is added successfully', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
    });

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('供应商名称'), 'New Template');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.new.com');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringMatching(/模板.*已添加|已添加.*模板|template.*added|added.*template/i),
        'success',
      );
    });
  });

  it('shows error toast on 409 duplicate template name', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    // Override fetch to return 409 for POST /templates
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/templates' && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: 'Template name "TestProvider1" already exists' }),
        };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
    });

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('供应商名称'), 'TestProvider1');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.test.com');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Template name "TestProvider1" already exists'),
        'error',
      );
    });
  });

  it('shows error toast on server error when adding template', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    // Override fetch to return 500 for POST /templates
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/templates' && init?.method === 'POST') {
        return {
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
    });

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('供应商名称'), 'Broken Template');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.broken.com');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringMatching(/添加.*模板.*失败|模板.*添加.*失败|add.*template.*fail|fail.*template/i),
        'error',
      );
    });
  });

  // ts-002: Template deletion tests

  it('custom templates show a delete button while builtin templates do not', async () => {
    const customTemplates = [
      { name: 'CustomTemplate', baseUrl: 'https://api.custom.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '', source: 'custom' },
      { name: 'BuiltinTemplate', baseUrl: 'https://api.builtin.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '', source: 'builtin' },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(customTemplates) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText('CustomTemplate')).toBeInTheDocument();
    });
    expect(screen.getByText('BuiltinTemplate')).toBeInTheDocument();

    // Custom template card should have a delete button
    const customCard = screen.getByText('CustomTemplate').closest('div');
    expect(customCard).toBeInTheDocument();
    const deleteButtons = customCard!.querySelectorAll('button[title="删除模板"]');
    expect(deleteButtons.length).toBe(1);

    // Builtin template card should NOT have a delete button
    const builtinCard = screen.getByText('BuiltinTemplate').closest('div');
    expect(builtinCard).toBeInTheDocument();
    const builtinDeleteBtns = builtinCard!.querySelectorAll('button[title="删除模板"]');
    expect(builtinDeleteBtns.length).toBe(0);
  });

  it('hardcoded custom config preset does not show delete button', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText('自定义配置')).toBeInTheDocument();
    });

    const customConfigCard = screen.getByText('自定义配置').closest('div');
    expect(customConfigCard).toBeInTheDocument();
    const deleteButtons = customConfigCard!.querySelectorAll('button[title="删除模板"]');
    expect(deleteButtons.length).toBe(0);
  });

  // f-01: API Key validation button tests

  it('shows validate API Key button below the API key input field', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    const validateBtn = screen.getByText('验证 API Key');
    expect(validateBtn).toBeInTheDocument();
    expect(validateBtn.tagName).toBe('BUTTON');
  });

  it('validate button is disabled when baseUrl or apiKey is empty', async () => {
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    const validateBtn = screen.getByText('验证 API Key') as HTMLButtonElement;
    // Both empty — disabled
    expect(validateBtn.disabled).toBe(true);
  });

  it('validate button is enabled when both baseUrl and apiKey have values', async () => {
    const user = userEvent.setup();
    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('API Key'), 'test-key');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.test.com');
    const validateBtn = screen.getByText('验证 API Key') as HTMLButtonElement;
    expect(validateBtn.disabled).toBe(false);
  });

  it('shows green success text with model count when API key is valid', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: true, models: ['model-a', 'model-b', 'model-c'] }) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('API Key'), 'sk-valid-key');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.test.com');
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
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: false, error: 'Authentication failed: invalid API key' }) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('API Key'), 'sk-bad-key');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.test.com');
    const validateBtn = screen.getByText('验证 API Key');
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText('Authentication failed: invalid API key')).toBeInTheDocument();
    });
    const errorEl = screen.getByText('Authentication failed: invalid API key');
    expect(errorEl.parentElement!.className).toContain('red');
  });

  it('shows red timeout error text when validation times out', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: false, error: 'Validation timeout: upstream did not respond within 5s' }) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('API Key'), 'sk-test-key');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.slow.com');
    const validateBtn = screen.getByText('验证 API Key');
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText('Validation timeout: upstream did not respond within 5s')).toBeInTheDocument();
    });
    const timeoutEl = screen.getByText('Validation timeout: upstream did not respond within 5s');
    expect(timeoutEl.parentElement!.className).toContain('red');
  });

  it('resets validation result when user modifies baseUrl or apiKey', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/furina/api/providers/validate' && init?.method === 'POST') {
        return { ok: true, status: 200, json: () => Promise.resolve({ valid: true, models: ['model-x'] }) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('API Key'), 'sk-valid');
    await user.type(screen.getByPlaceholderText('请求地址（可选）'), 'https://api.test.com');
    // Click validate — should show success
    await user.click(screen.getByText('验证 API Key'));
    await waitFor(() => {
      expect(screen.getByText(/有效.*1.*个模型可用/)).toBeInTheDocument();
    });
    // Now modify the apiKey field
    await user.type(screen.getByPlaceholderText('API Key'), 'extra');
    // Validation result should be cleared
    expect(screen.queryByText(/有效.*1.*个模型可用/)).not.toBeInTheDocument();
  });

  it('clicking delete button on custom template sends DELETE API call and removes template from list', async () => {
    const user = userEvent.setup();
    const customTemplates = [
      { name: 'Deletable', baseUrl: 'https://api.delete.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '', source: 'custom' },
      { name: 'KeepMe', baseUrl: 'https://api.keep.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '', source: 'builtin' },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/furina/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(customTemplates) };
      }
      if (urlStr === '/furina/api/providers/templates/Deletable' && init?.method === 'DELETE') {
        return { ok: true, status: 200, json: () => Promise.resolve({ message: 'Template "Deletable" deleted successfully' }) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    renderDialog({
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText('Deletable')).toBeInTheDocument();
    });
    expect(screen.getByText('KeepMe')).toBeInTheDocument();

    // Find and click the delete button on the custom template card
    const deletableCard = screen.getByText('Deletable').closest('div');
    const deleteBtn = deletableCard!.querySelector('button[title="删除模板"]') as HTMLButtonElement;
    expect(deleteBtn).toBeInTheDocument();
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/furina/api/providers/templates/Deletable',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    // After deletion, the custom template should be removed from the list
    await waitFor(() => {
      expect(screen.queryByText('Deletable')).not.toBeInTheDocument();
    });
    // But the builtin template should still be present
    expect(screen.getByText('KeepMe')).toBeInTheDocument();
  });
});
