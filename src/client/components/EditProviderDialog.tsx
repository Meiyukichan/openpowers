/**
 * EditProviderDialog component renders a modal dialog for editing an existing provider.
 * Pre-fills form fields with current provider data (name, notes, websiteUrl, apiKey,
 * baseUrl). Does not show the preset selector. Submits via PUT /openpowers/api/providers/:id.
 * Styled with Tailwind CSS following cc-switch patterns.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import type { Provider } from '../../server/providers-store.js';
import { logger } from '../utils/logger.js';

/** Props for the EditProviderDialog component. */
interface EditProviderDialogProps {
  isOpen: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** Form field values for the edit provider form. */
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

/**
 * EditProviderDialog renders a modal dialog with pre-filled form fields
 * for editing an existing provider. Same fields as add dialog without preset selector.
 */
export function EditProviderDialog({ isOpen, provider, onClose, onSuccess }: EditProviderDialogProps): React.ReactElement | null {
  const [form, setForm] = useState<FormValues>({
    name: '',
    notes: '',
    websiteUrl: '',
    apiKey: '',
    baseUrl: '',
    defaultModel: '',
    sonnetModel: '',
    opusModel: '',
    haikuModel: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Sync form with provider data when dialog opens or provider changes
  useEffect(() => {
    if (isOpen && provider) {
      setForm({
        name: provider.name,
        notes: provider.notes || '',
        websiteUrl: provider.websiteUrl || '',
        apiKey: provider.apiKey || '',
        baseUrl: provider.baseUrl || '',
        defaultModel: provider.defaultModel || '',
        sonnetModel: provider.sonnetModel || '',
        opusModel: provider.opusModel || '',
        haikuModel: provider.haikuModel || '',
      });
      setShowApiKey(false);
      setErrors({});
    }
  }, [isOpen, provider]);

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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!form.apiKey.trim()) {
      newErrors.apiKey = 'API Key is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !provider) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/openpowers/api/providers/${provider.id}`, {
        method: 'PUT',
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
      logger.error(`Failed to update provider: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !provider) return null;

  const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const errorClass = 'text-xs text-destructive mt-1';

  return createPortal(
    React.createElement(
      'div',
      { className: 'fixed inset-0 z-50 flex items-center justify-center' },
      // Backdrop overlay
      React.createElement('div', {
        className: 'absolute inset-0 bg-black/50 transition-opacity duration-200',
        onClick: onClose,
        'aria-label': 'Close dialog',
      }),
      // Dialog panel
      React.createElement(
        'div',
        {
          role: 'dialog',
          'aria-modal': true,
          'aria-label': 'Edit provider dialog',
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
          className:
            'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto transition-all duration-200',
        },
        // Header
        React.createElement(
          'div',
          { className: 'flex items-center justify-between px-6 py-4 border-b' },
          React.createElement('h2', { className: 'text-lg font-semibold' }, '编辑供应商'),
        ),
        // Body
        React.createElement(
          'form',
          { onSubmit: handleSubmit, className: 'px-6 py-4 space-y-4' },
          // Name field
          React.createElement(
            'div',
            null,
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
          // Notes field
          React.createElement('div', null,
            React.createElement('input', {
              type: 'text',
              placeholder: 'Notes (optional)',
              value: form.notes,
              onChange: handleChange('notes'),
              className: inputClass,
              'aria-label': 'Notes',
            }),
          ),
          // Website URL field
          React.createElement('div', null,
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
            React.createElement('input', {
              type: 'url',
              placeholder: 'Base URL (optional)',
              value: form.baseUrl,
              onChange: handleChange('baseUrl'),
              className: inputClass,
              'aria-label': 'Base URL',
            }),
          ),
          // Default Model field
          React.createElement(
            'div',
            null,
            React.createElement('input', {
              type: 'text',
              placeholder: 'Default Model',
              value: form.defaultModel,
              onChange: handleChange('defaultModel'),
              className: inputClass,
              'aria-label': 'Default Model',
            }),
          ),
          // Sonnet Model field
          React.createElement(
            'div',
            null,
            React.createElement('input', {
              type: 'text',
              placeholder: 'Sonnet Model',
              value: form.sonnetModel,
              onChange: handleChange('sonnetModel'),
              className: inputClass,
              'aria-label': 'Sonnet Model',
            }),
          ),
          // Opus Model field
          React.createElement(
            'div',
            null,
            React.createElement('input', {
              type: 'text',
              placeholder: 'Opus Model',
              value: form.opusModel,
              onChange: handleChange('opusModel'),
              className: inputClass,
              'aria-label': 'Opus Model',
            }),
          ),
          // Haiku Model field
          React.createElement(
            'div',
            null,
            React.createElement('input', {
              type: 'text',
              placeholder: 'Haiku Model',
              value: form.haikuModel,
              onChange: handleChange('haikuModel'),
              className: inputClass,
              'aria-label': 'Haiku Model',
            }),
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
              'button',
              {
                type: 'submit',
                disabled: submitting,
                className:
                  'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50',
              },
              submitting ? 'Saving...' : '保存',
            ),
          ),
        ),
      ),
    ),
    document.body,
  );
}
