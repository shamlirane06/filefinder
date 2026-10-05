import { useEffect, useState } from 'react'
import SearchBar from '../components/SearchBar'
import PreviewModal from '../components/PreviewModal'
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

const PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])

function SearchResultPreview({ file, onUnavailable, onOpenPreview }) {
  const previewKey = `${file.fullPath}:${file.size}:${file.modifiedAt}`
  const [preview, setPreview] = useState({ key: previewKey, status: 'loading' })

  useEffect(() => {
    if (!PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase()) || !api?.getFilePreview) return
    let cancelled = false
    api.getFilePreview(file.fullPath, 'thumbnail').then((result) => {
      if (cancelled) return
      setPreview(result?.status === 'ready' && result.dataUrl
        ? { key: previewKey, status: 'ready', dataUrl: result.dataUrl }
        : { key: previewKey, status: result?.status === 'unavailable' ? 'unavailable' : 'failed' })
      if (result?.status === 'unavailable') onUnavailable(file.rootFolder)
    }).catch(() => {
      if (!cancelled) setPreview({ key: previewKey, status: 'failed' })
    })
    return () => { cancelled = true }
  }, [file.fullPath, file.extension, file.rootFolder, file.size, file.modifiedAt, onUnavailable, previewKey])

  const currentPreview = preview.key === previewKey
    ? preview
    : { status: PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase()) ? 'loading' : 'unsupported' }

  if (currentPreview.status === 'ready') {
    return (
      <button
        type="button"
        className="search-result-preview-button"
        aria-label={`Open preview of ${file.filename}`}
        onClick={() => onOpenPreview({ ...file, preview: currentPreview.dataUrl })}
      >
        <img src={currentPreview.dataUrl} alt={`Preview of ${file.filename}`} />
      </button>
    )
  }
  if (currentPreview.status === 'unavailable') {
    return <div className="search-result-preview-placeholder is-unavailable" role="status">File unavailable</div>
  }
  return (
    <div className="search-result-preview-placeholder" aria-label={preview.status === 'loading' ? 'Loading preview' : 'Preview unavailable'}>
      <span>{file.extension ? file.extension.replace('.', '').slice(0, 4).toUpperCase() : 'FILE'}</span>
      {currentPreview.status !== 'loading' && <small>Preview unavailable</small>}
    </div>
  )
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
  onRememberSearch,
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
  const [aiSearchNotice, setAiSearchNotice] = useState('')
  const [unavailableFolder, setUnavailableFolder] = useState('')
  const [previewingFile, setPreviewingFile] = useState(null)
  const [selectedResultPaths, setSelectedResultPaths] = useState([])
  const [organizationSuggestions, setOrganizationSuggestions] = useState([])
  const [organizationLoading, setOrganizationLoading] = useState(false)
  const [reviewingSuggestion, setReviewingSuggestion] = useState(null)
  const [reviewDestinationRoot, setReviewDestinationRoot] = useState('')
  const [confirmingMove, setConfirmingMove] = useState(false)
  const [organizationMoveError, setOrganizationMoveError] = useState('')
  const [organizationUndoToken, setOrganizationUndoToken] = useState('')
  const [refreshRevision, setRefreshRevision] = useState(0)

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
      setAiSearchNotice(response?.aiUnavailable && response?.naturalLanguage
        ? 'AI search is unavailable. Showing standard file search results.'
        : response?.naturalLanguage && !response?.aiMetadataAvailable
          ? 'AI file metadata is not available yet. Showing standard file search results.'
          : '')
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
  }, [filters, hasIndexedFolders, hasSubmitted, sort, submittedQuery, refreshRevision])

  function handleSearch(value) {
    const nextQuery = value.trim()
    if (nextQuery) onRememberSearch?.(nextQuery)
    setSubmittedQuery(nextQuery)
    setHasSubmitted(true)
    setActionMessage('')
    setAiSearchNotice('')
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

  async function openLargePreview(file) {
    setPreviewingFile(file)
    if (!api?.getFilePreview) return
    try {
      const result = await api.getFilePreview(file.fullPath, 'large')
      if (result?.status === 'ready' && result.dataUrl) {
        setPreviewingFile((current) => current?.fullPath === file.fullPath
          ? { ...current, preview: result.dataUrl }
          : current)
      } else if (result?.status === 'unavailable') {
        setPreviewingFile((current) => current?.fullPath === file.fullPath ? null : current)
        setUnavailableFolder(file.rootFolder)
      }
    } catch {
      // Keep the bounded thumbnail already displayed in the preview modal.
    }
  }

  async function requestOrganizationSuggestions(fullPaths) {
    if (!api?.suggestOrganization) {
      setActionMessage('Organization suggestions are available in the desktop app.')
      return
    }
    setOrganizationLoading(true)
    setActionMessage('')
    try {
      const response = await api.suggestOrganization(fullPaths)
      const next = Array.isArray(response?.results) ? response.results.filter((item) => item?.file) : []
      setOrganizationSuggestions((current) => {
        const existing = new Map(current.map((item) => [item.file.fullPath, item]))
        for (const suggestion of next) existing.set(suggestion.file.fullPath, suggestion)
        return [...existing.values()]
      })
      const errors = (response?.results || []).filter((item) => item?.error)
      if (errors.length) setActionMessage(errors[0].error)
      setSelectedResultPaths([])
    } catch {
      setActionMessage('Organization suggestions could not be created. Please try again.')
    } finally {
      setOrganizationLoading(false)
    }
  }

  function reviewSuggestion(suggestion) {
    setReviewingSuggestion(suggestion)
    setReviewDestinationRoot(suggestion.file.rootFolder)
    setConfirmingMove(false)
    setOrganizationMoveError('')
  }

  async function confirmOrganizationMove() {
    if (!api?.moveOrganizedFile || !reviewingSuggestion || !reviewDestinationRoot) return
    setOrganizationLoading(true)
    setActionMessage('')
    setOrganizationMoveError('')
    try {
      const response = await api.moveOrganizedFile(
        reviewingSuggestion.file.fullPath,
        reviewDestinationRoot,
        [reviewingSuggestion.category, reviewingSuggestion.subcategory]
      )
      if (!response?.ok) {
        setOrganizationMoveError(response?.error || 'The file could not be moved.')
        return
      }
      setOrganizationUndoToken(response.undoToken || '')
      setOrganizationSuggestions((current) => current.filter((item) => item.file.fullPath !== reviewingSuggestion.file.fullPath))
      setSelectedResultPaths((current) => current.filter((item) => item !== reviewingSuggestion.file.fullPath))
      setActionMessage('File moved.')
      setReviewingSuggestion(null)
      setConfirmingMove(false)
      setRefreshRevision((value) => value + 1)
    } catch {
      setOrganizationMoveError('The file could not be moved. Please try again.')
    } finally {
      setOrganizationLoading(false)
    }
  }

  async function undoOrganizationMove() {
    if (!api?.undoOrganizedMove || !organizationUndoToken) return
    setOrganizationLoading(true)
    try {
      const response = await api.undoOrganizedMove(organizationUndoToken)
      setActionMessage(response?.ok ? 'File moved back to its previous location.' : response?.error || 'The move could not be undone.')
      if (response?.ok) {
        setOrganizationUndoToken('')
        setRefreshRevision((value) => value + 1)
      }
    } catch {
      setActionMessage('The move could not be undone. Please try again.')
    } finally {
      setOrganizationLoading(false)
    }
  }

  function toggleResultSelection(fullPath) {
    setSelectedResultPaths((current) => current.includes(fullPath)
      ? current.filter((item) => item !== fullPath)
      : [...current, fullPath])
  }

  const selectedIndexedResults = results.filter((file) => selectedResultPaths.includes(file.fullPath))
  const destinationFolders = folders.filter((folder) => folder.indexStatus === 'ready')
  const suggestedFolderName = destinationFolders.find((folder) => folder.path === reviewDestinationRoot)?.name || 'Selected folder'

  return (
    <div className="page search-page">
      <div className="page-header">
        <div className="page-eyebrow">Search</div>
        <h1 className="page-title">Search your files</h1>
        <p className="page-subtitle">
          Describe what you’re looking for in your indexed folders.
        </p>
        <p className="search-privacy-note">
          For natural-language searches, only the query may be sent to your configured AI provider. File contents are not sent.
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
            placeholder="Try “Find my graduation certificate”"
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
          {aiSearchNotice && <div className="search-ai-notice" role="status">{aiSearchNotice}</div>}
          {actionMessage && (
            <div className="search-action-message" role="status">
              {actionMessage}
              {organizationUndoToken && actionMessage === 'File moved.' && (
                <button type="button" onClick={undoOrganizationMove} disabled={organizationLoading}>Undo</button>
              )}
            </div>
          )}
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
              <p>Try another description, a filename, a file type, or another indexed folder.</p>
            </div>
          )}

          {!loading && hasSubmitted && !submittedQuery && !hasActiveFilter && !resultCount && !error && (
            <p className="search-hint">Enter a keyword or choose a filter to search your files.</p>
          )}

          {!hasSubmitted && (
            <p className="search-hint">Search by filename, extension, folder, or path.</p>
          )}

          <div className="search-results" aria-live="polite">
            {selectedIndexedResults.length > 0 && (
              <div className="organization-selection-toolbar">
                <span>{selectedIndexedResults.length} {selectedIndexedResults.length === 1 ? 'file' : 'files'} selected</span>
                <button
                  type="button"
                  onClick={() => requestOrganizationSuggestions(selectedIndexedResults.map((file) => file.fullPath))}
                  disabled={organizationLoading}
                >
                  {organizationLoading ? 'Suggesting…' : 'Suggest organization'}
                </button>
              </div>
            )}
            {results.map((file) => (
              <article className="search-result-card" key={file.fullPath}>
                <label className="search-result-selection">
                  <input
                    type="checkbox"
                    checked={selectedResultPaths.includes(file.fullPath)}
                    onChange={() => toggleResultSelection(file.fullPath)}
                    aria-label={`Select ${file.filename} for organization suggestions`}
                  />
                </label>
                <div className="search-result-heading">
                  <SearchResultPreview
                    file={file}
                    onUnavailable={setUnavailableFolder}
                    onOpenPreview={openLargePreview}
                  />
                  <div className="search-file-title">
                    <h2>{file.filename}</h2>
                    <p>{file.fileType || 'File'} · {formatSize(file.size)} · Modified {formatDate(file.modifiedAt)}</p>
                  </div>
                </div>
                <p className="search-file-location" title={file.parentFolder}>
                  {file.parentFolder}
                </p>
                {file.aiMatch && (
                  <div className="search-ai-match">
                    <span>AI match</span>
                    <p className="search-ai-explanation">
                      <strong>Why this matched:</strong> {file.matchExplanation}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="organization-suggest-single"
                  onClick={() => requestOrganizationSuggestions([file.fullPath])}
                  disabled={organizationLoading}
                >
                  Suggest organization
                </button>
                {organizationSuggestions.filter((suggestion) => suggestion.file.fullPath === file.fullPath).map((suggestion) => (
                  <section className="organization-suggestion" key={suggestion.file.fullPath} aria-label="Organization suggestion">
                    <h3>Organization suggestion</h3>
                    <p><strong>Suggested location:</strong> {suggestion.category} / {suggestion.subcategory}</p>
                    <p><strong>Reason:</strong> “{suggestion.reason}”</p>
                    {suggestion.aiUnavailable && <p className="organization-local-note">AI is unavailable. This suggestion uses local file metadata.</p>}
                    <div>
                      <button type="button" onClick={() => reviewSuggestion(suggestion)}>Review</button>
                      <button
                        type="button"
                        className="organization-dismiss"
                        onClick={() => setOrganizationSuggestions((current) => current.filter((item) => item.file.fullPath !== suggestion.file.fullPath))}
                      >
                        Dismiss
                      </button>
                    </div>
                  </section>
                ))}
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
      {previewingFile && (
        <PreviewModal
          file={previewingFile}
          onClose={() => setPreviewingFile(null)}
          onOpenFile={(file) => {
            setPreviewingFile(null)
            runFileAction('openFile', file, 'File opened.')
          }}
          onOpenFolder={(file) => {
            setPreviewingFile(null)
            runFileAction('openFolder', file, 'Folder opened.')
          }}
        />
      )}
      {reviewingSuggestion && (
        <div className="organization-review-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setReviewingSuggestion(null)
            setConfirmingMove(false)
          }
        }}>
          <section className="organization-review-modal" role="dialog" aria-modal="true" aria-labelledby="organization-review-title">
            <h2 id="organization-review-title">Review organization suggestion</h2>
            <dl>
              <dt>File</dt><dd>{reviewingSuggestion.file.filename}</dd>
              <dt>Current location</dt><dd>{reviewingSuggestion.file.parentFolder}</dd>
              <dt>Destination folder</dt>
              <dd>
                <label>
                  <span className="visually-hidden">Choose destination folder</span>
                  <select value={reviewDestinationRoot} onChange={(event) => {
                    setReviewDestinationRoot(event.target.value)
                    setOrganizationMoveError('')
                  }}>
                    {destinationFolders.map((folder) => <option key={folder.path} value={folder.path}>{folder.name}</option>)}
                  </select>
                </label>
              </dd>
              <dt>Suggested location</dt>
              <dd>{suggestedFolderName} / {reviewingSuggestion.category} / {reviewingSuggestion.subcategory}</dd>
            </dl>
            {confirmingMove && (
              <>
                <p className="organization-move-confirmation">
                  Confirm moving this file? The filename will stay the same.
                </p>
                {organizationMoveError && <p className="organization-move-error" role="alert">{organizationMoveError}</p>}
              </>
            )}
            <div className="organization-review-actions">
              {!confirmingMove ? (
                <button type="button" onClick={() => setConfirmingMove(true)} disabled={!reviewDestinationRoot}>Move file</button>
              ) : (
                <>
                  <button type="button" onClick={confirmOrganizationMove} disabled={organizationLoading}>
                    {organizationLoading ? 'Moving…' : 'Confirm move'}
                  </button>
                  <button type="button" onClick={() => setConfirmingMove(false)} disabled={organizationLoading}>Back</button>
                </>
              )}
              <button type="button" className="organization-dismiss" onClick={() => {
                setReviewingSuggestion(null)
                setConfirmingMove(false)
              }} disabled={organizationLoading}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default SearchPage
