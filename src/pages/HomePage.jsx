import SearchBar from '../components/SearchBar'
import FolderList from '../components/FolderList'
import './HomePage.css'

function HomePage({
  folders,
  loading,
  adding,
  error,
  desktopAvailable,
  indexing,
  indexProgress,
  totalFiles,
  onAddFolder,
  onRemoveFolder,
  onReindexFolder,
  formatRelativeTime,
  onNavigate,
  searchQuery,
  onSearchQueryChange,
}) {
  function handleSearch(value) {
    const trimmed = value.trim()
    if (!trimmed) return
    onSearchQueryChange(trimmed)
    onNavigate('search')
  }

  const progressStatus = indexProgress?.status
  const indexedCount = indexProgress?.indexed ?? 0
  const totalCount = indexProgress?.total ?? 0
  const percent =
    indexing && totalCount > 0
      ? Math.min(100, Math.round((indexedCount / totalCount) * 100))
      : null
  const showIndexCard =
    indexing ||
    progressStatus === 'indexing' ||
    progressStatus === 'ready' ||
    progressStatus === 'error'

  return (
    <div className="page home-page">
      <div className="home-tagline">Your files. Organized. Always.</div>

      <div className="home-hero">
        <div className="home-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="white" strokeWidth="2.2" />
            <path d="m16 16 4 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="home-title">FileFinder AI</h1>
        <p className="home-subtitle">Find files by name, type, folder, or path.</p>

        <div className="home-search">
          <SearchBar
            value={searchQuery}
            onChange={onSearchQueryChange}
            onSubmit={handleSearch}
          />
        </div>
      </div>

      <div className="home-divider">
        <span>Or</span>
      </div>

      <div className="home-folders">
        <div className="folders-header">
          <h2>Selected Folders</h2>
          <div className="folders-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3.5 8.5h6l1.8-2H20.5v13a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-11Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              {folders.length} folder{folders.length === 1 ? '' : 's'} selected
              {totalFiles > 0 ? ` · ${totalFiles.toLocaleString()} indexed` : ''}
            </span>
          </div>
        </div>

        {!desktopAvailable ? (
          <div className="desktop-required-banner" role="alert">
            <strong>Desktop app required</strong>
            <span>Please run FileFinder AI using the Electron desktop application.</span>
          </div>
        ) : error ? (
          <div className={error === 'Folder already added.' ? 'info-banner' : 'error-banner'} role="alert">
            {error}
          </div>
        ) : null}

        {showIndexCard && (
          <div
            className={`index-status-card${
              progressStatus === 'ready'
                ? ' ready'
                : progressStatus === 'error'
                  ? ' error'
                  : ''
            }`}
          >
            <div className="index-status-title">
              {indexing || progressStatus === 'indexing'
                ? 'Indexing your files...'
                : progressStatus === 'error'
                  ? 'Indexing issue'
                  : 'Your files are ready to search.'}
            </div>
            {(indexing || progressStatus === 'indexing') && (
              <div className="index-status-bar" aria-hidden="true">
                <div
                  className={`index-status-bar-fill${percent == null ? ' indeterminate' : ' determinate'}`}
                  style={percent == null ? undefined : { width: `${percent}%` }}
                />
              </div>
            )}
            <div className="index-status-detail">
              {indexing || progressStatus === 'indexing'
                ? `${(indexProgress?.indexed ?? 0).toLocaleString()} files indexed`
                : indexProgress?.message ||
                  (totalFiles > 0
                    ? `${totalFiles.toLocaleString()} files indexed`
                    : 'Preparing index…')}
            </div>
          </div>
        )}

        <FolderList
          folders={folders}
          loading={loading}
          indexing={indexing}
          indexingFolderPath={indexProgress?.folderPath}
          onRemove={onRemoveFolder}
          onReindex={onReindexFolder}
          formatRelativeTime={formatRelativeTime}
        />

        <button
          type="button"
          className="add-folder-btn"
          onClick={onAddFolder}
          disabled={adding || loading || indexing}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          {adding ? 'Opening…' : indexing ? 'Indexing…' : 'Add Folder'}
        </button>
      </div>
    </div>
  )
}

export default HomePage
