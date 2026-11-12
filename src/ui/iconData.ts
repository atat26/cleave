// The icon set (24px grid, 1.75px stroke, round caps), from the design in
// docs/design/browser-ui.html. Generated from its sprite; each icon is a list of
// shapes. Edit icons here, not in the design file.
export type Shape =
  | readonly ['path', { readonly d: string; readonly fill?: string }]
  | readonly [
      'circle',
      {
        readonly cx: string;
        readonly cy: string;
        readonly r: string;
        readonly fill?: string;
      },
    ];

export const ICON_SHAPES = {
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  minus: [['path', { d: 'M5 12h14' }]],
  x: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  check: [['path', { d: 'M5 12l5 5 9-10' }]],
  'chev-d': [['path', { d: 'M6 9l6 6 6-6' }]],
  'chev-u': [['path', { d: 'M6 15l6-6 6 6' }]],
  'chev-r': [['path', { d: 'M9 6l6 6-6 6' }]],
  'arrow-left': [['path', { d: 'M19 12H5M12 19l-7-7 7-7' }]],
  'arrow-right': [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
  reload: [['path', { d: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5' }]],
  retry: [['path', { d: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5' }]],
  star: [
    [
      'path',
      {
        d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
      },
    ],
  ],
  doc: [
    [
      'path',
      {
        d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
      },
    ],
  ],
  file: [
    [
      'path',
      {
        d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
      },
    ],
  ],
  code: [['path', { d: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14' }]],
  folder: [['path', { d: 'M3 6h6l2 2h10v11H3z' }]],
  layers: [['path', { d: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5' }]],
  sidebar: [['path', { d: 'M4 5h16v14H4zM9 5v14' }]],
  page: [['path', { d: 'M4 5h16v14H4zM4 9h16' }]],
  split: [['path', { d: 'M4 5h16v14H4zM4 14h16' }]],
  chat: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
  lock: [['path', { d: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3' }]],
  search: [['path', { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5' }]],
  zoom: [
    [
      'path',
      { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6' },
    ],
  ],
  download: [['path', { d: 'M12 4v11M7 11l5 5 5-5M5 20h14' }]],
  upload: [['path', { d: 'M12 16V5M7 9l5-5 5 5M5 20h14' }]],
  puzzle: [
    [
      'path',
      {
        d: 'M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z',
      },
    ],
  ],
  more: [
    ['circle', { cx: '5', cy: '12', r: '1.4', fill: 'currentColor' }],
    ['circle', { cx: '12', cy: '12', r: '1.4', fill: 'currentColor' }],
    ['circle', { cx: '19', cy: '12', r: '1.4', fill: 'currentColor' }],
  ],
  grip: [
    ['circle', { cx: '9', cy: '6', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '15', cy: '6', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '9', cy: '12', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '15', cy: '12', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '9', cy: '18', r: '1.3', fill: 'currentColor' }],
    ['circle', { cx: '15', cy: '18', r: '1.3', fill: 'currentColor' }],
  ],
  settings: [
    ['path', { d: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1' }],
    ['circle', { cx: '15', cy: '6', r: '2' }],
    ['circle', { cx: '9', cy: '12', r: '2' }],
    ['circle', { cx: '17', cy: '18', r: '2' }],
  ],
  tools: [
    [
      'path',
      {
        d: 'M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z',
      },
    ],
  ],
  sparkle: [
    [
      'path',
      {
        d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
      },
    ],
  ],
  history: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v5l3 2' }]],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  send: [['path', { d: 'M12 19V5M5 12l7-7 7 7' }]],
  pencil: [['path', { d: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4' }]],
  edit: [['path', { d: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4' }]],
  trash: [
    ['path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' }],
  ],
  copy: [['path', { d: 'M9 9h11v11H9zM5 15V4h11' }]],
  link: [
    [
      'path',
      {
        d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
      },
    ],
  ],
  warn: [['path', { d: 'M12 4l9 16H3zM12 10v4M12 17v.5' }]],
  info: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 11v5M12 8v.5' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' }],
  ],
  image: [['path', { d: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9v.5' }]],
  mic: [
    [
      'path',
      { d: 'M9 4a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3' },
    ],
  ],
  camera: [
    ['path', { d: 'M4 8h4l2-3h4l2 3h4v11H4z' }],
    ['circle', { cx: '12', cy: '13', r: '3' }],
  ],
  pin: [['path', { d: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v8' }]],
  bell: [['path', { d: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4' }]],
  print: [['path', { d: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z' }]],
  'ext-link': [['path', { d: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' }]],
  branch: [
    ['circle', { cx: '6', cy: '6', r: '2' }],
    ['circle', { cx: '6', cy: '18', r: '2' }],
    ['circle', { cx: '18', cy: '8', r: '2' }],
    ['path', { d: 'M6 8v8M18 10c0 4-6 3-12 6' }],
  ],
  bookmark: [['path', { d: 'M7 4h10v17l-5-4-5 4z' }]],
  keyboard: [['path', { d: 'M3 7h18v10H3zM7 11h.5M11 11h.5M15 11h.5M8 14h8' }]],
  eye: [
    ['path', { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  cursor: [['path', { d: 'M5 4l14 7-6 2-2 6z' }]],
  shield: [['path', { d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' }]],
  move: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  'circle-x': [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M9 9l6 6M15 9l-6 6' }],
  ],
  ban: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M5.6 5.6l12.8 12.8' }],
  ],
  spinner: [['path', { d: 'M12 3a9 9 0 1 0 9 9' }]],
  play: [['path', { d: 'M7 4l13 8-13 8z' }]],
  moon: [['path', { d: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z' }]],
  undo: [['path', { d: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' }]],
  cut: [
    ['circle', { cx: '6', cy: '6', r: '2.5' }],
    ['circle', { cx: '6', cy: '18', r: '2.5' }],
    ['path', { d: 'M8 8l12 10M8 16L20 6' }],
  ],
  paste: [['path', { d: 'M9 4h6v3H9zM7 5H5v16h14V5h-2' }]],
  'select-all': [['path', { d: 'M4 4h16v16H4zM8 12l3 3 5-6' }]],
  stop: [['path', { d: 'M7 7h10v10H7z', fill: 'currentColor' }]],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICON_SHAPES;
