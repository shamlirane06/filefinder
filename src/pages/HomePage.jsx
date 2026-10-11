import { useEffect, useRef, useState } from 'react'
import SearchBar from '../components/SearchBar'
import PreviewModal from '../components/PreviewModal'
import './HomePage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null
const PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])

function formatSize(value) {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let converted = size / 1024
  let unit = 0
  while (converted >= 1024 && unit < units.length - 1) { converted /= 1024; unit += 1 }
  return `${converted.toFixed(1)} ${units[unit]}`
}

function formatDate(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'Date unavailable'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fileDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDifference = Math.round((today - fileDay) / 86400000)
  const dayLabel = dayDifference === 0
    ? 'Today'
    : dayDifference === 1
      ? 'Yesterday'
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  return `${dayLabel}, ${timeLabel}`
}

function StatIcon({ kind }) {
  const paths = {
    files: <><path d="M7 3.75h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.25A1.5 1.5 0 0 1 7.5 3.75Z"/><path d="M14 4v4h4M9 13h6M9 16h6"/></>,
    document: <><path d="M7 3.75h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.25A1.5 1.5 0 0 1 7.5 3.75Z"/><path d="M14 4v4h4M9 13h6M9 16h6"/></>,
    images: <><rect x="3.75" y="4.5" width="16.5" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4-4 3 3 2.5-2 4.5 4"/></>,
    pdf: <><path d="M7 3.75h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.25A1.5 1.5 0 0 1 7.5 3.75Z"/><path d="M14 4v4h4M8.5 15h7"/></>,
    folders: <><path d="M3.5 7h6l1.7 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 7Z"/></>,
    recent: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

function RecentFile({ file, onActionError, onPreview }) {
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase()) || !api?.getFilePreview) return undefined
    let active = true
    api.getFilePreview(file.fullPath, 'thumbnail').then((result) => {
      if (active && result?.status === 'ready') setPreview(result.dataUrl)
    }).catch(() => {})
    return () => { active = false }
  }, [file.fullPath, file.extension])
  async function openFile() {
    setMenuOpen(false)
    try {
      const result = await api?.openFile?.(file.fullPath)
      if (result?.unavailable) onActionError(file.rootFolder)
      setMessage(result?.ok ? 'Opened' : result?.unavailable ? 'Unavailable' : 'Could not open')
    } catch { setMessage('Could not open') }
  }
  async function previewFile() {
    setMenuOpen(false)
    if (!api?.getFilePreview) { setMessage('Preview is unavailable in this view.'); return }
    setMessage('')
    try {
      const result = await api.getFilePreview(file.fullPath, 'large')
      if (result?.status === 'ready' && result.dataUrl) onPreview({ ...file, preview: result.dataUrl })
      else {
        if (result?.status === 'unavailable') onActionError(file.rootFolder)
        setMessage(result?.status === 'unavailable' ? 'This file may have been moved or deleted.' : 'Preview is unavailable for this file type.')
      }
    } catch { setMessage('Preview could not be loaded. Please try again.') }
  }
  const extension = file.extension?.toLowerCase() || ''
  const typeClass = extension === '.pdf' ? 'pdf' : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg'].includes(extension) ? 'image' : 'document'
  return <article className="dashboard-file-row">
    {preview ? <img className="dashboard-file-thumb" src={preview} alt={`Preview of ${file.filename}`} /> : <div className="dashboard-file-thumb dashboard-file-icon" aria-hidden="true">{file.extension?.replace('.', '').slice(0, 4).toUpperCase() || 'FILE'}</div>}
    <div className="dashboard-file-name"><strong title={file.filename}>{file.filename}</strong><span>{file.fileType || 'File'} · {formatSize(file.size)}</span></div>
    <span className="dashboard-file-location" title={file.parentFolder}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.8 4.3h4.1l1.2 1.4h7v6.8H1.8z"/><path d="M2 6h12"/></svg>{file.parentFolder}</span>
    <time className="dashboard-file-date" dateTime={file.modifiedAt || undefined}>{formatDate(file.modifiedAt)}</time>
    <span className="dashboard-file-type"><i className={`dashboard-file-type-icon is-${typeClass}`} aria-hidden="true">{extension.replace('.', '').slice(0, 3).toUpperCase() || 'FILE'}</i>{file.fileType || 'File'}</span>
    <div className="dashboard-file-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false) }}>
      <button type="button" className="dashboard-file-menu-trigger" aria-label={`Actions for ${file.filename}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="16" cy="10" r="1.3"/></svg>
      </button>
      {menuOpen && <div className="dashboard-file-menu">
        {PREVIEW_EXTENSIONS.has(extension) && <button type="button" onClick={previewFile}>Preview</button>}
        <button type="button" onClick={openFile}>Open file</button>
      </div>}
    </div>
    {message && <span className="dashboard-file-status" role="status">{message}</span>}
  </article>
}

function HomePage({ theme, onToggleTheme, folders, loading: foldersLoading, adding, error, desktopAvailable, indexing, indexProgress, onAddFolder, onNavigate, onReindexFolder, formatRelativeTime, searchQuery, onSearchQueryChange, recentSearches, onRememberSearch }) {
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(Boolean(api?.getDashboardData))
  const [dashboardError, setDashboardError] = useState(false)
  const [unavailableFolder, setUnavailableFolder] = useState('')
  const [previewingFile, setPreviewingFile] = useState(null)
  const [previewActionMessage, setPreviewActionMessage] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationsRef = useRef(null)

  useEffect(() => {
    if (!notificationsOpen) return undefined
    function dismissNotifications(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setNotificationsOpen(false)
        return
      }
      if (event.type === 'pointerdown' && !notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('pointerdown', dismissNotifications)
    document.addEventListener('keydown', dismissNotifications)
    return () => {
      document.removeEventListener('pointerdown', dismissNotifications)
      document.removeEventListener('keydown', dismissNotifications)
    }
  }, [notificationsOpen])

  useEffect(() => {
    let cancelled = false
    if (!api?.getDashboardData) return undefined
    api.getDashboardData().then((response) => {
      if (cancelled) return
      if (response?.error || !response?.stats) setDashboardError(true)
      else { setDashboard(response); setDashboardError(false) }
    }).catch(() => { if (!cancelled) setDashboardError(true) }).finally(() => { if (!cancelled) setDashboardLoading(false) })
    return () => { cancelled = true }
  }, [folders, indexing])

  useEffect(() => {
    function focusHomeSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector('.home-toolbar-search .search-input')?.focus()
      }
    }
    window.addEventListener('keydown', focusHomeSearch)
    return () => window.removeEventListener('keydown', focusHomeSearch)
  }, [])

  function handleSearch(query) {
    const value = String(query || '').trim()
    if (!value) return
    onSearchQueryChange(value)
    onRememberSearch?.(value)
    onNavigate('search')
  }

  const stats = dashboard?.stats
  const foldersNeedingAttention = folders.filter((folder) => folder.indexStatus === 'error')
  const pendingFolderCount = folders.filter((folder) => folder.indexStatus === 'pending').length
  const hasIndexActivity = indexing || foldersNeedingAttention.length > 0 || pendingFolderCount > 0
  const progressPercent = indexProgress?.total > 0
    ? Math.min(100, Math.round((indexProgress.indexed / indexProgress.total) * 100))
    : 0
  return <div className="page home-page">
    <div className="home-toolbar">
      <div className="home-toolbar-search">
        <SearchBar value={searchQuery} onChange={onSearchQueryChange} onSubmit={handleSearch} placeholder="Search your files..." shortcutHint="Ctrl + K" showSubmitButton={false} />
      </div>
      <div className="home-toolbar-actions">
        <button type="button" className="home-toolbar-icon-button theme" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 15.3A8.5 8.5 0 0 1 8.7 3.7 8.5 8.5 0 1 0 20.3 15.3Z"/></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>}
        </button>
        <div className="home-notification-control" ref={notificationsRef}>
          <button type="button" className="home-toolbar-icon-button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifications" aria-expanded={notificationsOpen} aria-controls="home-notifications" title="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            {hasIndexActivity && <span className={`home-notification-indicator${foldersNeedingAttention.length ? ' is-error' : ''}`} aria-hidden="true" />}
          </button>
          {notificationsOpen && <section className="home-notification-popover" id="home-notifications" role="dialog" aria-label="Local index notifications">
            <div className="home-notification-heading">
              <div><strong>Local index</strong><span>{indexing ? 'Indexing in progress' : foldersNeedingAttention.length ? 'Folder attention needed' : pendingFolderCount ? 'Folders waiting to index' : folders.length ? 'Your index status' : 'No folders indexed'}</span></div>
              <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button>
            </div>
            {indexing && <div className="home-notification-progress" role="status" aria-live="polite">
              <span className="dashboard-spinner" aria-hidden="true" />
              <div><strong>Indexing your files...</strong><span>{indexProgress?.message || 'Updating your local index.'}</span></div>
            </div>}
            {!folders.length && !indexing && <p className="home-notification-empty">Choose a folder to start building your local file index.</p>}
            {folders.length > 0 && <ul className="home-notification-list">
              {folders.slice(0, 5).map((folder) => {
                const folderError = folder.indexStatus === 'error'
                const folderPending = folder.indexStatus === 'pending'
                return <li key={folder.path} className={folderError ? 'is-error' : ''}>
                  <span className="home-notification-folder-icon" aria-hidden="true"><StatIcon kind="folders" /></span>
                  <div className="home-notification-folder-copy">
                    <strong title={folder.name}>{folder.name}</strong>
                    <span>{folderError ? 'Needs attention' : folderPending ? 'Waiting to index' : `${Number(folder.fileCount || 0).toLocaleString()} files · Last indexed: ${formatRelativeTime?.(folder.lastIndexedAt) || 'Not yet'}`}</span>
                  </div>
                  {folderError && <button type="button" className="home-notification-reindex" onClick={() => { setNotificationsOpen(false); onReindexFolder?.(folder.path) }} disabled={!desktopAvailable || indexing}>Re-index</button>}
                </li>
              })}
              {folders.length > 5 && <li className="home-notification-more">+{(folders.length - 5).toLocaleString()} more {folders.length - 5 === 1 ? 'folder' : 'folders'}</li>}
            </ul>}
            <button type="button" className="home-notification-manage" onClick={() => { setNotificationsOpen(false); onNavigate('settings') }}>Manage folders <span aria-hidden="true">›</span></button>
          </section>}
        </div>
        <button type="button" className="home-toolbar-icon-button" onClick={() => onNavigate('settings')} aria-label="Open Settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.7.8 1.2 1.5 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 1-1.5.7Z"/></svg>
        </button>
      </div>
    </div>

    <div className="home-workspace-grid">
      <section className="home-primary-column" aria-label="Home dashboard">
        <header className="dashboard-header">
          <div className="dashboard-heading-copy">
            <h1 className="page-title">Your files, within reach</h1>
            <p className="page-subtitle">Search, preview, and organize files from your selected folders.</p>
          </div>
        </header>

        <nav className="home-category-actions" aria-label="Browse file types">
          <button type="button" onClick={() => handleSearch('documents')}><span className="home-category-icon is-document"><StatIcon kind="document" /></span><span>Documents</span><i aria-hidden="true">›</i></button>
          <button type="button" onClick={() => handleSearch('images')}><span className="home-category-icon is-image"><StatIcon kind="images" /></span><span>Images</span><i aria-hidden="true">›</i></button>
          <button type="button" onClick={() => handleSearch('PDF files')}><span className="home-category-icon is-pdf"><StatIcon kind="pdf" /></span><span>PDFs</span><i aria-hidden="true">›</i></button>
          <button type="button" onClick={() => onNavigate('settings')}><span className="home-category-icon is-folder"><StatIcon kind="folders" /></span><span>Folders</span><i aria-hidden="true">›</i></button>
          <button type="button" onClick={() => document.getElementById('home-recent-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="home-category-icon is-recent"><StatIcon kind="recent" /></span><span>Recent</span><i aria-hidden="true">›</i></button>
        </nav>

        {dashboardError && <div className="dashboard-error" role="alert">Dashboard data could not be loaded. Please try again.</div>}

        {indexing && <div className="dashboard-indexing" role="status" aria-live="polite">
          <span className="dashboard-spinner" aria-hidden="true" />
          <div className="dashboard-indexing-copy"><strong>Indexing your files...</strong><small>{indexProgress?.message || 'FileFinder is updating your local index.'}</small>
            <div className={`dashboard-progress-track${indexProgress?.total > 0 ? '' : ' is-indeterminate'}`} role="progressbar" aria-label="File indexing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indexProgress?.total > 0 ? progressPercent : undefined}>
              <span style={indexProgress?.total > 0 ? { width: `${progressPercent}%` } : undefined} />
            </div>
          </div>
          {typeof indexProgress?.indexed === 'number' && <strong className="dashboard-progress-count">{indexProgress.indexed.toLocaleString()} files</strong>}
        </div>}

        <section className="dashboard-section dashboard-recent-section" id="home-recent-files">
          <div className="dashboard-section-heading"><div><h2>Recently discovered</h2></div><button type="button" className="dashboard-text-button" onClick={() => onNavigate('search')}>View all <span aria-hidden="true">›</span></button></div>
          <div className="dashboard-recent-panel">
            <div className="dashboard-file-table-head"><span>Name</span><span>Location</span><span>Modified</span><span>Type</span><span aria-hidden="true" /></div>
            {dashboardLoading ? <div className="dashboard-skeleton-list" role="status" aria-label="Loading recent files">{Array.from({ length: 4 }, (_, index) => <div className="dashboard-skeleton-row" key={index}><i /><span /><span /><span /></div>)}</div>
              : dashboard?.recentFiles?.length ? dashboard.recentFiles.slice(0, 5).map((file) => <RecentFile key={file.fullPath} file={file} onActionError={setUnavailableFolder} onPreview={setPreviewingFile} />)
                : <div className="dashboard-empty-inline">
                  <p>{folders.length ? 'No files are currently available in the index.' : 'Select a folder to see and search your local files here.'}</p>
                  {folders.length
                    ? <button type="button" onClick={() => onReindexFolder?.(folders[0].path)} disabled={!desktopAvailable || indexing}>Re-index folder</button>
                    : <button type="button" onClick={onAddFolder} disabled={!desktopAvailable || adding}>{adding ? 'Opening…' : 'Choose a folder'}</button>}
                </div>}
          </div>
        </section>

        <section className="home-index-summary" aria-label="Local index status">
          <span className="home-index-symbol" aria-hidden="true"><StatIcon kind="folders" /></span>
          <div className="home-index-copy">
            <strong>Local Index</strong>
            <span>{dashboardLoading || foldersLoading ? 'Loading index status…' : `Watching ${folders.length.toLocaleString()} ${folders.length === 1 ? 'folder' : 'folders'} · ${Number(stats?.totalFiles || 0).toLocaleString()} files indexed`}</span>
          </div>
          <div className="home-index-actions">
            <button type="button" className="dashboard-secondary-button" onClick={() => onNavigate('settings')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h5l1.5 1.8h8.5v8.2H2.5z"/></svg>Manage Folders <span aria-hidden="true">›</span></button>
          </div>
        </section>
      </section>

      <aside className="home-side-rail" aria-label="FileFinder actions">
        <section className="home-insight-card">
          <div className="home-rail-heading"><span className="home-rail-symbol" aria-hidden="true">✦</span><h2>AI file insight</h2></div>
          <div className="home-insight-content"><span className="home-insight-mark" aria-hidden="true"><StatIcon kind="document" /></span><p>{Number(stats?.totalFiles) > 0 ? `Your local index has ${Number(stats.totalFiles).toLocaleString()} files across ${folders.length.toLocaleString()} selected ${folders.length === 1 ? 'folder' : 'folders'}.` : 'Select a folder to see insights from your local files.'}</p></div>
          <button type="button" className="home-insight-action" onClick={() => onNavigate('organize')}>Review suggestions <span aria-hidden="true">›</span></button>
        </section>

        <section className="home-quick-panel">
          <div className="home-rail-heading"><h2>Quick actions</h2></div>
          <div className="home-quick-actions">
            <button type="button" onClick={() => onNavigate('search')}><span className="quick-action-icon"><StatIcon kind="files" /></span><span><strong>Find a file</strong><small>Search your local index</small></span><span className="home-action-arrow" aria-hidden="true">›</span></button>
            <button type="button" onClick={() => document.getElementById('home-recent-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="quick-action-icon quick-action-icon-recent"><StatIcon kind="recent" /></span><span><strong>Open recent files</strong><small>Jump to your latest files</small></span><span className="home-action-arrow" aria-hidden="true">›</span></button>
            <button type="button" onClick={() => onNavigate('assistant')}><span className="quick-action-icon quick-action-icon-assistant" aria-hidden="true">✦</span><span><strong>AI Assistant</strong><small>Ask about indexed files</small></span><span className="home-action-arrow" aria-hidden="true">›</span></button>
            <button type="button" onClick={() => onNavigate('organize')}><span className="quick-action-icon quick-action-icon-organize"><StatIcon kind="folders" /></span><span><strong>Organize files</strong><small>Review file suggestions</small></span><span className="home-action-arrow" aria-hidden="true">›</span></button>
          </div>
        </section>

        {recentSearches?.length > 0 && <section className="home-recent-search-panel"><div className="home-rail-heading"><h2>Recent searches</h2></div><div className="dashboard-search-list">{recentSearches.map((query) => <button key={query} onClick={() => handleSearch(query)}><span aria-hidden="true">⌕</span>{query}</button>)}</div></section>}
      </aside>
    </div>
    {error && <p className="dashboard-error" role="alert">{error === 'Folder already added.' ? error : 'The folder action could not be completed. Please try again.'}</p>}
    {unavailableFolder && <div className="dashboard-file-unavailable" role="alert"><div><strong>File unavailable</strong><span>This file may have been moved or deleted.</span></div><button type="button" onClick={() => { onReindexFolder?.(unavailableFolder); setUnavailableFolder('') }} disabled={indexing}>{indexing ? 'Re-indexing…' : 'Re-index folder'}</button><button type="button" aria-label="Dismiss file unavailable message" onClick={() => setUnavailableFolder('')}>×</button></div>}
    {previewActionMessage && <p className="dashboard-error" role="status">{previewActionMessage}</p>}
    {previewingFile && <PreviewModal file={previewingFile} onClose={() => setPreviewingFile(null)} onOpenFile={async (file) => {
      try {
        const result = await api?.openFile?.(file.fullPath)
        if (result?.unavailable) setUnavailableFolder(file.rootFolder)
        if (result?.ok) setPreviewingFile(null)
        else setPreviewActionMessage(result?.error || 'The file could not be opened.')
      } catch { setPreviewActionMessage('The file could not be opened. Please try again.') }
    }} onOpenFolder={async (file) => {
      try {
        const result = await api?.openFolder?.(file.fullPath)
        if (result?.unavailable) setUnavailableFolder(file.rootFolder)
        if (result?.ok) setPreviewingFile(null)
        else setPreviewActionMessage(result?.error || 'The folder could not be opened.')
      } catch { setPreviewActionMessage('The folder could not be opened. Please try again.') }
    }} />}
  </div>
}

export default HomePage
