/**
 * ConfirmResetDialog renders a modal confirmation dialog.
 * Used for confirming destructive or important actions such as
 * restoring Claude configuration or toggling proxy routing.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/** Props for the ConfirmResetDialog component. */
interface ConfirmResetDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmResetDialog renders a small modal dialog asking the user
 * to confirm an action before proceeding.
 */
export function ConfirmResetDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmResetDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t('confirmDialog.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('confirmDialog.cancel');

  // ESC key cancels
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    React.createElement(
      'div',
      { className: 'fixed inset-0 z-50 overflow-y-auto' },
      React.createElement(
        'div',
        {
          className: 'min-h-full flex items-center justify-center p-4',
          onClick: (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
              onCancel();
            }
          },
        },
        React.createElement('div', {
          className: 'fixed inset-0 bg-black/50 transition-opacity duration-200 pointer-events-none',
          'aria-hidden': true,
        }),
        React.createElement(
          'div',
          {
            role: 'dialog',
            'aria-modal': true,
            'aria-label': title,
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            className:
              'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-sm transition-all duration-200',
          },
          React.createElement(
            'div',
            { className: 'px-6 py-4 border-b' },
            React.createElement('h2', { className: 'text-lg font-semibold' }, title),
          ),
          React.createElement(
            'div',
            { className: 'px-6 py-4' },
            React.createElement('p', { className: 'text-sm text-muted-foreground' }, message),
          ),
          React.createElement(
            'div',
            { className: 'flex items-center justify-between px-6 py-4 border-t' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onCancel,
                className:
                  'inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
              },
              resolvedCancelLabel,
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onConfirm,
                className:
                  'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors',
              },
              resolvedConfirmLabel,
            ),
          ),
        ),
      ),
    ),
    document.body,
  );
}
