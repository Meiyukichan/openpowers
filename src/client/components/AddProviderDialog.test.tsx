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

// Template data returned by the API for all tests
const mockTemplates = [
  { name: 'TestProvider1', baseUrl: 'https://api.test1.com', iconSvg: 'anthropic.svg', websiteUrl: 'https://test1.com', defaultModel: 'model1', sonnetModel: 'model1-sonnet', opusModel: 'model1-opus', haikuModel: 'model1-haiku' },
  { name: 'TestProvider2', baseUrl: 'https://api.test2.com', iconSvg: '', websiteUrl: '', defaultModel: '', sonnetModel: '', opusModel: '', haikuModel: '' },
];

describe('AddProviderDialog', () => {
  beforeEach(() => {
    // Default mock: return templates for GET /templates, success for everything else
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === '/openpowers/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/openpowers/api/providers/templates' && init?.method === 'POST') {
        return { ok: true, status: 201, json: () => Promise.resolve({}) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dialog with correct title', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    // Wait for templates to load
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
  });

  it('does not render when isOpen is false', () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: false,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    expect(screen.queryByText('添加供应商')).not.toBeInTheDocument();
  });

  it('shows form fields: name, notes, websiteUrl, apiKey, baseUrl, and model fields', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/provider name/i)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/notes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/website url/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/api key/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/base url/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/default model/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/sonnet model/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/opus model/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/haiku model/i)).toBeInTheDocument();
  });

  it('fetches template list from GET /openpowers/api/providers/templates on mount', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/openpowers/api/providers/templates');
    });
  });

  it('shows preset selector grid with provider names from API', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    expect(screen.getByText('TestProvider2')).toBeInTheDocument();
  });

  it('pre-fills name, baseUrl, and model fields when a preset is selected', async () => {
    const user = userEvent.setup();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    const presetButton = screen.getByText('TestProvider1');
    await user.click(presetButton);

    const nameInput = screen.getByPlaceholderText(/provider name/i) as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText(/base url/i) as HTMLInputElement;
    const defaultModelInput = screen.getByPlaceholderText(/default model/i) as HTMLInputElement;
    const sonnetModelInput = screen.getByPlaceholderText(/sonnet model/i) as HTMLInputElement;
    const opusModelInput = screen.getByPlaceholderText(/opus model/i) as HTMLInputElement;
    const haikuModelInput = screen.getByPlaceholderText(/haiku model/i) as HTMLInputElement;
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
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess,
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('添加')).toBeInTheDocument();
    });
    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/api key is required/i)).toBeInTheDocument();
    expect(screen.getByText(/default model is required/i)).toBeInTheDocument();
    expect(screen.getByText(/sonnet model is required/i)).toBeInTheDocument();
    expect(screen.getByText(/opus model is required/i)).toBeInTheDocument();
    expect(screen.getByText(/haiku model is required/i)).toBeInTheDocument();
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
        showToast: vi.fn(),
      }),
    );
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
      if (urlStr === '/openpowers/api/providers/templates') {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose,
        onSuccess,
        showToast: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/provider name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/provider name/i), 'My Provider');
    await user.type(screen.getByPlaceholderText(/api key/i), 'test-key-123');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.example.com');
    await user.type(screen.getByPlaceholderText(/default model/i), 'claude-sonnet-4.6');
    await user.type(screen.getByPlaceholderText(/sonnet model/i), 'claude-sonnet-4.6');
    await user.type(screen.getByPlaceholderText(/opus model/i), 'claude-opus-4.7');
    await user.type(screen.getByPlaceholderText(/haiku model/i), 'claude-haiku-4.5');

    const submitButton = screen.getByText('添加');
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/openpowers/api/providers',
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
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    const backdrop = document.querySelector('.fixed.inset-0')?.firstChild as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show advanced fields like model selector, speed test, or common config', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('添加供应商')).toBeInTheDocument();
    });
    expect(screen.queryByText(/model selector/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/speed test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/common config/i)).not.toBeInTheDocument();
  });

  it('only shows templates from the API response', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    // Presets from the deleted presets.ts should not appear
    expect(screen.queryByText('Claude Official')).not.toBeInTheDocument();
    expect(screen.queryByText('DeepSeek')).not.toBeInTheDocument();
  });

  // bi-001: Brand SVG icons in preset selector
  it('preset buttons with valid iconSvg render brand SVG img tag', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });
    // Each preset button with an iconSvg should contain an img tag
    const presetImgs = document.querySelectorAll('button img[alt="Provider icon"]');
    expect(presetImgs.length).toBeGreaterThan(0);
  });

  it('custom preset "自定义配置" with empty iconSvg shows no icon img', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('自定义配置')).toBeInTheDocument();
    });
    const customBtn = screen.getByText('自定义配置').closest('button');
    expect(customBtn).toBeInTheDocument();
    const imgInCustomBtn = customBtn?.querySelector('img');
    expect(imgInCustomBtn).not.toBeInTheDocument();
  });

  it('form fields start empty when no preset is selected', async () => {
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('自定义配置')).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText(/provider name/i) as HTMLInputElement;
    const notesInput = screen.getByPlaceholderText(/notes/i) as HTMLInputElement;
    const websiteUrlInput = screen.getByPlaceholderText(/website url/i) as HTMLInputElement;
    const apiKeyInput = screen.getByPlaceholderText(/api key/i) as HTMLInputElement;
    const baseUrlInput = screen.getByPlaceholderText(/base url/i) as HTMLInputElement;
    const defaultModelInput = screen.getByPlaceholderText(/default model/i) as HTMLInputElement;
    const sonnetModelInput = screen.getByPlaceholderText(/sonnet model/i) as HTMLInputElement;
    const opusModelInput = screen.getByPlaceholderText(/opus model/i) as HTMLInputElement;
    const haikuModelInput = screen.getByPlaceholderText(/haiku model/i) as HTMLInputElement;
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
  it('sends POST to /openpowers/api/providers/templates with form data excluding apiKey', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/provider name/i), 'My Template');
    await user.type(screen.getByPlaceholderText(/api key/i), 'secret-key');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.example.com');
    await user.type(screen.getByPlaceholderText(/default model/i), 'model-x');
    await user.type(screen.getByPlaceholderText(/sonnet model/i), 'model-s');
    await user.type(screen.getByPlaceholderText(/opus model/i), 'model-o');
    await user.type(screen.getByPlaceholderText(/haiku model/i), 'model-h');
    await user.type(screen.getByPlaceholderText(/website url/i), 'https://example.com');
    await user.type(screen.getByPlaceholderText(/notes/i), 'some notes');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/openpowers/api/providers/templates',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    // Verify the call body does not include apiKey or notes (provider-specific fields)
    const fetchCalls = vi.mocked(fetch).mock.calls;
    const postCall = fetchCalls.find((call) =>
      typeof call[0] === 'string' && call[0] === '/openpowers/api/providers/templates'
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
    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/provider name/i), 'New Template');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.new.com');

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
      if (urlStr === '/openpowers/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/openpowers/api/providers/templates' && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: 'Template name "TestProvider1" already exists' }),
        };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/provider name/i), 'TestProvider1');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.test.com');

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
      if (urlStr === '/openpowers/api/providers/templates' && (!init || init.method === undefined || init.method === 'GET')) {
        return { ok: true, status: 200, json: () => Promise.resolve(mockTemplates) };
      }
      if (urlStr === '/openpowers/api/providers/templates' && init?.method === 'POST') {
        return {
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }) as typeof fetch);

    render(
      React.createElement(AddProviderDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
        showToast,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('TestProvider1')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/provider name/i), 'Broken Template');
    await user.type(screen.getByPlaceholderText(/base url/i), 'https://api.broken.com');

    const addAsTemplateBtn = screen.getByText('添加为模板');
    await user.click(addAsTemplateBtn);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringMatching(/添加.*模板.*失败|模板.*添加.*失败|add.*template.*fail|fail.*template/i),
        'error',
      );
    });
  });
});
