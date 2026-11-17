// The small "Press Esc to exit full screen" pill shown for a moment when a page
// goes full screen. It is its own tiny page in a view above the page, because a
// full screen page shows nothing outside itself. Pure code with no Electron.
export const HINT_WIDTH = 330;
export const HINT_HEIGHT = 44;
export const HINT_MS = 3000;

export const HINT_TEXT = 'Press Esc to exit full screen';

export const hintUrl = (): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;overflow:hidden}
body{display:grid;place-items:center;height:100vh;font:14px system-ui,Segoe UI,sans-serif}
div{background:rgba(20,22,26,.86);color:#fff;border-radius:22px;padding:10px 20px}
</style><div>${HINT_TEXT}</div>`,
  )}`;
