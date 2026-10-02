import { useState } from 'react'
import Sidebar from './components/Sidebar'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import OrganizePage from './pages/OrganizePage'
import SettingsPage from './pages/SettingsPage'
import { useFolders } from './hooks/useFolders'
import './App.css'

const PAGES = {
  home: HomePage,
  search: SearchPage,
  organize: OrganizePage,
  settings: SettingsPage,
}

function App() {
  const [activePage, setActivePage] = useState('home')
  const {
    folders,
    loading,
    adding,
    error,
    addFolder,
    removeFolder,
  } = useFolders()

  const Page = PAGES[activePage] || HomePage

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        folderCount={folders.length}
      />
      <main className="main-area">
        <Page
          folders={folders}
          loading={loading}
          adding={adding}
          error={error}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onNavigate={setActivePage}
        />
      </main>
    </div>
  )
}

export default App
