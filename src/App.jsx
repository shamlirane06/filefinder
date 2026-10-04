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
