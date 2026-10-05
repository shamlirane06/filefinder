import './SearchBar.css'

function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'What are you looking for?',
  disabled = false,
}) {
  function handleSubmit(event) {
    event.preventDefault()
    onSubmit?.(value)
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-wrap">
        <svg
          className="search-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="search-ai-mark" aria-hidden="true">✦</span>
        <input
          type="text"
          className="search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Search files"
        />
      </div>
      <button type="submit" className="search-button" disabled={disabled}>
        Search
      </button>
    </form>
  )
}

export default SearchBar
