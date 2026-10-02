import './SettingsPage.css'

function SettingsPage({
  folders,
  indexing,
  totalFiles,
  onNavigate,
  onReindexAll,
  onClearIndex,
  formatRelativeTime,
}) {
  return (
    <div className="page settings-page">
      <div className="page-header">
        <div className="page-eyebrow">Settings</div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Manage folders, privacy preferences, and application details.
        </p>
      </div>

      <section className="settings-section">
        <h2>Indexed folders</h2>
        <p className="settings-desc">
          FileFinder AI only indexes folders you explicitly select.
        </p>
        {folders.length === 0 ? (
          <p className="settings-empty">No folders selected yet.</p>
        ) : (
          <ul className="settings-folder-list">
            {folders.map((folder) => (
              <li key={folder.path}>
                <strong>{folder.name}</strong>
                <span>{folder.path}</span>
                <span className="settings-folder-meta">
                  {folder.lastIndexedAt
                    ? `Last indexed: ${formatRelativeTime?.(folder.lastIndexedAt) || '—'}`
                    : 'Not indexed yet'}
                  {typeof folder.fileCount === 'number'
                    ? ` · ${folder.fileCount.toLocaleString()} files`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="settings-link-btn"
          onClick={() => onNavigate('home')}
        >
          Manage folders on Home
        </button>
      </section>

      <section className="settings-section">
        <h2>Index management</h2>
        <p className="settings-desc">
          {totalFiles > 0
            ? `${totalFiles.toLocaleString()} files currently in the local index.`
            : 'No files indexed yet. Add a folder on Home to start.'}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="settings-action-btn"
            onClick={onReindexAll}
            disabled={indexing || folders.length === 0}
          >
            {indexing ? 'Indexing…' : 'Re-index all folders'}
          </button>
          <button
            type="button"
            className="settings-action-btn danger"
            onClick={onClearIndex}
            disabled={indexing || totalFiles === 0}
          >
            Clear index
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>AI settings</h2>
        <p className="settings-desc">
          AI features will be configurable here in a later phase. No API keys are required yet.
        </p>
      </section>

      <section className="settings-section">
        <h2>Privacy</h2>
        <p className="settings-desc">
          FileFinder AI only indexes folders you explicitly select. Files stay on your computer.
          Document content is never sent to an external service unless you enable AI features later
          and explicitly opt in.
        </p>
      </section>

      <section className="settings-section">
        <h2>About</h2>
        <p className="settings-desc">
          FileFinder AI v0.2.0 — Phase 2 indexing. Find, understand, and organize your files.
        </p>
      </section>
    </div>
  )
}

export default SettingsPage
