import SearchBar from '../components/SearchBar'
import FolderList from '../components/FolderList'
import './HomePage.css'

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
  const showIndexCard =
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
              {progressStatus === 'error'
                ? 'Indexing issue'
                : 'Index complete'}
            </div>
            <div className="index-status-detail">
              {indexProgress?.message || `${totalFiles.toLocaleString()} files indexed`}
              {progressStatus === 'ready' && ` · ${formatFileSize(indexProgress?.totalSize)}`}
            </div>
          </div>
        )}

        <FolderList
          folders={folders}
          loading={loading}
          indexing={indexing}
          indexProgress={indexProgress}
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
