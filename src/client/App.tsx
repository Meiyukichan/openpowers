/**
 * Root application component.
 * Wires together Layout and ProviderList with callback props.
 * Manages state for add, edit, and delete provider dialogs.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle } from 'lucide-react';
import { Layout } from './components/Layout.js';
import { ProviderList } from './components/ProviderList.js';
import { ProjectSidebar } from './components/ProjectSidebar.js';
import { DetailPanel } from './components/DetailPanel.js';
import { AddProviderDialog } from './components/AddProviderDialog.js';
import { EditProviderDialog } from './components/EditProviderDialog.js';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog.js';
import type { ActivityBarView } from './components/ActivityBar.js';
import type { Provider } from '../server/providers-store.js';
import type { ChangeEntryWithCwd } from '../server/changes/shared.js';
import { logger } from './utils/logger.js';
import { localeToHtmlLang } from './i18n/index.js';

type ToastType = 'success' | 'error';

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
  const [enableFurinaProxy, setEnableFurinaProxy] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: ToastType } | null>(null);
  const [selectedChange, setSelectedChange] = useState<ChangeEntryWithCwd | null>(null);
  const [activeView, setActiveView] = useState<ActivityBarView>(() => {
    try {
      const stored = localStorage.getItem('furina:activeView');
      return stored === 'projects' || stored === 'providers' ? stored : 'providers';
    } catch {
      return 'providers';
    }
  });

  /**
   * Persists the activeView to localStorage on change, with try-catch
   * to gracefully handle environments where localStorage is unavailable.
   */
  const persistActiveView = (view: ActivityBarView) => {
    try {
      localStorage.setItem('furina:activeView', view);
    } catch {
      // silent fallback - localStorage unavailable
    }
    setActiveView(view);
    // Clear selectedChange when switching away from projects view
    if (view !== 'projects') {
      setSelectedChange(null);
    }
  };

  const handleChangeClick = useCallback((change: ChangeEntryWithCwd) => {
    setSelectedChange(change);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const { i18n, t } = useTranslation();

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  }, []);

  /**
   * Sync the <html lang> attribute with the current i18n locale.
   * Updates document.documentElement.lang whenever the language changes.
   */
  useEffect(() => {
    document.documentElement.lang = localeToHtmlLang(i18n.language);
  }, [i18n.language]);

  /**
   * Fetches the active provider ID from the server on mount and whenever
   * refreshTrigger changes, so the UI stays in sync after enable/edit/delete.
   */
  useEffect(() => {
    const fetchActiveProvider = async () => {
      try {
        const response = await fetch('/furina/api/providers/active');
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

  // Fetch proxy state on mount
  useEffect(() => {
    const fetchProxyState = async () => {
      try {
        const response = await fetch('/furina/api/providers/proxy');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: { enableFurinaProxy: boolean } = await response.json();
        setEnableFurinaProxy(data.enableFurinaProxy);
      } catch (err) {
        logger.error(`Failed to fetch proxy state: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void fetchProxyState();
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
    showToast(t('toast.providerAdded'));
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
    showToast(t('toast.providerSaved'));
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
    showToast(t('toast.providerDeleted'));
  };

  // --- Reset handler ---

  const handleReset = async () => {
    try {
      const response = await fetch('/furina/api/providers/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      triggerRefresh();
      showToast(t('toast.configRestored'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to reset providers: ${message}`);
      showToast(t('toast.restoreFailed', { message }), 'error');
    }
  };

  // --- Set active handler ---

  /**
   * Sets the specified provider as the active provider via PUT API,
   * then refreshes the provider list and active state.
   */
  const handleSetActive = async (provider: Provider) => {
    try {
      const response = await fetch('/furina/api/providers/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      triggerRefresh();
      showToast(t('toast.switchedTo', { name: provider.name }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to set active provider: ${message}`);
      showToast(t('toast.switchFailed', { message }), 'error');
    }
  };

  // --- Toggle enabled handler ---

  /**
   * Toggles the enabled state of a provider via PUT /furina/api/providers/:id/enabled,
   * then refreshes the provider list and active state.
   */
  const handleToggleEnabled = async (provider: Provider) => {
    const nextEnabled = !(provider.enabled ?? true);
    try {
      const response = await fetch(`/furina/api/providers/${provider.id}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      triggerRefresh();
      showToast(nextEnabled ? t('toast.providerEnabled') : t('toast.providerDisabled'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to toggle provider enabled state: ${message}`);
      showToast(t('toast.operationFailed', { message }), 'error');
    }
  };

  const handleToggleProxy = async () => {
    const nextState = !enableFurinaProxy;
    try {
      const response = await fetch('/furina/api/providers/proxy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableFurinaProxy: nextState }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setEnableFurinaProxy(nextState);
      showToast(nextState ? t('toast.proxyEnabled') : t('toast.proxyDisabled'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to toggle proxy: ${message}`);
      showToast(t('toast.operationFailed', { message }), 'error');
    }
  };

  // --- Render ---

  return React.createElement(
    'div',
    null,
    React.createElement(
      Layout,
      {
        onAddProvider: handleOpenAddDialog,
        onReset: handleReset,
        showToast,
        enableFurinaProxy,
        onToggleProxy: handleToggleProxy,
        activeView,
        onViewChange: persistActiveView,
        sidebar:
          activeView === 'projects'
            ? React.createElement(ProjectSidebar, {
                onChangeClick: handleChangeClick,
                selectedChange,
              })
            : null,
      },
      activeView === 'providers'
        ? React.createElement(ProviderList, {
            onEdit: handleOpenEditDialog,
            onDelete: handleOpenDeleteDialog,
            onAddProvider: handleOpenAddDialog,
            onSetActive: handleSetActive,
            onToggleEnabled: handleToggleEnabled,
            activeProviderId,
            refreshTrigger,
          })
        : React.createElement(DetailPanel, {
            selectedChange,
            key: selectedChange?.path ?? 'empty',
          }),
    ),
    // Add provider dialog
    React.createElement(AddProviderDialog, {
      isOpen: isAddDialogOpen,
      onClose: handleCloseAddDialog,
      onSuccess: handleAddSuccess,
      showToast,
    }),
    // Edit provider dialog
    React.createElement(EditProviderDialog, {
      isOpen: editingProvider !== null,
      provider: editingProvider,
      onClose: handleCloseEditDialog,
      onSuccess: handleEditSuccess,
      showToast,
    }),
    // Delete confirmation dialog
    React.createElement(DeleteConfirmDialog, {
      isOpen: deletingProvider !== null,
      provider: deletingProvider,
      onClose: handleCloseDeleteDialog,
      onSuccess: handleDeleteSuccess,
      showToast,
    }),
    // Toast notification
    toastMessage &&
      React.createElement(
        'div',
        {
          className: `fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-6 py-3 text-base font-medium shadow-md transition-all duration-300 flex items-center gap-2 ${
            toastMessage.type === 'error'
              ? 'bg-red-100/95 text-red-700'
              : 'bg-emerald-100/95 text-emerald-700'
          }`,
        },
        React.createElement(
          toastMessage.type === 'error' ? XCircle : CheckCircle,
          { size: 18 },
        ),
        toastMessage.text,
      ),
  );
}
