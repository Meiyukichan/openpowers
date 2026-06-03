/**
 * React application entry point.
 * Mounts the App component into the #root DOM element.
 * Initializes i18next with language from backend config before rendering.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App.js';
import { initI18n } from './i18n/index.js';
import './index.css';

const rootElement = document.getElementById('root');

async function bootstrap(): Promise<void> {
  const i18n = await initI18n();

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          I18nextProvider,
          { i18n },
          React.createElement(App),
        ),
      ),
    );
  }
}

void bootstrap();
