import { useCallback, useEffect, useRef, useState } from 'react'
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

function formatFileSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}

function FolderList({
  folders,
  loading,
  indexing,
  indexProgress,
  indexingFolderPath,
  onRemove,
  onReindex,
  formatRelativeTime,
}) {
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const cancelRemoveButton = useRef(null)

  const closeRemoveDialog = useCallback(() => {
    const trigger = pendingRemoval?.trigger
    setPendingRemoval(null)
    requestAnimationFrame(() => trigger?.focus())
  }, [pendingRemoval])

  useEffect(() => {
    if (!pendingRemoval) return undefined

    cancelRemoveButton.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRemoveDialog()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeRemoveDialog, pendingRemoval])

  function confirmRemove() {
    if (!pendingRemoval) return
    onRemove?.(pendingRemoval.folder.path)
    closeRemoveDialog()
  }

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
    <div className="folder-list-card has-folders">
      <ul className="folder-list">
        {folders.map((folder) => {
          const isIndexingThis =
            indexing &&
            indexingFolderPath &&
            indexingFolderPath.toLowerCase() === folder.path.toLowerCase()
          const folderProgress = isIndexingThis ? indexProgress : null

          const lastIndexedLabel = formatRelativeTime?.(folder.lastIndexedAt)
          const folderHasError = folder.indexStatus === 'error'
          const isIndexed = Boolean(folder.lastIndexedAt) || folder.indexStatus === 'ready'
          const indexActionLabel = folderHasError
            ? 'Try again'
            : isIndexed
              ? 'Re-index'
              : 'Start indexing'

          return (
            <li key={folder.id || folder.path} className="folder-item">
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
                    <>
                      <span className="folder-index-status indexing">Indexing files…</span>
                      {folderProgress && (
                        <>
                          <span className="folder-file-count">
                            {folderProgress.total > 0
                              ? `${(folderProgress.indexed ?? 0).toLocaleString()} / ${folderProgress.total.toLocaleString()} files`
                              : `${(folderProgress.found ?? folderProgress.indexed ?? 0).toLocaleString()} files found`}
                          </span>
                          <div
                            className="folder-progress-track"
                            role="progressbar"
                            aria-label={`Indexing ${folder.name}`}
                            aria-valuemin={0}
                            aria-valuemax={folderProgress.total || undefined}
                            aria-valuenow={folderProgress.total > 0 ? folderProgress.indexed ?? 0 : undefined}
                          >
                            <div
                              className={`folder-progress-fill${folderProgress.total > 0 ? ' determinate' : ' indeterminate'}`}
                              style={folderProgress.total > 0
                                ? { width: `${Math.min(100, Math.round(((folderProgress.indexed ?? 0) / folderProgress.total) * 100))}%` }
                                : undefined}
                            />
                          </div>
                        </>
                      )}
                    </>
                  ) : folderHasError ? (
                    <>
                      <span className="folder-file-count">
                        {typeof folder.fileCount === 'number'
                          ? `${folder.fileCount.toLocaleString()} files · ${formatFileSize(folder.totalSize)}`
                          : '0 files'}
                      </span>
                      <span className="folder-index-status error">
                        Folder unavailable. Check its permissions or select it again.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="folder-file-count">
                        {typeof folder.fileCount === 'number'
                          ? `${folder.fileCount.toLocaleString()} files · ${formatFileSize(folder.totalSize)}`
                          : '0 files'}
                      </span>
                      <span className={`folder-index-status${lastIndexedLabel ? '' : ' muted'}`}>
                        {lastIndexedLabel
                          ? `Last indexed: ${lastIndexedLabel}`
                          : 'Ready to index'}
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
                  aria-label={`${indexActionLabel} ${folder.name}`}
                  title={indexActionLabel}
                >
                  {indexActionLabel}
                </button>
                <button
                  type="button"
                  className="folder-remove"
                  onClick={(event) => setPendingRemoval({ folder, trigger: event.currentTarget })}
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
      {pendingRemoval && (
        <div className="folder-dialog-backdrop">
          <section
            className="folder-remove-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-remove-title"
            aria-describedby="folder-remove-message"
          >
            <div className="folder-dialog-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 id="folder-remove-title">Remove Folder?</h2>
            <p id="folder-remove-message">
              Are you sure you want to remove this folder from FileFinder AI?
            </p>
            <div className="folder-dialog-folder-name">{pendingRemoval.folder.name}</div>
            <div className="folder-dialog-folder-path" title={pendingRemoval.folder.path}>
              {pendingRemoval.folder.path}
            </div>
            <div className="folder-dialog-actions">
              <button type="button" className="folder-dialog-cancel" ref={cancelRemoveButton} onClick={closeRemoveDialog}>
                Cancel
              </button>
              <button type="button" className="folder-dialog-confirm" onClick={confirmRemove}>
                Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default FolderList
