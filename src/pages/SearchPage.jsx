import { useState } from 'react'
import SearchBar from '../components/SearchBar'

function SearchPage() {
  const [query, setQuery] = useState('')

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-eyebrow">Search</div>
        <h1 className="page-title">What are you looking for?</h1>
        <p className="page-subtitle">
          Search across your selected folders using filenames and natural language.
        </p>
      </div>

      <SearchBar value={query} onChange={setQuery} onSubmit={() => {}} />

      <div className="placeholder-card">
        <h3>Search coming in Phase 5</h3>
        <p>
          Full-text and metadata search will appear here after indexing is implemented.
          For now you can explore the layout and navigate between pages.
        </p>
        <span className="placeholder-badge">Placeholder</span>
      </div>
    </div>
  )
}

export default SearchPage
