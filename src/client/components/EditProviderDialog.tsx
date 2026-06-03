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
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import type { Provider } from '../../server/providers-store.js';
import { logger } from '../utils/logger.js';

/** Props for the EditProviderDialog component. */
interface EditProviderDialogProps {
  isOpen: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
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
export function EditProviderDialog({ isOpen, provider, onClose, onSuccess, showToast }: EditProviderDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
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
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: true; models: string[] } | { valid: false; error: string } | null>(null);

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
      setValidationResult(null);
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
    // Reset validation result when user modifies baseUrl or apiKey
    if (field === 'baseUrl' || field === 'apiKey') {
      setValidationResult(null);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = t('editProvider.validationNameRequired');
    }
    if (!form.apiKey.trim()) {
      newErrors.apiKey = t('editProvider.validationApiKeyRequired');
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
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to update provider: ${message}`);
      showToast(t('toast.saveFailed', { message }), 'error');
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
        setValidationResult({ valid: false, error: data.error || t('common.validate.validateError') });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to validate API key: ${message}`);
      setValidationResult({ valid: false, error: t('common.validate.validateTimeout') });
    } finally {
      setValidating(false);
    }
  };

  if (!isOpen || !provider) return null;

  const labelClass = 'block text-sm font-medium text-foreground mb-1';
  const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const errorClass = 'text-xs text-destructive mt-1';

  return createPortal(
    React.createElement(
      'div',
      { className: 'fixed inset-0 z-50 overflow-y-auto' },
      // Centering wrapper (clicking empty space closes dialog)
      React.createElement(
        'div',
        {
          className: 'min-h-full flex items-center justify-center p-4',
          onClick: (e: React.MouseEvent) => {
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
            role: 'dialog',
            'aria-modal': true,
            'aria-label': t('editProvider.dialogAriaLabel'),
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            className:
              'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto transition-all duration-200',
          },
        // Header
        React.createElement(
          'div',
          { className: 'flex items-center justify-between px-6 py-4 border-b' },
          React.createElement('h2', { className: 'text-lg font-semibold' }, t('editProvider.dialogTitle')),
        ),
        // Body
        React.createElement(
          'form',
          { onSubmit: handleSubmit, className: 'px-6 py-4 space-y-4' },
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
              t('common.validate.validateSuccess', { count: validationResult.models.length }),
            ),
            validationResult && !validationResult.valid && React.createElement(
              'span',
              { className: 'text-sm text-red-600' },
              validationResult.error,
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
                className: inputClass,
                'aria-label': t('common.form.defaultModelAriaLabel'),
              }),
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
                className: inputClass,
                'aria-label': t('common.form.sonnetModelAriaLabel'),
              }),
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
                className: inputClass,
                'aria-label': t('common.form.opusModelAriaLabel'),
              }),
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
                className: inputClass,
                'aria-label': t('common.form.haikuModelAriaLabel'),
              }),
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
              t('editProvider.cancel'),
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: submitting,
                className:
                  'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50',
              },
              submitting ? t('editProvider.saving') : t('editProvider.submitSave'),
            ),
          ),
        ),
      ),
      ),
    ),
    document.body,
  );
}
