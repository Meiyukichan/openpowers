/**
 * Root application component.
 * Wires together Layout and ProviderList with callback props.
 * Manages state for add, edit, and delete provider dialogs.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout.js';
import { ProviderList } from './components/ProviderList.js';
import { AddProviderDialog } from './components/AddProviderDialog.js';
import { EditProviderDialog } from './components/EditProviderDialog.js';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog.js';
import type { Provider } from '../server/providers-store.js';
import { logger } from './utils/logger.js';

/**
 * App is the root component that composes the Layout with the ProviderList.
 * Manages dialog open/close state and the selected provider for edit/delete.
 */
export function App(): React.ReactElement {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  /**
   * Fetches the active provider ID from the server on mount and whenever
   * refreshTrigger changes, so the UI stays in sync after enable/edit/delete.
   */
  useEffect(() => {
    const fetchActiveProvider = async () => {
      try {
        const response = await fetch('/openpowers/api/providers/active');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: { activeProviderId: string | null } = await response.json();
        setActiveProviderId(data.activeProviderId);
      } catch (err) {
        logger.error(`Failed to fetch active provider: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void fetchActiveProvider();
  }, [refreshTrigger]);

  // --- Add dialog handlers ---

  const handleOpenAddDialog = () => {
    setIsAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setIsAddDialogOpen(false);
  };

  const handleAddSuccess = () => {
    triggerRefresh();
  };

  // --- Edit dialog handlers ---

  const handleOpenEditDialog = (provider: Provider) => {
    setEditingProvider(provider);
  };

  const handleCloseEditDialog = () => {
    setEditingProvider(null);
  };

  const handleEditSuccess = () => {
    triggerRefresh();
  };

  // --- Delete dialog handlers ---

  const handleOpenDeleteDialog = (provider: Provider) => {
    setDeletingProvider(provider);
  };

  const handleCloseDeleteDialog = () => {
    setDeletingProvider(null);
  };

  const handleDeleteSuccess = () => {
    triggerRefresh();
    showToast('已删除供应商');
  };

  // --- Reset handler ---

  const handleReset = async () => {
    try {
      const response = await fetch('/openpowers/api/providers/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      triggerRefresh();
    } catch (err) {
      logger.error(`Failed to reset providers: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // --- Set active handler ---

  /**
   * Sets the specified provider as the active provider via PUT API,
   * then refreshes the provider list and active state.
   */
  const handleSetActive = async (provider: Provider) => {
    try {
      const response = await fetch('/openpowers/api/providers/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      triggerRefresh();
    } catch (err) {
      logger.error(`Failed to set active provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // --- Render ---

  return React.createElement(
    'div',
    null,
    React.createElement(
      Layout,
      { onAddProvider: handleOpenAddDialog, onReset: handleReset },
      React.createElement(ProviderList, {
        onEdit: handleOpenEditDialog,
        onDelete: handleOpenDeleteDialog,
        onAddProvider: handleOpenAddDialog,
        onSetActive: handleSetActive,
        activeProviderId,
        refreshTrigger,
      }),
    ),
    // Add provider dialog
    React.createElement(AddProviderDialog, {
      isOpen: isAddDialogOpen,
      onClose: handleCloseAddDialog,
      onSuccess: handleAddSuccess,
    }),
    // Edit provider dialog
    React.createElement(EditProviderDialog, {
      isOpen: editingProvider !== null,
      provider: editingProvider,
      onClose: handleCloseEditDialog,
      onSuccess: handleEditSuccess,
    }),
    // Delete confirmation dialog
    React.createElement(DeleteConfirmDialog, {
      isOpen: deletingProvider !== null,
      provider: deletingProvider,
      onClose: handleCloseDeleteDialog,
      onSuccess: handleDeleteSuccess,
    }),
    // Toast notification
    toastMessage &&
      React.createElement(
        'div',
        {
          className:
            'fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-green-100/95 px-6 py-3 text-base font-medium text-green-700 shadow-md transition-opacity duration-300',
        },
        toastMessage,
      ),
  );
}
