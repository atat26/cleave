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
import { PopupApp } from './PopupApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* #kit shows every shared control (for checking the look). */}
    {window.location.hash === '#kit' ? (
      <KitPage />
    ) : window.location.hash === '#popup' ? (
      <PopupApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
