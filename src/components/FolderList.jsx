import './FolderList.css'

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5h6l1.8-2H20.5v13a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-11Z"
        stroke="#2563eb"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="#eff4ff"
      />
    </svg>
  )
}

function FolderList({
  folders,
  loading,
  indexing,
  indexingFolderPath,
  onRemove,
  onReindex,
  formatRelativeTime,
}) {
  if (loading) {
    return (
      <div className="folder-list-card">
        <div className="folder-empty">Loading selected folders…</div>
      </div>
    )
  }

  if (!folders.length) {
    return (
      <div className="folder-list-card">
        <div className="folder-empty">
          <p className="folder-empty-title">No folders selected yet</p>
          <p className="folder-empty-text">
            Add folders you want FileFinder AI to search. Only selected folders are used.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="folder-list-card">
      <ul className="folder-list">
        {folders.map((folder) => {
          const isIndexingThis =
            indexing &&
            indexingFolderPath &&
            indexingFolderPath.toLowerCase() === folder.path.toLowerCase()

          const lastIndexedLabel = formatRelativeTime?.(folder.lastIndexedAt)

          return (
            <li key={folder.path} className="folder-item">
              <div className="folder-icon">
                <FolderIcon />
              </div>
              <div className="folder-meta">
                <div className="folder-name">{folder.name}</div>
                <div className="folder-path" title={folder.path}>
                  {folder.path}
                </div>
                <div className="folder-index-meta">
                  {isIndexingThis || folder.indexStatus === 'indexing' ? (
                    <span className="folder-index-status indexing">Indexing…</span>
                  ) : (
                    <>
                      <span className="folder-file-count">
                        {typeof folder.fileCount === 'number'
                          ? `${folder.fileCount.toLocaleString()} files`
                          : '0 files'}
                      </span>
                      <span className={`folder-index-status${lastIndexedLabel ? '' : ' muted'}`}>
                        {lastIndexedLabel
                          ? `Last indexed: ${lastIndexedLabel}`
                          : 'Not indexed yet'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="folder-actions">
                <button
                  type="button"
                  className="folder-reindex"
                  onClick={() => onReindex?.(folder.path)}
                  disabled={indexing}
                  aria-label={`Re-index ${folder.name}`}
                  title="Re-index folder"
                >
                  Re-index
                </button>
                <button
                  type="button"
                  className="folder-remove"
                  onClick={() => onRemove(folder.path)}
                  disabled={indexing}
                  aria-label={`Remove ${folder.name}`}
                  title="Remove folder"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default FolderList
