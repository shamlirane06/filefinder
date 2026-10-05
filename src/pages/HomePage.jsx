import { useEffect, useState } from 'react'
import SearchBar from '../components/SearchBar'
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
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function StatIcon({ kind }) {
  const paths = {
    files: <><path d="M7 3.75h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.25A1.5 1.5 0 0 1 7.5 3.75Z"/><path d="M14 4v4h4M9 13h6M9 16h6"/></>,
    images: <><rect x="3.75" y="4.5" width="16.5" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4-4 3 3 2.5-2 4.5 4"/></>,
    pdf: <><path d="M7 3.75h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.25A1.5 1.5 0 0 1 7.5 3.75Z"/><path d="M14 4v4h4M8.5 15h7"/></>,
    folders: <><path d="M3.5 7h6l1.7 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 7Z"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

function RecentFile({ file, onActionError }) {
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase()) || !api?.getFilePreview) return undefined
    let active = true
    api.getFilePreview(file.fullPath, 'thumbnail').then((result) => {
      if (active && result?.status === 'ready') setPreview(result.dataUrl)
    }).catch(() => {})
    return () => { active = false }
  }, [file.fullPath, file.extension])
  async function openFile() {
    try {
      const result = await api?.openFile?.(file.fullPath)
      if (result?.unavailable) onActionError(file.rootFolder)
      setMessage(result?.ok ? 'Opened' : result?.unavailable ? 'Unavailable' : 'Could not open')
    } catch { setMessage('Could not open') }
  }
  return <article className="dashboard-file-row">
    {preview ? <img className="dashboard-file-thumb" src={preview} alt={`Preview of ${file.filename}`} /> : <div className="dashboard-file-thumb dashboard-file-icon" aria-hidden="true">{file.extension?.replace('.', '').slice(0, 4).toUpperCase() || 'FILE'}</div>}
    <div className="dashboard-file-name"><strong title={file.filename}>{file.filename}</strong><span>{file.fileType || 'File'} · {formatSize(file.size)}</span></div>
    <span className="dashboard-file-location" title={file.parentFolder}>{file.parentFolder}</span>
    <time className="dashboard-file-date" dateTime={file.modifiedAt || undefined}>{formatDate(file.modifiedAt)}</time>
    <button type="button" className="dashboard-file-open" onClick={openFile}>Open</button>
    {message && <span className="dashboard-file-status" role="status">{message}</span>}
  </article>
}

