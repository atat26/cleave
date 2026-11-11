import { TOOLBAR_HEIGHT } from './layout';

// The toolbar strip. The address bar and back/forward buttons come next.
export function App() {
  return (
    <div
      style={{
        height: TOOLBAR_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        background: '#f1f3f4',
        borderBottom: '1px solid #d0d0d0',
      }}
    >
      Toolbar (platform: {window.browserApi.platform})
    </div>
  );
}
