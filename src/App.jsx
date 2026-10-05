import { useCallback, useState } from 'react'
import Sidebar from './components/Sidebar'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import AssistantPage from './pages/AssistantPage'
import OrganizePage from './pages/OrganizePage'
import SettingsPage from './pages/SettingsPage'
import { useFolders } from './hooks/useFolders'
import './App.css'

const PAGES = {
  home: HomePage,
  search: SearchPage,
  assistant: AssistantPage,
  organize: OrganizePage,
  settings: SettingsPage,
}

function WindowControls() {
  const api = typeof window !== 'undefined' ? window.fileFinder : null
  const [maximized, setMaximized] = useState(false)
  if (!api?.minimizeWindow || !api?.toggleMaximizeWindow || !api?.closeWindow) return null

  return (
    <div className="window-controls" role="group" aria-label="Window controls">
      <button type="button" aria-label="Minimize window" title="Minimize" onClick={() => { api.minimizeWindow().catch(() => {}) }}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 8.5h8" /></svg>
      </button>
      <button type="button" aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => { api.toggleMaximizeWindow().then((result) => setMaximized(Boolean(result?.maximized))).catch(() => {}) }}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.25" y="2.25" width="7.5" height="7.5" rx="0.5" /></svg>
      </button>
      <button type="button" className="window-control-close" aria-label="Close window" title="Close" onClick={() => { api.closeWindow().catch(() => {}) }}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6m0-6L3 9" /></svg>
      </button>
    </div>
  )
}

function App() {
  const [activePage, setActivePage] = useState('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState([])
  const rememberSearch = useCallback((query) => {
    const value = String(query || '').trim()
    if (!value) return
    setRecentSearches((current) => [value, ...current.filter((item) => item.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, 5))
  }, [])
  const {
    folders,
    loading,
    adding,
    error,
    desktopAvailable,
    indexing,
    indexProgress,
    totalFiles,
    addFolder,
    removeFolder,
    reindexFolder,
    reindexAll,
    clearIndex,
    formatRelativeTime,
  } = useFolders()

  const Page = PAGES[activePage] || HomePage

  return (
    <div className="app-shell">
      <WindowControls />
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        folderCount={folders.length}
        indexing={indexing}
        totalFiles={totalFiles}
      />
      <main className="main-area">
        <Page
          folders={folders}
          loading={loading}
          adding={adding}
          error={error}
          desktopAvailable={desktopAvailable}
          indexing={indexing}
          indexProgress={indexProgress}
          totalFiles={totalFiles}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onReindexFolder={reindexFolder}
          onReindexAll={reindexAll}
          onClearIndex={clearIndex}
          formatRelativeTime={formatRelativeTime}
          onNavigate={setActivePage}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          recentSearches={recentSearches}
          onRememberSearch={rememberSearch}
        />
      </main>
    </div>
  )
}

export default App
