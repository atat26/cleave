import { Fragment, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { parseMarkdown } from './markdown';
import type { Align, Block, Inline } from './markdown';

// Draws the assistant's Markdown (see markdown.ts for what is understood). It builds
// ordinary React elements from the parsed tree, never HTML, so a reply cannot add
// anything that runs. Links open as a new tab in the browser when clicked, and show
// their real address when you hover them.

const codeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.9em',
  background: 'var(--c-surface-3)',
  borderRadius: 4,
  padding: '1px 4px',
};

const linkStyle: CSSProperties = {
  color: 'var(--c-accent)',
  textDecoration: 'underline',
  cursor: 'pointer',
};

function InlineNodes({ nodes }: { nodes: Inline[] }): ReactNode {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={i}>{node.text}</Fragment>;
          case 'strong':
            return (
              <strong key={i}>
                <InlineNodes nodes={node.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <InlineNodes nodes={node.children} />
              </em>
            );
          case 'del':
            return (
              <del key={i}>
                <InlineNodes nodes={node.children} />
              </del>
            );
          case 'code':
            return (
              <code key={i} style={codeStyle}>
                {node.text}
              </code>
            );
          case 'link':
            return (
              <span
                key={i}
                role="link"
                tabIndex={0}
                title={node.url}
                onClick={() => window.browserApi.openUrl(node.url)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') window.browserApi.openUrl(node.url);
                }}
                style={linkStyle}
              >
                <InlineNodes nodes={node.children} />
              </span>
            );
        }
      })}
    </>
  );
}

const HEADING_SIZES = [18, 16, 15, 14, 14, 14];

const textAlign = (align: Align): CSSProperties['textAlign'] =>
  align ?? undefined;

function BlockNodes({
  blocks,
  tight = false,
}: {
  blocks: Block[];
  // Inside a list item: no extra space around a lone paragraph.
  tight?: boolean;
}): ReactNode {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <div
                key={i}
                style={{
                  margin: tight ? '0 0 2px' : '0 0 8px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <InlineNodes nodes={block.children} />
              </div>
            );
          case 'heading':
            return (
              <div
                key={i}
                role="heading"
                aria-level={block.level}
                style={{
                  margin: '12px 0 6px',
                  fontWeight: 700,
                  fontSize: HEADING_SIZES[block.level - 1],
                  lineHeight: 1.3,
                }}
              >
                <InlineNodes nodes={block.children} />
              </div>
            );
          case 'code':
            return (
              <pre
                key={i}
                style={{
                  margin: '0 0 8px',
                  padding: '8px 10px',
                  background: 'var(--c-surface-2)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                  overflowX: 'auto',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  whiteSpace: 'pre',
                }}
              >
                <code>{block.text}</code>
              </pre>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={i}
                start={block.ordered ? block.start : undefined}
                style={{ margin: '0 0 8px', paddingLeft: 22 }}
              >
                {block.items.map((item, j) => (
                  <li key={j} style={{ margin: '2px 0' }}>
                    <BlockNodes blocks={item} tight />
                  </li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote
                key={i}
                style={{
                  margin: '0 0 8px',
                  paddingLeft: 10,
                  borderLeft: '3px solid var(--c-border)',
                  color: 'var(--c-text-2)',
                }}
              >
                <BlockNodes blocks={block.children} />
              </blockquote>
            );
          case 'rule':
            return (
              <hr
                key={i}
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--c-border)',
                  margin: '10px 0',
                }}
              />
            );
          case 'table':
            return (
              <div key={i} style={{ overflowX: 'auto', margin: '0 0 8px' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {block.header.map((cell, c) => (
                        <th
                          key={c}
                          style={{
                            border: '1px solid var(--c-border)',
                            padding: '4px 8px',
                            background: 'var(--c-surface-3)',
                            textAlign: textAlign(block.align[c] ?? null),
                          }}
                        >
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            style={{
                              border: '1px solid var(--c-border)',
                              padding: '4px 8px',
                              textAlign: textAlign(block.align[c] ?? null),
                            }}
                          >
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div style={{ overflowWrap: 'anywhere' }}>
      <BlockNodes blocks={blocks} />
    </div>
  );
}
