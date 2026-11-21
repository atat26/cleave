# Security

Cleave is an early, personal project. It has had its own security review but no independent audit, and the installer is not code-signed.

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
- The assistant asks before it changes anything, according to the permission levels you set in **Settings**. Each approval card shows what will be typed, written or opened.
- You decide which sites the assistant may act on freely (Trusted), which it must ask about (Unknown, the default) and which it may not touch or see at all (Blocked), in **Settings → Assistant and sites**.
- Browser extensions only get the permissions their manifest asks for, and the list is shown before you add one.
- A file Cleave cannot read is never overwritten, and backups are checked when they are restored. Only restore backups you trust.
- Updates come from this repository's releases, so they are only as safe as the account that publishes them (which uses two-factor sign-in). Because the installer is not code-signed, Windows may warn when you run it.
- The installed app refuses Chromium's remote-debugging switch on your own data.