function HomePage({ folders, loading: foldersLoading, adding, error, desktopAvailable, indexing, onAddFolder, onNavigate, onReindexFolder, searchQuery, onSearchQueryChange, recentSearches, onRememberSearch }) {
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(Boolean(api?.getDashboardData))
  const [dashboardError, setDashboardError] = useState(false)
  const [unavailableFolder, setUnavailableFolder] = useState('')

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

  function handleSearch(query) {
    const value = String(query || '').trim()
    if (!value) return
    onSearchQueryChange(value)
    onRememberSearch?.(value)
    onNavigate('search')
  }

  const stats = dashboard?.stats
  const statItems = [
    ['files', 'Total files', stats?.totalFiles, 'Across your selected folders'],
    ['images', 'Images', stats?.images, 'Visual files indexed'],
    ['pdf', 'PDFs', stats?.pdfs, 'Documents ready to search'],
    ['folders', 'Indexed folders', stats?.totalFolders, 'Your local workspace'],
  ]
  const [greeting] = useState(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  })

  return <div className="page home-page">
    <header className="dashboard-header">
      <div><div className="page-eyebrow">DASHBOARD</div><p className="dashboard-greeting">{greeting}, Shamli</p><h1 className="page-title">Your files, understood.</h1><p className="page-subtitle">Find anything in your indexed folders using natural language.</p></div>
      <div className="dashboard-header-actions"><span className="dashboard-index-chip"><i /> Indexed locally</span><button type="button" className="dashboard-profile" aria-label="FileFinder local workspace">S</button></div>
    </header>

    <div className="dashboard-search-wrap"><SearchBar value={searchQuery} onChange={onSearchQueryChange} onSubmit={handleSearch} placeholder="Try “Find my graduation certificate”" /></div>

    {dashboardError && <div className="dashboard-error" role="alert">Dashboard data could not be loaded. Please try again.</div>}

    <section className="dashboard-stat-grid" aria-label="Index summary">
      {statItems.map(([kind, label, value, detail]) => <article className="dashboard-stat-card" key={label}><div className={`dashboard-stat-icon dashboard-stat-icon-${kind}`}><StatIcon kind={kind} /></div><div className="dashboard-stat-label">{label}</div><strong>{dashboardLoading || foldersLoading ? '—' : Number(value || 0).toLocaleString()}</strong><span className="dashboard-stat-detail">{detail}</span></article>)}
    </section>

    {folders.length === 0 && <section className="dashboard-empty-state"><div className="dashboard-empty-art" aria-hidden="true"><StatIcon kind="folders" /><span>⌕</span></div><h2>Start finding your files</h2><p>Add a folder and FileFinder AI will index it so you can search naturally.</p><button type="button" onClick={onAddFolder} disabled={!desktopAvailable || adding}>{adding ? 'Opening…' : '+ Add Folder'}</button><small>Your file index remains on this device.</small></section>}
    {folders.length > 0 && stats?.totalFiles === 0 && !dashboardLoading && <section className="dashboard-empty-state"><div className="dashboard-empty-art" aria-hidden="true"><StatIcon kind="folders" /><span>⌕</span></div><h2>No files have been indexed yet</h2><p>Add or re-index a folder to get started.</p><button type="button" onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing}>Add Folder</button></section>}

    {indexing && <div className="dashboard-indexing" role="status"><span className="dashboard-spinner" /><span><strong>Indexing your files…</strong><small>FileFinder is updating your local index.</small></span></div>}

    <section className="dashboard-section">
      <div className="dashboard-section-heading"><div><h2>Quick actions</h2><p>Jump straight into your next task.</p></div></div>
      <div className="dashboard-quick-actions">
        <button onClick={() => onNavigate('search')}><span className="quick-action-icon"><StatIcon kind="files" /></span><strong>Search Files</strong><small>Find files using natural language</small></button>
        <button className="quick-action-ai" onClick={() => onNavigate('assistant')}><span className="quick-action-icon" aria-hidden="true">✦</span><strong>AI Assistant</strong><small>Ask questions about your files</small><i>AI</i></button>
        <button onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing}><span className="quick-action-icon"><StatIcon kind="folders" /></span><strong>Add Folder</strong><small>Index another folder</small></button>
        <button onClick={() => onNavigate('settings')}><span className="quick-action-icon" aria-hidden="true">✧</span><strong>Analyze Files</strong><small>Understand images and PDFs with AI</small></button>
      </div>
    </section>

    <section className="dashboard-section">
      <div className="dashboard-section-heading"><div><h2>Recently modified</h2><p>The latest changes in your indexed folders.</p></div><button className="dashboard-text-button" onClick={() => onNavigate('search')}>Browse all files <span aria-hidden="true">→</span></button></div>
      <div className="dashboard-recent-layout">
        <div className="dashboard-recent-panel">
          <div className="dashboard-file-table-head"><span>File name</span><span>Folder</span><span>Modified</span><span /></div>
          {dashboardLoading ? <div className="dashboard-skeleton-list" role="status" aria-label="Loading recent files">{Array.from({ length: 4 }, (_, index) => <div className="dashboard-skeleton-row" key={index}><i /><span /><span /><span /></div>)}</div>
            : dashboard?.recentFiles?.length ? dashboard.recentFiles.map((file) => <RecentFile key={file.fullPath} file={file} onActionError={setUnavailableFolder} />)
              : <p className="dashboard-muted">{folders.length ? 'No recently modified files are in the index.' : 'Add and index a folder to see your recent files here.'}</p>}
        </div>
        <aside className="dashboard-insight-card"><span className="dashboard-insight-icon" aria-hidden="true">✦</span><div className="dashboard-insight-label">FILEFINDER AI</div><h3>AI understands your files</h3><p>Search can use titles, descriptions, keywords, and text already indexed for your documents.</p><button type="button" onClick={() => handleSearch('certificates')}>Find certificates <span aria-hidden="true">→</span></button><div className="dashboard-insight-foot"><i /> Grounded in your indexed files</div></aside>
      </div>
    </section>

    {recentSearches?.length > 0 && <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Recent searches</h2><p>Only saved for this app session.</p></div></div><div className="dashboard-search-list">{recentSearches.map((query) => <button key={query} onClick={() => handleSearch(query)}><span aria-hidden="true">⌕</span>{query}</button>)}</div></section>}
    {error && <p className="dashboard-error" role="alert">{error === 'Folder already added.' ? error : 'The folder action could not be completed. Please try again.'}</p>}
    {unavailableFolder && <div className="dashboard-file-unavailable" role="alert"><div><strong>File unavailable</strong><span>This file may have been moved or deleted.</span></div><button type="button" onClick={() => { onReindexFolder?.(unavailableFolder); setUnavailableFolder('') }} disabled={indexing}>{indexing ? 'Re-indexing…' : 'Re-index folder'}</button><button type="button" aria-label="Dismiss file unavailable message" onClick={() => setUnavailableFolder('')}>×</button></div>}
  </div>
}

export default HomePage
