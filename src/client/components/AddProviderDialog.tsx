/**
 * AddProviderDialog component renders a modal dialog for creating a new provider.
 * Includes a preset selector grid above form fields (name, notes, websiteUrl,
 * apiKey with visibility toggle, baseUrl). Validates required fields before
 * submitting via POST /openpowers/api/providers.
 * Styled with Tailwind CSS following cc-switch patterns: backdrop overlay,
 * rounded-xl, shadows, smooth transitions.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { logger } from '../utils/logger.js';
import AnthropicSvg from '../icons/anthropic.svg?url';
import DeepSeekSvg from '../icons/deepseek.svg?url';
import XiaomimimoSvg from '../icons/xiaomimimo.svg?url';
import ChatglmSvg from '../icons/chatglm.svg?url';
import MinimaxSvg from '../icons/minimax.svg?url';
import KimiSvg from '../icons/kimi.svg?url';
import BailianSvg from '../icons/bailian.svg?url';

/** Props for the AddProviderDialog component. */
interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

/** Form field values for the add provider form. */
interface FormValues {
  name: string;
  notes: string;
  websiteUrl: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
}

/** Preset template data fetched from the templates API. */
interface ProviderPreset {
  name: string;
  websiteUrl?: string;
  baseUrl: string;
  iconSvg?: string;
  defaultModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  haikuModel?: string;
  /** Template origin: 'builtin' (from JSON resource) or 'custom' (user-added via API). */
  source: 'builtin' | 'custom';
}

/** Initial empty form values. */
const EMPTY_FORM: FormValues = {
  name: '',
  notes: '',
  websiteUrl: '',
  apiKey: '',
  baseUrl: '',
  defaultModel: '',
  sonnetModel: '',
  opusModel: '',
  haikuModel: '',
};

// Map of SVG filenames to Vite ?url imported module URLs
const ICON_MAP: Record<string, string> = {
  'anthropic.svg': AnthropicSvg,
  'deepseek.svg': DeepSeekSvg,
  'xiaomimimo.svg': XiaomimimoSvg,
  'chatglm.svg': ChatglmSvg,
  'minimax.svg': MinimaxSvg,
  'kimi.svg': KimiSvg,
  'bailian.svg': BailianSvg,
};

/**
 * AddProviderDialog renders a modal dialog with a preset selector grid
 * and form fields for creating a new Claude provider.
 */
