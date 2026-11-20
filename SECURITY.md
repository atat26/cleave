# Security

Cleave is an early, personal project. It is not audited, and the installer is not code-signed.

## Reporting a problem

If you find a security problem, please report it privately rather than in a public issue:

1. Open the **Security** tab of this repository.
2. Choose **Report a vulnerability**.

Please include what you found, the steps to reproduce it, and the version (shown in **Settings → About Cleave**).

This is a one-person project, so I answer when I can and cannot promise a timeline. I will say what I decide to do about a report, and thank you in the fix if you wish.

## What is supported

Only the latest release. Fixes are published as a new release; there are no patches for older versions.

## Good to know

- Web pages are treated as untrusted: they run sandboxed, with no access to Node.js, and the app's own interface is separate from page content.
- Your OpenRouter key is stored encrypted on your computer using the operating system's protection (Electron's `safeStorage`) and is only ever sent to the service it belongs to (the AI provider, or the web search provider you chose).
- The assistant asks before it changes anything, according to the permission levels you set in **Settings**.
