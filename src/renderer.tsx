/**
 * Entry point for the "renderer" (the user interface). Vite loads this file
 * and React draws the app inside the <div id="root"> in index.html.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
