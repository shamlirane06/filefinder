import { useState } from 'react'
import SearchBar from '../components/SearchBar'
import FolderList from '../components/FolderList'
import './HomePage.css'

function HomePage({
  folders,
  loading,
  adding,
  error,
  onAddFolder,
  onRemoveFolder,
  onNavigate,
}) {
  const [query, setQuery] = useState('')

  function handleSearch(value) {
    const trimmed = value.trim()
    if (!trimmed) return
    onNavigate('search')
  }

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
        <p className="home-subtitle">Find your files easily, using natural language.</p>

        <div className="home-search">
          <SearchBar
            value={query}
            onChange={setQuery}
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
            </span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <FolderList
          folders={folders}
          loading={loading}
          onRemove={onRemoveFolder}
        />

        <button
          type="button"
          className="add-folder-btn"
          onClick={onAddFolder}
          disabled={adding || loading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          {adding ? 'Opening…' : 'Add Folder'}
        </button>
      </div>
    </div>
  )
}

export default HomePage
