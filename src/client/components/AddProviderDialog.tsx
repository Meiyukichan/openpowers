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
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { logger } from '../utils/logger.js';
import AnthropicSvg from '../icons/anthropic.svg?url';
import DeepSeekSvg from '../icons/deepseek.svg?url';
import XiaomimimoSvg from '../icons/xiaomimimo.svg?url';
import ChatglmSvg from '../icons/chatglm.svg?url';
import MinimaxSvg from '../icons/minimax.svg?url';
import KimiSvg from '../icons/kimi.svg?url';
import BailianSvg from '../icons/bailian.svg?url';
import OpenAISvg from '../icons/openai.svg?url';

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

/** Stable ID for the built-in custom configuration preset. Used for business logic comparisons. */
const CUSTOM_PRESET_ID = '__custom__';

/** Preset template data fetched from the templates API. */
interface ProviderPreset {
  id?: string;
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
  'openai.svg': OpenAISvg,
};

/**
 * AddProviderDialog renders a modal dialog with a preset selector grid
 * and form fields for creating a new Claude provider.
 */
export function AddProviderDialog({ isOpen, onClose, onSuccess, showToast }: AddProviderDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(CUSTOM_PRESET_ID);
  const [templates, setTemplates] = useState<ProviderPreset[]>([]);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [usedTemplate, setUsedTemplate] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: true; models: string[] } | { valid: false; error: string; upstreamError?: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setShowApiKey(false);
      setErrors({});
      setSelectedPreset(CUSTOM_PRESET_ID);
      setUsedTemplate(null);
      setValidationResult(null);
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
    // Reset validation result when user modifies baseUrl or apiKey
    if (field === 'baseUrl' || field === 'apiKey') {
      setValidationResult(null);
    }
  };

  const handlePresetSelect = (preset: ProviderPreset) => {
    const presetId = preset.id ?? preset.name;
    setSelectedPreset(presetId);
    if (preset.id === CUSTOM_PRESET_ID) {
      setForm(EMPTY_FORM);
      setUsedTemplate(null);
    } else {
      setUsedTemplate(preset.name);
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
      newErrors.name = t('addProvider.validationNameRequired');
    }
    if (!form.apiKey.trim()) {
      newErrors.apiKey = t('addProvider.validationApiKeyRequired');
    }
    if (!form.defaultModel.trim()) {
      newErrors.defaultModel = t('addProvider.validationDefaultModelRequired');
    }
    if (!form.sonnetModel.trim()) {
      newErrors.sonnetModel = t('addProvider.validationSonnetModelRequired');
    }
    if (!form.opusModel.trim()) {
      newErrors.opusModel = t('addProvider.validationOpusModelRequired');
    }
    if (!form.haikuModel.trim()) {
      newErrors.haikuModel = t('addProvider.validationHaikuModelRequired');
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
        if (selectedPreset === (preset.id ?? preset.name)) {
          setSelectedPreset(CUSTOM_PRESET_ID);
          setForm(EMPTY_FORM);
          setUsedTemplate(null);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete provider template: ${message}`);
    }
  };

  const handleAddAsTemplate = async () => {
    if (!form.name.trim()) {
      showToast(t('toast.nameRequiredForTemplate'), 'error');
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
        showToast(t('toast.templateAdded'), 'success');
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
          showToast(t('toast.addTemplateFailed', { message: errorMsg }), 'error');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to add provider template: ${message}`);
      showToast(t('toast.addTemplateFailed', { message }), 'error');
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
          usedTemplate: usedTemplate || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to add provider: ${message}`);
      showToast(t('toast.operationFailed', { message }), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidateApiKey = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const response = await fetch('/openpowers/api/providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        logger.error(`Failed to validate API key: ${data.error || `HTTP ${response.status}`}`);
        setValidationResult({ valid: false, error: data.error || t('common.validate.validateFailed') });
        return;
      }
      const data = await response.json();
      if (data.valid) {
        setValidationResult({ valid: true, models: data.models || [] });
      } else {
        setValidationResult({ valid: false, error: data.error || t('common.validate.validateError'), upstreamError: data.upstreamError });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to validate API key: ${message}`);
      setValidationResult({ valid: false, error: t('common.validate.validateTimeout') });
    } finally {
      setValidating(false);
    }
  };

  if (!isOpen) return null;

  // Hardcoded custom-config entry always comes first, followed by API-fetched templates
  const CUSTOM_PRESET: ProviderPreset = { id: CUSTOM_PRESET_ID, name: t('addProvider.customPresetName'), baseUrl: '', iconSvg: '', source: 'custom' };
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
            'aria-label': t('addProvider.dialogAriaLabel'),
            className:
              'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto transition-all duration-200',
          },
        // Header
        React.createElement(
          'div',
          { className: 'flex items-center justify-between px-6 py-4 border-b' },
          React.createElement('h2', { className: 'text-lg font-semibold' }, t('addProvider.dialogTitle')),
        ),
        // Body
        React.createElement(
          'form',
          { onSubmit: handleSubmit, className: 'px-6 py-4 space-y-4' },
          // Preset selector section
          React.createElement(
            'div',
            null,
            React.createElement('label', { className: 'block text-sm font-medium mb-2' }, t('addProvider.presetLabel')),
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
                        selectedPreset === (preset.id ?? preset.name)
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
                            alt: t('addProvider.providerIcon'),
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
                  (preset.source === 'custom' && preset.id !== CUSTOM_PRESET_ID)
                    ? React.createElement(
                        'button',
                        {
                          type: 'button',
                          title: t('addProvider.deleteTemplateTitle'),
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
              React.createElement('label', { className: labelClass }, t('common.form.nameLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.namePlaceholder'),
                value: form.name,
                onChange: handleChange('name'),
                className: `${inputClass} ${errors.name ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.nameAriaLabel'),
              }),
              errors.name && React.createElement('p', { className: errorClass }, errors.name),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, t('common.form.notesLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.notesPlaceholder'),
                value: form.notes,
                onChange: handleChange('notes'),
                className: inputClass,
                'aria-label': t('common.form.notesAriaLabel'),
              }),
            ),
          ),
          // Website URL field
          React.createElement('div', null,
            React.createElement('label', { className: labelClass }, t('common.form.websiteLabel')),
            React.createElement('input', {
              type: 'url',
              placeholder: t('common.form.websitePlaceholder'),
              value: form.websiteUrl,
              onChange: handleChange('websiteUrl'),
              className: inputClass,
              'aria-label': t('common.form.websiteAriaLabel'),
            }),
          ),
          // API Key field with visibility toggle
          React.createElement(
            'div',
            null,
            React.createElement('label', { className: labelClass }, t('common.form.apiKeyLabel')),
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement('input', {
                type: showApiKey ? 'text' : 'password',
                placeholder: t('common.form.apiKeyPlaceholder'),
                value: form.apiKey,
                onChange: handleChange('apiKey'),
                className: `${inputClass} pr-10 ${errors.apiKey ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.apiKeyAriaLabel'),
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setShowApiKey((prev) => !prev),
                  className:
                    'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors',
                  'aria-label': showApiKey ? t('common.form.hideApiKey') : t('common.form.showApiKey'),
                },
                React.createElement(showApiKey ? EyeOff : Eye, { size: 16 }),
              ),
            ),
            errors.apiKey && React.createElement('p', { className: errorClass }, errors.apiKey),
          ),
          // Validate API Key button
          React.createElement(
            'div',
            { className: 'flex items-center gap-2' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: handleValidateApiKey,
                disabled: !form.baseUrl.trim() || !form.apiKey.trim() || validating,
                className:
                  'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
              },
              validating ? t('common.validate.validating') : t('common.validate.validateButton'),
            ),
            validationResult && validationResult.valid && React.createElement(
              'span',
              { className: 'text-sm text-green-600' },
              validationResult.models.length > 0
                ? t('common.validate.validateSuccess', { count: validationResult.models.length })
                : t('common.validate.validateSuccessNoModels'),
            ),
            validationResult && !validationResult.valid && React.createElement(
              'div',
              { className: 'text-sm text-red-600' },
              React.createElement('span', null, validationResult.error),
              validationResult.upstreamError && React.createElement(
                'pre',
                { className: 'mt-1 text-xs text-red-500 whitespace-pre-wrap break-all max-h-24 overflow-auto' },
                validationResult.upstreamError,
              ),
            ),
          ),
          // Base URL field
          React.createElement('div', null,
            React.createElement('label', { className: labelClass }, t('common.form.baseUrlLabel')),
            React.createElement('input', {
              type: 'url',
              placeholder: t('common.form.baseUrlPlaceholder'),
              value: form.baseUrl,
              onChange: handleChange('baseUrl'),
              className: inputClass,
              'aria-label': t('common.form.baseUrlAriaLabel'),
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
              React.createElement('label', { className: labelClass }, t('common.form.defaultModelLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.defaultModelPlaceholder'),
                value: form.defaultModel,
                onChange: handleChange('defaultModel'),
                className: `${inputClass} ${errors.defaultModel ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.defaultModelAriaLabel'),
              }),
              errors.defaultModel && React.createElement('p', { className: errorClass }, errors.defaultModel),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, t('common.form.sonnetModelLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.sonnetModelPlaceholder'),
                value: form.sonnetModel,
                onChange: handleChange('sonnetModel'),
                className: `${inputClass} ${errors.sonnetModel ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.sonnetModelAriaLabel'),
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
              React.createElement('label', { className: labelClass }, t('common.form.opusModelLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.opusModelPlaceholder'),
                value: form.opusModel,
                onChange: handleChange('opusModel'),
                className: `${inputClass} ${errors.opusModel ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.opusModelAriaLabel'),
              }),
              errors.opusModel && React.createElement('p', { className: errorClass }, errors.opusModel),
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: labelClass }, t('common.form.haikuModelLabel')),
              React.createElement('input', {
                type: 'text',
                placeholder: t('common.form.haikuModelPlaceholder'),
                value: form.haikuModel,
                onChange: handleChange('haikuModel'),
                className: `${inputClass} ${errors.haikuModel ? 'border-destructive' : ''}`,
                'aria-label': t('common.form.haikuModelAriaLabel'),
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
              t('addProvider.cancel'),
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
                templateSubmitting ? t('addProvider.addingTemplate') : t('addProvider.addAsTemplate'),
              ),
              React.createElement(
                'button',
                {
                  type: 'submit',
                  disabled: submitting,
                  className:
                    'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50',
                },
                submitting ? t('addProvider.adding') : t('addProvider.submitAdd'),
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
