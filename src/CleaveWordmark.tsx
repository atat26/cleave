// The Cleave wordmark, drawn from the brand's own paths (the letters are drawings, not a font, so never
// retype the word). Standard weight; it is for placements 96 px wide or more. The colours come from the
// theme (see --cleave-letters and --cleave-line in tokens.css), so it is right in light and dark.
// Brand rule: show it on its own, never stretched or recoloured, and only in Settings > About.
export function CleaveWordmark({ width = 200 }: { width?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -8 464 130"
      width={width}
      role="img"
      aria-label="Cleave"
      style={{ display: 'block', height: 'auto' }}
    >
      <path
        d="M118 70H454"
        fill="none"
        stroke="var(--cleave-line)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <g
        fill="none"
        stroke="var(--cleave-letters)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M63 50.7A30 30 0 1 0 63 89.3" />
        <path d="M94 0V100" />
        <path d="M178 70A30 30 0 1 0 171 89.3" />
        <path d="M314 40L342 100L370 40" />
        <path d="M454 70A30 30 0 1 0 447 89.3" />
      </g>
      <g transform="translate(246 70) scale(0.5) translate(-120 -108)">
        <path
          d="M120 16 A92 92 0 0 1 212 108 L212 200 L120 200 A92 92 0 0 1 28 108 A92 92 0 0 1 120 16 Z"
          fill="var(--cleave-line)"
          stroke="var(--cleave-line)"
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <g
          fill="none"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="120" cy="108" r="60" />
          <ellipse cx="120" cy="108" rx="30" ry="60" />
          <path d="M120 48V168" />
          <path d="M60 108H180" />
          <path d="M69 78Q120 97 171 78" />
          <path d="M69 138Q120 119 171 138" />
        </g>
      </g>
    </svg>
  );
}