export function AddProviderDialog({ isOpen, onClose, onSuccess, showToast }: AddProviderDialogProps): React.ReactElement | null {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>('自定义配置');
  const [templates, setTemplates] = useState<ProviderPreset[]>([]);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setShowApiKey(false);
      setErrors({});
      setSelectedPreset('自定义配置');
    }
  }, [isOpen]);

  // ESC key closes the dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fetch provider templates from API on mount
  useEffect(() => {
    if (!isOpen) return;
    fetch('/openpowers/api/providers/templates')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ProviderPreset[]) => setTemplates(data))
      .catch((err) => {
        logger.error(`Failed to fetch provider templates: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [isOpen]);

  const handleChange = (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handlePresetSelect = (preset: ProviderPreset) => {
    setSelectedPreset(preset.name);
    if (preset.name === '自定义配置') {
      setForm(EMPTY_FORM);
    } else {
      setForm((prev) => ({
        ...prev,
        name: preset.name,
        baseUrl: preset.baseUrl,
        websiteUrl: preset.websiteUrl || prev.websiteUrl,
        defaultModel: preset.defaultModel || '',
        sonnetModel: preset.sonnetModel || '',
        opusModel: preset.opusModel || '',
        haikuModel: preset.haikuModel || '',
      }));
    }
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!form.apiKey.trim()) {
      newErrors.apiKey = 'API Key is required';
    }
    if (!form.defaultModel.trim()) {
      newErrors.defaultModel = 'Default model is required';
    }
    if (!form.sonnetModel.trim()) {
      newErrors.sonnetModel = 'Sonnet model is required';
    }
    if (!form.opusModel.trim()) {
      newErrors.opusModel = 'Opus model is required';
    }
    if (!form.haikuModel.trim()) {
      newErrors.haikuModel = 'Haiku model is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDeleteTemplate = async (preset: ProviderPreset) => {
    try {
      const response = await fetch(`/openpowers/api/providers/templates/${encodeURIComponent(preset.name)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setTemplates((prev) => prev.filter((t) => t.name !== preset.name));
        if (selectedPreset === preset.name) {
          setSelectedPreset('自定义配置');
          setForm(EMPTY_FORM);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete provider template: ${message}`);
    }
  };

  const handleAddAsTemplate = async () => {
    if (!form.name.trim()) {
      showToast('Name is required to add a template', 'error');
      return;
    }

    setTemplateSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim() || undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        defaultModel: form.defaultModel.trim() || undefined,
        sonnetModel: form.sonnetModel.trim() || undefined,
        opusModel: form.opusModel.trim() || undefined,
        haikuModel: form.haikuModel.trim() || undefined,
      };

      const response = await fetch('/openpowers/api/providers/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        showToast('模板已添加', 'success');
        // Refresh templates list
        const newTemplate = await response.json();
        setTemplates((prev) => [...prev, newTemplate]);
        setSelectedPreset(newTemplate.name);
      } else {
        const data = await response.json().catch(() => ({}));
        const errorMsg = data.error || `HTTP ${response.status}`;
        if (response.status === 409) {
          showToast(errorMsg, 'error');
        } else {
          showToast(`添加模板失败: ${errorMsg}`, 'error');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to add provider template: ${message}`);
      showToast(`添加模板失败: ${message}`, 'error');
    } finally {
      setTemplateSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/openpowers/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          apiKey: form.apiKey.trim(),
          defaultModel: form.defaultModel.trim(),
          sonnetModel: form.sonnetModel.trim(),
          opusModel: form.opusModel.trim(),
          haikuModel: form.haikuModel.trim(),
          notes: form.notes.trim() || undefined,
          websiteUrl: form.websiteUrl.trim() || undefined,
          baseUrl: form.baseUrl.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to add provider: ${message}`);
      showToast(`添加供应商失败: ${message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Hardcoded custom-config entry always comes first, followed by API-fetched templates
  const CUSTOM_PRESET: ProviderPreset = { name: '自定义配置', baseUrl: '', iconSvg: '', source: 'custom' };
  const allPresets = [CUSTOM_PRESET, ...templates];

  const labelClass = 'block text-sm font-medium text-foreground mb-1';
  const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const errorClass = 'text-xs text-destructive mt-1';

  return createPortal(
    React.createElement(
      'div',
      {
        className: 'fixed inset-0 z-50 overflow-y-auto',
      },
      // Centering wrapper (clicking empty space closes dialog)
      React.createElement(
        'div',
        {
          className: 'min-h-full flex items-center justify-center p-4',
          onClick: (e: React.MouseEvent) => {
            // Close only if clicking the wrapper itself, not child elements
            if (e.target === e.currentTarget) {
              onClose();
            }
          },
        },
        // Backdrop overlay (visual only)
        React.createElement('div', {
          className: 'fixed inset-0 bg-black/50 transition-opacity duration-200 pointer-events-none',
          'aria-hidden': true,
        }),
        // Dialog panel
        React.createElement(
          'div',
          {
            ref: dialogRef,
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            role: 'dialog',
            'aria-modal': true,
            'aria-label': 'Add provider dialog',
            className:
              'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto transition-all duration-200',
          },
        // Header
        React.createElement(
          'div',
          { className: 'flex items-center justify-between px-6 py-4 border-b' },
          React.createElement('h2', { className: 'text-lg font-semibold' }, '添加供应商'),
        ),
        // Body
        React.createElement(
          'form',
          { onSubmit: handleSubmit, className: 'px-6 py-4 space-y-4' },
          // Preset selector section
          React.createElement(
            'div',
            null,
            React.createElement('label', { className: 'block text-sm font-medium mb-2' }, '供应商模板'),
            React.createElement(
              'div',
              { className: 'grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1' },
              ...allPresets.map((preset) =>
                React.createElement(
                  'div',
                  {
                    key: preset.name,
                    className: 'relative',
                  },
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      title: preset.name,
                      onClick: () => handlePresetSelect(preset),
                      className: `w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        selectedPreset === preset.name
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 hover:bg-gray-200 text-foreground'
                      }`,
                    },
                    React.createElement(
                      'div',
                      {
                        className: 'h-6 w-6 rounded flex items-center justify-center flex-shrink-0',
                      },
                      (() => {
                        const svgUrl = preset.iconSvg ? ICON_MAP[preset.iconSvg] : undefined;
                        if (svgUrl) {
                          return React.createElement('img', {
                            src: svgUrl,
                            alt: 'Provider icon',
                            width: 16,
                            height: 16,
                            loading: 'lazy',
                          });
                        }
                        return null;
                      })(),
                    ),
                    React.createElement('span', { className: 'truncate text-left' }, preset.name),
                  ),
                  // Delete button overlay for custom templates (exclude hardcoded custom config)
                  (preset.source === 'custom' && preset.name !== '自定义配置')
                    ? React.createElement(
                        'button',
                        {
                          type: 'button',
                          title: 'Delete template',
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeleteTemplate(preset);
                          },
                          className:
                            'absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 transition-colors',
                        },
                        '\u00D7',
                      )
                    : null,
                ),
              ),
            ),
          ),
          // Form fields
          // Name + Notes row
          React.createElement(
            'div',
            { className: 'grid grid-cols-2 gap-4' },
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, '供应商名称'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Provider name',
                value: form.name,
                onChange: handleChange('name'),
                className: `${inputClass} ${errors.name ? 'border-destructive' : ''}`,
                'aria-label': 'Provider name',
              }),
              errors.name && React.createElement('p', { className: errorClass }, errors.name),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, '备注'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Notes (optional)',
                value: form.notes,
                onChange: handleChange('notes'),
                className: inputClass,
                'aria-label': 'Notes',
              }),
            ),
          ),
          // Website URL field
          React.createElement('div', null,
            React.createElement('label', { className: labelClass }, '官网链接'),
            React.createElement('input', {
              type: 'url',
              placeholder: 'Website URL (optional)',
              value: form.websiteUrl,
              onChange: handleChange('websiteUrl'),
              className: inputClass,
              'aria-label': 'Website URL',
            }),
          ),
          // API Key field with visibility toggle
          React.createElement(
            'div',
            null,
            React.createElement('label', { className: labelClass }, 'API Key'),
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement('input', {
                type: showApiKey ? 'text' : 'password',
                placeholder: 'API Key',
                value: form.apiKey,
                onChange: handleChange('apiKey'),
                className: `${inputClass} pr-10 ${errors.apiKey ? 'border-destructive' : ''}`,
                'aria-label': 'API Key',
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setShowApiKey((prev) => !prev),
                  className:
                    'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors',
                  'aria-label': showApiKey ? 'Hide API key' : 'Show API key',
                },
                React.createElement(showApiKey ? EyeOff : Eye, { size: 16 }),
              ),
            ),
            errors.apiKey && React.createElement('p', { className: errorClass }, errors.apiKey),
          ),
          // Base URL field
          React.createElement('div', null,
            React.createElement('label', { className: labelClass }, '请求地址'),
            React.createElement('input', {
              type: 'url',
              placeholder: 'Base URL (optional)',
              value: form.baseUrl,
              onChange: handleChange('baseUrl'),
              className: inputClass,
              'aria-label': 'Base URL',
            }),
          ),
          // Model fields - compact 2x2 grid
          React.createElement(
            'div',
            { className: 'grid grid-cols-2 gap-4' },
            // Row 1: Default Model + Sonnet
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, '默认模型'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Default Model',
                value: form.defaultModel,
                onChange: handleChange('defaultModel'),
                className: `${inputClass} ${errors.defaultModel ? 'border-destructive' : ''}`,
                'aria-label': 'Default Model',
              }),
              errors.defaultModel && React.createElement('p', { className: errorClass }, errors.defaultModel),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, 'Sonnet 模型'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Sonnet Model',
                value: form.sonnetModel,
                onChange: handleChange('sonnetModel'),
                className: `${inputClass} ${errors.sonnetModel ? 'border-destructive' : ''}`,
                'aria-label': 'Sonnet Model',
              }),
              errors.sonnetModel && React.createElement('p', { className: errorClass }, errors.sonnetModel),
            ),
          ),
          React.createElement(
            'div',
            { className: 'grid grid-cols-2 gap-4' },
            // Row 2: Opus + Haiku
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, 'Opus 模型'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Opus Model',
                value: form.opusModel,
                onChange: handleChange('opusModel'),
                className: `${inputClass} ${errors.opusModel ? 'border-destructive' : ''}`,
                'aria-label': 'Opus Model',
              }),
              errors.opusModel && React.createElement('p', { className: errorClass }, errors.opusModel),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, 'Haiku 模型'),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Haiku Model',
                value: form.haikuModel,
                onChange: handleChange('haikuModel'),
                className: `${inputClass} ${errors.haikuModel ? 'border-destructive' : ''}`,
                'aria-label': 'Haiku Model',
              }),
              errors.haikuModel && React.createElement('p', { className: errorClass }, errors.haikuModel),
            ),
          ),
          // Footer buttons
          React.createElement(
            'div',
            { className: 'flex items-center justify-between pt-4 border-t' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onClose,
                disabled: submitting,
                className:
                  'inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
              },
              '取消',
            ),
            React.createElement(
              'div',
              { className: 'flex items-center gap-2' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  disabled: submitting || templateSubmitting,
                  onClick: handleAddAsTemplate,
                  className:
                    'inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
                },
                templateSubmitting ? 'Adding template...' : '添加为模板',
              ),
              React.createElement(
                'button',
                {
                  type: 'submit',
                  disabled: submitting,
                  className:
                    'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50',
                },
                submitting ? 'Adding...' : '添加',
              ),
            ),
          ),
        ),
      ),
      ),
    ),
    document.body,
  );
}
