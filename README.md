# Cleave

A personal AI-first desktop browser built with Electron, TypeScript and React. Tabs are grouped into Spaces, there is a built-in chat panel, and an AI agent can read and control tabs using models from my own OpenRouter / OpenCode API keys. This is an early-stage learning project.

## Installing and releasing

- **Installing:** download `Cleave-Setup.exe` from the [latest release](https://github.com/atat26/ai-browser/releases/latest) and run it. The installed app keeps its data in `%APPDATA%\Cleave`; a copy started with `npm start` keeps its own in `%APPDATA%\ai-browser`, so the two never mix.
- **Making a release** (maintainer): raise `version` in `package.json`, merge it to `main`, then from an up-to-date `main` run `npm.cmd run release:github` (add `-- -DryRun` to build without publishing). It runs the checks, builds the installer, and publishes it with checksums to GitHub Releases.
