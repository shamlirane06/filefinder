import { useEffect } from 'react'
import SearchBar from '../components/SearchBar'
import './OrganizePage.css'

function OrganizePage({
  folders = [],
  loading,
  adding,
  indexing,
  indexProgress,
  totalFiles = 0,
  error,
  desktopAvailable,
  onNavigate,
  onAddFolder,
  onReindexAll,
  searchQuery = '',
  onSearchQueryChange,
  onRememberSearch,
}) {
  const indexedFolders = folders.filter((folder) => Number(folder.fileCount) > 0)
  const foldersNeedingAttention = folders.filter((folder) => folder.indexStatus === 'error')
  const hasIndexedFiles = indexedFolders.length > 0 && Number(totalFiles) > 0
  const progressPercent = indexProgress?.total > 0
    ? Math.min(100, Math.round((Number(indexProgress.indexed || 0) / Number(indexProgress.total)) * 100))
    : null

  useEffect(() => {
    function focusOrganizationSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector('.organize-toolbar-search .search-input')?.focus()
      }
    }
    window.addEventListener('keydown', focusOrganizationSearch)
    return () => window.removeEventListener('keydown', focusOrganizationSearch)
  }, [])

  function handleSearch(query) {
    const value = String(query || '').trim()
    if (!value) return
    onSearchQueryChange?.(value)
    onRememberSearch?.(value)
    onNavigate?.('search')
  }

  const indexStatus = loading
    ? 'Loading local index'
    : indexing
      ? 'Indexing your files'
      : foldersNeedingAttention.length
        ? 'Needs attention'
        : hasIndexedFiles
          ? 'Index ready'
          : 'No indexed files'
  const indexStatusTone = indexing ? 'is-indexing' : foldersNeedingAttention.length ? 'is-warning' : !hasIndexedFiles ? 'is-neutral' : ''

  return (
    <div className="page organize-page">
      <div className="search-toolbar organize-toolbar">
        <div className="search-toolbar-search organize-toolbar-search">
          <SearchBar
            value={searchQuery}
            onChange={onSearchQueryChange}
            onSubmit={handleSearch}
            placeholder="Search your files..."
            shortcutHint="Ctrl + K"
            showSubmitButton={false}
            disabled={!hasIndexedFiles}
          />
        </div>
      </div>

      <div className="organize-content">
        <header className="organize-page-header">
          <div className="organize-heading-copy">
            <span className="page-eyebrow">FILE ORGANIZATION</span>
            <h1 className="page-title">Organization</h1>
            <p className="page-subtitle">Review suggested destinations for your files before confirming a move.</p>
          </div>
          <div className={`organize-index-chip ${indexStatusTone}`} role="status">
            <i aria-hidden="true" />{indexStatus}
          </div>
        </header>

        {error && desktopAvailable && <p className="organize-error" role="alert">{error}</p>}

        {indexing && (
          <section className="organize-progress" aria-label="Local index progress" role="status" aria-live="polite">
            <div className="organize-progress-copy">
              <div><strong>Updating your local index</strong><span>{indexProgress?.message || 'FileFinder is updating the selected folders.'}</span></div>
              {progressPercent !== null && <strong className="organize-progress-value">{progressPercent}%</strong>}
            </div>
            <div className={`organize-progress-track${progressPercent === null ? ' is-indeterminate' : ''}`} role="progressbar" aria-label="Indexing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent ?? undefined}>
              <span style={progressPercent !== null ? { width: `${progressPercent}%` } : undefined} />
            </div>
          </section>
        )}

        <section className="organize-summary" aria-label="Local index summary">
          <article className="organize-summary-item">
            <span>Indexed files</span>
            <strong>{loading ? '—' : Number(totalFiles).toLocaleString()}</strong>
          </article>
          <article className="organize-summary-item">
            <span>Folders with files</span>
            <strong>{loading ? '—' : indexedFolders.length.toLocaleString()}</strong>
          </article>
          <article className={`organize-summary-item${foldersNeedingAttention.length ? ' has-warning' : ''}`}>
            <span>Folders needing attention</span>
            <strong>{loading ? '—' : foldersNeedingAttention.length.toLocaleString()}</strong>
          </article>
        </section>

        {foldersNeedingAttention.length > 0 && (
          <section className="organize-attention" role="status">
            <div><strong>{foldersNeedingAttention.length === 1 ? 'A folder needs attention' : `${foldersNeedingAttention.length} folders need attention`}</strong><span>Re-index the selected folders to refresh the local file list before organizing.</span></div>
            <button type="button" onClick={onReindexAll} disabled={indexing || !desktopAvailable}>Re-index folders</button>
          </section>
        )}

        {!desktopAvailable && (
          <p className="organize-desktop-required" role="alert">
            <strong>Desktop app required</strong>
            <span>Run FileFinder AI in the Electron desktop app to access and organize local files.</span>
          </p>
        )}

        <section className="organize-workflow-card" aria-labelledby="organize-workflow-title">
          <div className="organize-workflow-heading">
            <div>
              <span className="organize-section-eyebrow">REVIEW BEFORE MOVING</span>
              <h2 id="organize-workflow-title">Organize files with confidence</h2>
              <p>Suggestions are created from files you choose in Search. Nothing moves until you confirm it.</p>
            </div>
            <span className="organize-workflow-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M3.5 7.5h6l1.8 2h9.2v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 9.5 5 5h6l1.5 2.5M8 14h8m-8 3h5"/></svg>
            </span>
          </div>

          <ol className="organize-steps">
            <li><span>1</span><div><strong>Choose files</strong><p>Search your indexed folders and select one or more results.</p></div></li>
            <li><span>2</span><div><strong>Review suggestions</strong><p>See the current location, suggested category, and reason for each file.</p></div></li>
            <li><span>3</span><div><strong>Confirm or dismiss</strong><p>Confirm a move only after review. Undo is available after a successful move.</p></div></li>
          </ol>

          <div className="organize-workflow-footer">
            {!hasIndexedFiles && !loading ? (
              <p>{folders.length ? 'Your selected folders do not have indexed files yet. Add a folder or wait for indexing to finish.' : 'Add and index a folder before requesting organization suggestions.'}</p>
            ) : (
              <p>Suggestion generation and review stay with the selected search results.</p>
            )}
            {hasIndexedFiles ? (
              <button type="button" className="organize-primary" onClick={() => onNavigate?.('search')}>
                Go to Search <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button type="button" className="organize-primary" onClick={onAddFolder} disabled={!desktopAvailable || loading || adding || indexing}>
                {loading ? 'Loading index…' : adding ? 'Opening…' : 'Add Folder'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default OrganizePage
