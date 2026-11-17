// Every keyboard shortcut the browser has, as plain data for Settings > Keyboard
// shortcuts (and so a test can keep the list honest). Pure code with no Electron.

export interface Shortcut {
  // The keys, as written ("Ctrl+T"). Alternatives are separated by " / ".
  keys: string;
  does: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tabs',
    shortcuts: [
      { keys: 'Ctrl+T', does: 'New tab' },
      { keys: 'Ctrl+W', does: 'Close the tab' },
      { keys: 'Ctrl+Shift+T', does: 'Reopen the tab you closed last' },
      { keys: 'Ctrl+Tab', does: 'Next tab' },
      { keys: 'Ctrl+Shift+Tab', does: 'Previous tab' },
      {
        keys: 'Ctrl+1 to Ctrl+8',
        does: 'Go to that tab, counting from the top of the sidebar',
      },
      { keys: 'Ctrl+9', does: 'Go to the last tab' },
      {
        keys: 'Ctrl+K',
        does: 'Search everything: tabs, Spaces, artifacts, chats, history',
      },
      { keys: 'Ctrl+Shift+A', does: 'Search your tabs' },
    ],
  },
  {
    title: 'Spaces',
    shortcuts: [
      {
        keys: 'Alt+1 to Alt+9',
        does: 'Go to the Space at that place in the sidebar',
      },
      { keys: 'Alt+Down / Alt+Up', does: 'Next or previous Space' },
      { keys: 'Ctrl+Shift+S', does: 'Switch Space (a list of all of them)' },
    ],
  },
  {
    title: 'Address and page',
    shortcuts: [
      { keys: 'Ctrl+L / Alt+D', does: 'Go to the address bar' },
      { keys: 'F5 / Ctrl+R', does: 'Reload the page' },
      {
        keys: 'Ctrl+Shift+R / Ctrl+F5',
        does: 'Reload the page, ignoring saved copies',
      },
      { keys: 'Esc', does: 'Stop loading the page' },
      { keys: 'Alt+Left', does: 'Back' },
      { keys: 'Alt+Right', does: 'Forward' },
      { keys: 'Ctrl+F', does: 'Find in the page' },
      { keys: 'Ctrl+D', does: 'Bookmark the page' },
      { keys: 'Ctrl+S', does: 'Save the page as a file' },
      { keys: 'Ctrl+P', does: 'Print' },
    ],
  },
  {
    title: 'Zoom',
    shortcuts: [
      { keys: 'Ctrl++', does: 'Zoom in' },
      { keys: 'Ctrl+-', does: 'Zoom out' },
      { keys: 'Ctrl+0', does: 'Back to 100%' },
    ],
  },
  {
    title: 'Your browsing',
    shortcuts: [
      { keys: 'Ctrl+H', does: 'Open your history' },
      { keys: 'Ctrl+Shift+Delete', does: 'Clear browsing data (Settings)' },
    ],
  },
  {
    title: 'The window',
    shortcuts: [
      { keys: 'Ctrl+J', does: 'Open or shrink the chat' },
      {
        keys: 'F6 / Shift+F6',
        does: 'Move to the next or previous part of the window',
      },
      { keys: 'F11', does: 'Full screen' },
      { keys: 'F12 / Ctrl+Shift+I', does: 'Developer tools' },
    ],
  },
];

// The shortcuts that match what was typed (in the keys or the words), by group;
// groups with no match are left out. An empty search keeps everything.
export function filterShortcuts(
  groups: readonly ShortcutGroup[],
  query: string,
): ShortcutGroup[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return [...groups];
  return groups
    .map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter(
        (s) =>
          s.keys.toLowerCase().includes(wanted) ||
          s.does.toLowerCase().includes(wanted),
      ),
    }))
    .filter((group) => group.shortcuts.length > 0);
}
