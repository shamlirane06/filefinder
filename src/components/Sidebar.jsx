import './Sidebar.css'

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'search',
    label: 'Search',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 10h8M8 13.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'organize',
    label: 'Organization',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.5 8.5 12 3l8.5 5.5V20a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.7.8 1.2 1.5 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
]

function Sidebar({ activePage, onNavigate, folderCount, indexing, theme, onToggleTheme }) {
  const statusLabel = indexing ? 'Indexing files…' : folderCount ? 'Local index ready' : 'Local index is empty'
  const statusHint = indexing
    ? 'Scanning your selected folders'
    : folderCount
      ? 'Your files are indexed and ready'
      : 'Add a folder to build your local index'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M20 2.5 37.5 12.5 20 22.5 2.5 12.5 20 2.5Z" fill="var(--color-action-blue)" />
          <path d="M2.5 17.5 20 27.5 37.5 17.5v7.5L20 35 2.5 25v-7.5Z" fill="var(--color-action-hover)" />
          <path d="m12.5 7 17.5 10-10 5.75L2.5 12.5 12.5 7Z" fill="var(--color-border-accent)" />
          <path d="m20 22.5 7.5-4.3v7.5L20 30l-7.5-4.3v-7.5l7.5 4.3Z" fill="var(--color-primary-navy)" />
        </svg></div>
        <span className="brand-name">FileFinder AI</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {activePage !== 'home' && <button
        type="button"
        className="sidebar-theme-toggle"
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        <span className="sidebar-theme-icon" aria-hidden="true">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M20.3 15.3A8.5 8.5 0 0 1 8.7 3.7 8.5 8.5 0 1 0 20.3 15.3Z" /></svg>
          )}
        </span>
        <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
      </button>}

      <button type="button" className="sidebar-status" onClick={() => onNavigate('settings')} aria-label="Manage local index folders">
        <span className="status-row">
          <span className={`status-dot${indexing ? ' indexing' : ''}`} aria-hidden="true" />
          <span className="status-label">{statusLabel}</span>
        </span>
        <span className="status-hint">{statusHint}</span>
        <svg className="sidebar-status-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
      </button>

    </aside>
  )
}

export default Sidebar
