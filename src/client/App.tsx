/**
 * Root application component.
 * Wires together Layout and ProviderList with callback props.
 * Manages state for add, edit, and delete provider dialogs.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useCallback } from 'react';
import { Layout } from './components/Layout.js';
import { ProviderList } from './components/ProviderList.js';
import { AddProviderDialog } from './components/AddProviderDialog.js';
import { EditProviderDialog } from './components/EditProviderDialog.js';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog.js';
import type { Provider } from '../server/providers-store.js';
import { logger } from '../utils/logger.js';

/**
 * App is the root component that composes the Layout with the ProviderList.
 * Manages dialog open/close state and the selected provider for edit/delete.
 */
export function App(): React.ReactElement {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

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
  };

  // --- Toggle handler ---

  const handleToggle = async (provider: Provider) => {
    try {
      await fetch(`/api/providers/${provider.id}/toggle`, { method: 'PATCH' });
    } catch (err) {
      logger.error(`Failed to toggle provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // --- Render ---

  return React.createElement(
    'div',
    null,
    React.createElement(
      Layout,
      { onAddProvider: handleOpenAddDialog },
      React.createElement(ProviderList, {
        onToggle: handleToggle,
        onEdit: handleOpenEditDialog,
        onDelete: handleOpenDeleteDialog,
        onAddProvider: handleOpenAddDialog,
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
  );
}
