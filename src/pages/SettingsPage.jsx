import './SettingsPage.css'

function SettingsPage({ folders, onNavigate }) {
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
        <h2>Index management</h2>
        <p className="settings-desc">
          Indexing, rebuild, and clear-index controls will appear here after Phase 4.
        </p>
      </section>

      <section className="settings-section">
        <h2>About</h2>
        <p className="settings-desc">
          FileFinder AI v0.1.0 — Phase 1 foundation. Find, understand, and organize your files.
        </p>
      </section>
    </div>
  )
}

export default SettingsPage
