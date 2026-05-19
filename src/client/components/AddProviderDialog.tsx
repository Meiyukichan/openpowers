/**
 * AddProviderDialog component renders a modal dialog for creating a new provider.
 * Includes a preset selector grid above form fields (name, notes, websiteUrl,
 * apiKey with visibility toggle, baseUrl). Validates required fields before
 * submitting via POST /api/providers.
 * Styled with Tailwind CSS following cc-switch patterns: backdrop overlay,
 * rounded-xl, shadows, smooth transitions.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Sparkles, Cpu, Globe, Zap, Star, Cloud, Bot, Wrench } from 'lucide-react';
import { claudeProviderPresets, type ProviderPreset } from '../data/presets.js';
import { logger } from '../../utils/logger.js';

/** Props for the AddProviderDialog component. */
interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Form field values for the add provider form. */
interface FormValues {
  name: string;
  notes: string;
  websiteUrl: string;
  apiKey: string;
  baseUrl: string;
}

/** Initial empty form values. */
const EMPTY_FORM: FormValues = {
  name: '',
  notes: '',
  websiteUrl: '',
  apiKey: '',
  baseUrl: '',
};

// Map of icon names to Lucide React components
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  sparkles: Sparkles,
  cpu: Cpu,
  globe: Globe,
  zap: Zap,
  star: Star,
  cloud: Cloud,
  bot: Bot,
  wrench: Wrench,
};

/**
 * AddProviderDialog renders a modal dialog with a preset selector grid
 * and form fields for creating a new Claude provider.
 */
export function AddProviderDialog({ isOpen, onClose, onSuccess }: AddProviderDialogProps): React.ReactElement | null {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setShowApiKey(false);
      setErrors({});
      setSelectedPreset(null);
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
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      baseUrl: preset.baseUrl,
      websiteUrl: preset.websiteUrl || prev.websiteUrl,
    }));
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          apiKey: form.apiKey.trim(),
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
      logger.error(`Failed to add provider: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const errorClass = 'text-xs text-destructive mt-1';

  return createPortal(
    React.createElement(
      'div',
      {
        className: 'fixed inset-0 z-50 flex items-center justify-center',
      },
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
          ref: dialogRef,
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
          role: 'dialog',
          'aria-modal': true,
          'aria-label': 'Add provider dialog',
          className:
            'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto transition-all duration-200',
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
            React.createElement('label', { className: 'block text-sm font-medium mb-2' }, 'Preset Providers'),
            React.createElement(
              'div',
              { className: 'grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1' },
              ...claudeProviderPresets.map((preset) =>
                React.createElement(
                  'button',
                  {
                    key: preset.name,
                    type: 'button',
                    onClick: () => handlePresetSelect(preset),
                    className: `flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                      selectedPreset === preset.name
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted'
                    }`,
                  },
                  React.createElement(
                    'div',
                    {
                      className: 'h-7 w-7 rounded-md flex items-center justify-center',
                      style: { backgroundColor: preset.iconColor + '20' },
                    },
                    (() => {
                      const IconComponent = ICON_MAP[preset.icon];
                      if (IconComponent) {
                        return React.createElement(IconComponent, { size: 14, style: { color: preset.iconColor } });
                      }
                      return React.createElement('span', { style: { color: preset.iconColor } }, preset.name.charAt(0));
                    })(),
                  ),
                  React.createElement('span', { className: 'truncate w-full text-center' }, preset.name),
                ),
              ),
            ),
          ),
          // Form fields
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
              submitting ? 'Adding...' : '添加',
            ),
          ),
        ),
      ),
    ),
    document.body,
  );
}
