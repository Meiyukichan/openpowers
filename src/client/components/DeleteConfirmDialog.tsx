/**
 * DeleteConfirmDialog component renders a confirmation modal before deleting a provider.
 * Shows the provider name in the warning and provides confirm/cancel actions.
 * Confirm calls DELETE /openpowers/api/providers/:id, cancel closes the dialog.
 * Styled with Tailwind CSS following cc-switch patterns.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import type { Provider } from '../../server/providers-store.js';
import { logger } from '../utils/logger.js';

/** Props for the DeleteConfirmDialog component. */
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

/**
 * DeleteConfirmDialog renders a modal confirmation dialog for deleting a provider.
 * Includes the provider name in the warning message and confirm/cancel buttons.
 */
export function DeleteConfirmDialog({ isOpen, provider, onClose, onSuccess, showToast }: DeleteConfirmDialogProps): React.ReactElement | null {
  const [deleting, setDeleting] = useState(false);

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

  const handleConfirm = async () => {
    if (!provider) return;

    setDeleting(true);
    try {
      const response = await fetch(`/openpowers/api/providers/${provider.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete provider: ${message}`);
      showToast(`删除供应商失败: ${message}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !provider) return null;

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
          'aria-label': 'Delete confirmation dialog',
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
          className:
            'relative z-10 bg-card border rounded-xl shadow-2xl w-full max-w-sm mx-4 transition-all duration-200',
        },
        // Body
        React.createElement(
          'div',
          { className: 'p-6 text-center' },
          // Warning icon
          React.createElement(
            'div',
            { className: 'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10' },
            React.createElement(Trash2, { size: 24, className: 'text-destructive' }),
          ),
          // Confirmation message
          React.createElement(
            'h3',
            { className: 'text-lg font-semibold mb-2' },
            '确定要删除该供应商吗？',
          ),
          // Provider name
          React.createElement(
            'p',
            { className: 'text-sm text-muted-foreground mb-6' },
            `"${provider.name}" will be permanently removed. This action cannot be undone.`,
          ),
          // Action buttons
          React.createElement(
            'div',
            { className: 'flex items-center justify-center gap-3' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onClose,
                disabled: deleting,
                className:
                  'inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted',
              },
              '取消',
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: handleConfirm,
                disabled: deleting,
                className:
                  'inline-flex items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50',
              },
              deleting ? 'Deleting...' : '确认删除',
            ),
          ),
        ),
      ),
    ),
    document.body,
  );
}
