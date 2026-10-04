import { useEffect, useState } from 'react'
import './HomePage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null
const PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])

function RecentFile({ file }) {
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase()) || !api?.getFilePreview) return
    let active = true
    api.getFilePreview(file.fullPath, 'thumbnail').then((result) => {
      if (active && result?.status === 'ready') setPreview(result.dataUrl)
    }).catch(() => {})
    return () => { active = false }
  }, [file.fullPath, file.extension])
  async function openFile() {
    try {
      const result = await api?.openFile?.(file.fullPath)
      setMessage(result?.ok ? 'File opened.' : result?.unavailable ? 'File unavailable. Try re-indexing the folder.' : 'File could not be opened.')
    } catch { setMessage('File could not be opened. Please try again.') }
  }
  return <article className="dashboard-recent-card">
    {preview ? <img className="dashboard-recent-preview" src={preview} alt={`Preview of ${file.filename}`} /> : <div className="dashboard-recent-preview dashboard-recent-filetype" aria-hidden="true">{file.extension?.replace('.', '').slice(0, 4).toUpperCase() || 'FILE'}</div>}
    <div className="dashboard-recent-details">
      <strong title={file.filename}>{file.filename}</strong>
      <span>{file.fileType || 'File'} · {formatSize(file.size)}</span>
      <span title={file.parentFolder}>{file.parentFolder}</span>
      <span>{formatDate(file.modifiedAt)}</span>
      {message && <span role="status">{message}</span>}
    </div>
    <button className="dashboard-open-button" type="button" onClick={openFile}>Open File</button>
  </article>
}

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
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Modified date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function HomePage({ folders, loading: foldersLoading, adding, error, desktopAvailable, indexing, onAddFolder, onNavigate, searchQuery, onSearchQueryChange, recentSearches, onRememberSearch }) {
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(Boolean(api?.getDashboardData))
  const [dashboardError, setDashboardError] = useState(false)
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
    const value = query.trim()
    if (!value) return
    onSearchQueryChange(value)
    onRememberSearch?.(value)
    onNavigate('search')
  }
  const stats = dashboard?.stats
  const statItems = [
    ['Total Files', stats?.totalFiles], ['Images', stats?.images], ['PDFs', stats?.pdfs], ['Indexed Folders', stats?.totalFolders],
  ]
  return <div className="page home-page">
    <header className="dashboard-header">
      <div><div className="page-eyebrow">Dashboard</div><h1 className="page-title">FileFinder AI</h1><p className="page-subtitle">Your files, understood.</p></div>
      <button className="dashboard-add-button" onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing}>{adding ? 'Opening…' : '+ Add Folder'}</button>
    </header>
    {dashboardError && <div className="dashboard-error" role="alert">Dashboard data could not be loaded. Please try again.</div>}
    <section className="dashboard-stat-grid" aria-label="Index summary">
      {statItems.map(([label, value]) => <article className="dashboard-stat-card" key={label}><span>{label}</span><strong>{dashboardLoading || foldersLoading ? '—' : Number(value || 0).toLocaleString()}</strong></article>)}
    </section>
    {folders.length === 0 ? <section className="dashboard-empty-state"><h2>Add a folder to start finding your files.</h2><p>FileFinder searches and understands files in folders you choose.</p><button type="button" onClick={onAddFolder} disabled={!desktopAvailable || adding}>{adding ? 'Opening…' : 'Add Folder'}</button></section>
      : stats?.totalFiles === 0 && !dashboardLoading ? <section className="dashboard-empty-state"><h2>No files have been indexed yet.</h2><p>Add a folder to start searching your files.</p><button type="button" onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing}>Add Folder</button></section> : null}
    {indexing && <p className="dashboard-loading" role="status"><span className="dashboard-spinner" /> Indexing your files…</p>}
    <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Quick Actions</h2><p>Pick up where you need to go.</p></div></div><div className="dashboard-quick-actions">
      <button onClick={() => onNavigate('search')}><span aria-hidden="true">⌕</span><strong>Search Files</strong><small>Find a file in your folders</small></button>
      <button onClick={() => onNavigate('assistant')}><span aria-hidden="true">✦</span><strong>AI Assistant</strong><small>Ask about indexed files</small></button>
      <button onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing}><span aria-hidden="true">＋</span><strong>Add Folder</strong><small>Choose a folder to index</small></button>
      <button onClick={() => onNavigate('settings')}><span aria-hidden="true">◈</span><strong>Analyze Files</strong><small>Open AI file analysis</small></button>
    </div></section>
    <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Recently Modified</h2><p>Files with the latest indexed modification dates.</p></div><button className="dashboard-text-button" onClick={() => onNavigate('search')}>Search all files →</button></div>
      {dashboardLoading ? <p className="dashboard-muted" role="status">Loading recent files…</p> : dashboard?.recentFiles?.length ? <div className="dashboard-recent-list">{dashboard.recentFiles.map((file) => <RecentFile key={file.fullPath} file={file} />)}</div> : <p className="dashboard-muted">{folders.length ? 'No recently modified files are in the index.' : 'Add and index a folder to see your files here.'}</p>}
    </section>
    {recentSearches?.length > 0 && <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Recent Searches</h2><p>Available during this app session.</p></div></div><div className="dashboard-search-list">{recentSearches.map((query) => <button key={query} onClick={() => handleSearch(query)}><span aria-hidden="true">⌕</span>{query}</button>)}</div></section>}
    {error && <p className="dashboard-error" role="alert">{error === 'Folder already added.' ? error : 'The folder action could not be completed. Please try again.'}</p>}
    <div className="dashboard-inline-search"><label htmlFor="dashboard-search">Search your files</label><form onSubmit={(event) => { event.preventDefault(); handleSearch(searchQuery) }}><input id="dashboard-search" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search by name, type, folder, or description" /><button type="submit">Search</button></form></div>
  </div>
}

export default HomePage
