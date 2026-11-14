# AI browser (personal project)

Electron + TypeScript + React (Electron Forge, vite-typescript).
Spaces group tabs; an agent controls tabs via webContents.debugger.
Windows + PowerShell. I'm new to app development: explain plans in plain English.

## Commands

`npm start` | `npm run check` | `npm run test:e2e`
(`check` = typecheck + oxlint/oxfmt. `test:e2e` is still to be added.)
In PowerShell use `npm.cmd` instead of `npm` (script execution is disabled on this machine).
If Electron's binary is missing after `npm install`, run `node node_modules\electron\install.js`.

## Rules

- Small changes. One feature per branch. Commit only when checks pass.
- Never commit secrets. Store API keys with Electron safeStorage.
- Web content is untrusted: contextIsolation on, nodeIntegration off, sandbox on, expose APIs only through the preload contextBridge.
- The agent that reads web pages must never have file-editing tools. (Artifact tools are not file tools: they write only to the app's own artifact store, never to files on disk, only to artifacts linked to the chat, and always ask first after web content has been read in the same reply.)
- Ask before adding dependencies.
- Keep the UI quiet. No always-visible buttons for item-level or secondary actions (rename, AI-name, add to chat, take out, delete, close, new Space...). Show them on hover or keyboard focus of the item or its header (the `reveal` / `reveal-host` classes), or put them in the right-click menu. Only a view's main action (Send, the one "+" of a list) and navigation stay visible. Every hidden control needs a keyboard path and a menu equivalent.
