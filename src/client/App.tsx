/**
 * Root application component.
 * Wires together Layout and ProviderList with callback props.
 * The add/edit/delete dialogs will be wired in the dialog feature (dlg-001).
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import { Layout } from './components/Layout.js';
import { ProviderList } from './components/ProviderList.js';
import type { Provider } from '../server/providers-store.js';

/**
 * App is the root component that composes the Layout with the ProviderList.
 * Callback props are placeholders that will be wired up to dialogs in dlg-001.
 */
export function App(): React.ReactElement {
  const handleAddProvider = () => {
    // Will be wired to the add provider dialog in dlg-001
  };

  const handleToggle = async (provider: Provider) => {
    try {
      await fetch(`/api/providers/${provider.id}/toggle`, { method: 'PATCH' });
    } catch (_err) {
      // Error handling will be added with toast notifications in dlg-001
    }
  };

  const handleEdit = (_provider: Provider) => {
    // Will be wired to the edit provider dialog in dlg-001
  };

  const handleDelete = (_provider: Provider) => {
    // Will be wired to the delete confirmation dialog in dlg-001
  };

  return React.createElement(
    Layout,
    { onAddProvider: handleAddProvider },
    React.createElement(ProviderList, {
      onToggle: handleToggle,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onAddProvider: handleAddProvider,
    }),
  );
}
