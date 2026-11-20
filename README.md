<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/cleave-wordmark-dark.svg">
    <img alt="Cleave" src="assets/cleave-wordmark.svg" width="280">
  </picture>
</p>

<h3 align="center">A browser with an assistant built in.</h3>

<p align="center">
  Web on top, chat below. Cleave keeps the pages, chats and notes for each piece of work together,<br>
  and the assistant can read and use your pages when you ask it to.
</p>

<p align="center">
  <strong><a href="https://github.com/atat26/ai-browser/releases/latest/download/Cleave-Setup.exe">Download Cleave for Windows</a></strong><br>
  <sub>Free · Windows 10 and 11, 64-bit · <a href="https://github.com/atat26/ai-browser/releases">All versions</a></sub>
</p>

---

## What it does

- **Spaces.** Group tabs, chats and saved pages by piece of work, so you can switch tasks without losing your place.
- **An assistant that can act.** Ask it to read a page, fill in a form or tidy your tabs. For bigger jobs it shows a plan first, and you choose which actions it may take without asking.
- **Your key, your data.** Cleave uses your own [OpenRouter](https://openrouter.ai) key, stored encrypted on your computer. Your chats, history and Spaces stay on your computer.
- **Extensions.** Install extensions from the Chrome Web Store, and keep them up to date from Settings.

## Install it

1. Download **Cleave-Setup.exe** (button above) and run it.
2. Open Cleave from the Start menu. It starts empty: no account and nothing to import.
3. In **Settings → Model & provider**, paste your OpenRouter API key to turn the assistant on. Without a key it still works as a browser.

> **Windows may warn you the first time.** Cleave is a personal project and the installer is not signed, so Windows SmartScreen can show "Windows protected your PC". Choose **More info**, then **Run anyway**. The code is all here, so you can read it or build it yourself.

Cleave is an early, personal project, offered as it is with no warranty. The assistant can make mistakes, so check what it does before you rely on it.

---

## For developers

Cleave is built with Electron, TypeScript and React (Electron Forge, Vite).

```powershell
npm.cmd install
npm.cmd start          # run a development copy
npm.cmd run check      # typecheck, lint and format check, unit tests
```

(`npm.cmd` rather than `npm` because PowerShell script execution is off on the author's machine; plain `npm` works elsewhere.)

A copy started with `npm start` keeps its data in `%APPDATA%\ai-browser`; the installed app keeps its own in `%APPDATA%\Cleave`, so the two never mix and can run side by side.

**Making a release.** Raise `version` in `package.json`, merge it to `main`, then from an up-to-date `main` run `npm.cmd run release:github` (add `-- -DryRun` to build without publishing). It runs the checks, builds the installer, and publishes it with checksums to GitHub Releases.

## Licence

MIT. See [LICENSE](LICENSE).
