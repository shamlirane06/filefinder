import { useEffect, useState } from 'react'
import SearchBar from '../components/SearchBar'
import './SearchPage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return 'Size unavailable'
  if (Number(bytes) < 1024) return `${Number(bytes)} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = Number(bytes) / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`
}

function formatDate(value) {
  if (!value) return 'Modified date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Modified date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function SearchPage({
  folders,
  adding,
  indexing,
  desktopAvailable,
  onAddFolder,
  onReindexFolder,
  searchQuery,
  onSearchQueryChange,
}) {
  const [submittedQuery, setSubmittedQuery] = useState(searchQuery.trim())
  const [hasSubmitted, setHasSubmitted] = useState(Boolean(searchQuery.trim()))
  const [filters, setFilters] = useState({
    fileType: '',
    dateModified: 'any',
    folderPath: '',
  })
  const [sort, setSort] = useState('relevance')
  const [fileTypes, setFileTypes] = useState([])
  const [results, setResults] = useState([])
  const [resultCount, setResultCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [unavailableFolder, setUnavailableFolder] = useState('')

  const indexedFolders = folders.filter((folder) => Number(folder.fileCount) > 0)
  const hasIndexedFolders = indexedFolders.length > 0
  const hasActiveFilter = Boolean(filters.fileType || filters.folderPath || filters.dateModified !== 'any')

  useEffect(() => {
    if (!api?.getSearchOptions) return
    let cancelled = false
    api.getSearchOptions()
      .then((options) => {
        if (!cancelled) setFileTypes(Array.isArray(options?.fileTypes) ? options.fileTypes : [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load search filters.')
      })
    return () => {
      cancelled = true
    }
  }, [folders])

  useEffect(() => {
    if (!hasSubmitted || !hasIndexedFolders || !api?.searchFiles) return
    let cancelled = false
    api.searchFiles({
      query: submittedQuery,
      ...filters,
      sort,
    }).then((response) => {
      if (cancelled) return
      setError('')
      setResults(Array.isArray(response?.results) ? response.results : [])
      setResultCount(Number(response?.total) || 0)
    }).catch(() => {
      if (!cancelled) {
        setResults([])
        setResultCount(0)
        setError('Search could not be completed. Please try again.')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [filters, hasIndexedFolders, hasSubmitted, sort, submittedQuery])

  function handleSearch(value) {
    const nextQuery = value.trim()
    setSubmittedQuery(nextQuery)
    setHasSubmitted(true)
    setActionMessage('')
    setUnavailableFolder('')
    setError('')
    setLoading(Boolean(api?.searchFiles && hasIndexedFolders))
    if (!api?.searchFiles) setError('Desktop search is unavailable. Please run the Electron app.')
  }

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setHasSubmitted(true)
    setActionMessage('')
    setError('')
    setLoading(Boolean(api?.searchFiles && hasIndexedFolders))
    if (!api?.searchFiles) setError('Desktop search is unavailable. Please run the Electron app.')
  }

  function updateSort(value) {
    setSort(value)
    setError('')
    if (hasSubmitted) setLoading(Boolean(api?.searchFiles && hasIndexedFolders))
  }

  async function runFileAction(action, file, successMessage) {
    if (!api?.[action]) {
      setActionMessage('Desktop file actions are unavailable.')
      return
    }
    setActionMessage('')
    try {
      const result = await api[action](file.fullPath)
      setActionMessage(result?.ok ? successMessage : result?.error || 'The file action failed.')
      setUnavailableFolder(result?.unavailable ? file.rootFolder : '')
    } catch {
      setActionMessage('The file action failed. Please try again.')
    }
  }

  return (
    <div className="page search-page">
      <div className="page-header">
        <div className="page-eyebrow">Search</div>
        <h1 className="page-title">What are you looking for?</h1>
        <p className="page-subtitle">
          Search filenames, file types, folders, and paths in your indexed folders.
        </p>
      </div>

      {!hasIndexedFolders ? (
        <div className="search-empty-state">
          {!desktopAvailable && (
            <p className="search-desktop-required" role="alert">
              <strong>Desktop app required</strong>
              <span>Please run FileFinder AI using the Electron desktop application.</span>
            </p>
          )}
          <h2>No folders have been indexed yet.</h2>
          <button
            type="button"
            className="search-add-folder"
            onClick={onAddFolder}
            disabled={adding || indexing}
          >
            {adding ? 'Opening…' : 'Add Folder'}
          </button>
        </div>
      ) : (
        <>
          <SearchBar
            value={searchQuery}
            onChange={onSearchQueryChange}
            onSubmit={handleSearch}
          />

          <div className="search-controls" aria-label="Search filters and sorting">
            <label className="search-control">
              <span>File Type</span>
              <select
                value={filters.fileType}
                onChange={(event) => updateFilter('fileType', event.target.value)}
              >
                <option value="">All types</option>
                {fileTypes.map((fileType) => (
                  <option key={fileType} value={fileType}>{fileType}</option>
                ))}
              </select>
            </label>
            <label className="search-control">
              <span>Date Modified</span>
              <select
                value={filters.dateModified}
                onChange={(event) => updateFilter('dateModified', event.target.value)}
              >
                <option value="any">Any time</option>
                <option value="day">Past 24 hours</option>
                <option value="week">Past week</option>
                <option value="month">Past month</option>
                <option value="year">Past year</option>
              </select>
            </label>
            <label className="search-control">
              <span>Folder</span>
              <select
                value={filters.folderPath}
                onChange={(event) => updateFilter('folderPath', event.target.value)}
              >
                <option value="">All indexed folders</option>
                {indexedFolders.map((folder) => (
                  <option key={folder.path} value={folder.path}>{folder.name}</option>
                ))}
              </select>
            </label>
            <label className="search-control">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => updateSort(event.target.value)}>
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {error && <div className="search-error" role="alert">{error}</div>}
          {actionMessage && <div className="search-action-message" role="status">{actionMessage}</div>}
          {unavailableFolder && (
            <button
              type="button"
              className="search-add-folder"
              onClick={() => {
                onReindexFolder?.(unavailableFolder)
                setUnavailableFolder('')
              }}
              disabled={indexing}
            >
              {indexing ? 'Re-indexing…' : 'Re-index folder'}
            </button>
          )}

          {loading ? (
            <p className="search-results-status" role="status">Searching indexed files…</p>
          ) : hasSubmitted && (submittedQuery || hasActiveFilter) ? (
            <p className="search-results-status" role="status" aria-live="polite">
              {resultCount.toLocaleString()} {resultCount === 1 ? 'file' : 'files'} found
            </p>
          ) : null}

          {!loading && hasSubmitted && (submittedQuery || hasActiveFilter) && resultCount === 0 && !error && (
            <div className="search-empty-state" role="status">
              <h2>No matching files found.</h2>
              <p>Try a different filename, folder, or keyword.</p>
            </div>
          )}

          {!loading && hasSubmitted && !submittedQuery && !hasActiveFilter && !resultCount && !error && (
            <p className="search-hint">Enter a keyword or choose a filter to search your files.</p>
          )}

          {!hasSubmitted && (
            <p className="search-hint">Search by filename, extension, folder, or path.</p>
          )}

          <div className="search-results" aria-live="polite">
            {results.map((file) => (
              <article className="search-result-card" key={file.fullPath}>
                <div className="search-result-heading">
                  <div className="search-file-icon" aria-hidden="true">
                    {file.extension ? file.extension.replace('.', '').slice(0, 4).toUpperCase() : 'FILE'}
                  </div>
                  <div className="search-file-title">
                    <h2>{file.filename}</h2>
                    <p>{file.fileType || 'File'} · {formatSize(file.size)} · Modified {formatDate(file.modifiedAt)}</p>
                  </div>
                </div>
                <p className="search-file-location" title={file.parentFolder}>
                  {file.parentFolder}
                </p>
                {file.aiMatch && (
                  <p className="search-ai-explanation">
                    <strong>Why this matched:</strong> {file.matchExplanation}
                  </p>
                )}
                <div className="search-result-actions">
                  <button type="button" onClick={() => runFileAction('openFile', file, 'File opened.')}>Open File</button>
                  <button type="button" onClick={() => runFileAction('openFolder', file, 'Folder opened.')}>Open Folder</button>
                  <button type="button" onClick={() => runFileAction('copyPath', file, 'Path copied to clipboard.')}>Copy Path</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default SearchPage
