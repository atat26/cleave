/**
 * Entry point for the "renderer" (the user interface). Vite loads this file
 * and React draws the app inside the <div id="root"> in index.html.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './ui/tokens.css';
import './ui/components.css';
import { App } from './App';
import { KitPage } from './KitPage';
import { FindApp } from './FindApp';
import { PopupApp } from './PopupApp';

// Light or dark: the app asks the computer (which follows your Appearance choice,
// set in the main process) and marks the page so the dark colours apply.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () =>
  document.documentElement.setAttribute(
    'data-theme',
    dark.matches ? 'dark' : 'light',
  );
applyTheme();
dark.addEventListener('change', applyTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* #kit shows every shared control (for checking the look). */}
    {window.location.hash === '#kit' ? (
      <KitPage />
    ) : window.location.hash === '#popup' ? (
      <PopupApp />
    ) : window.location.hash === '#find' ? (
      <FindApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
