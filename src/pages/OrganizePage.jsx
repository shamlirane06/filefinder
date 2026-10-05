import './OrganizePage.css'

function OrganizePage({ folders = [], onNavigate, onAddFolder, adding, indexing }) {
  return (
    <div className="page organize-page">
      <div className="page-header">
        <div className="page-eyebrow">ORGANIZATION</div>
        <h1 className="page-title">Organize your files</h1>
        <p className="page-subtitle">
          Review AI suggestions before anything is changed.
        </p>
      </div>

      <section className="organize-flow-card">
        <div className="organize-flow-icon" aria-hidden="true">✦</div>
        <div className="organize-flow-copy">
          <span className="organize-flow-eyebrow">REVIEW FIRST</span>
          <h2>{folders.length ? 'Suggestions are made from your search results' : 'Add a folder to get started'}</h2>
          <p>{folders.length
            ? 'Search for files, select one or more results, then choose Suggest organization. Review the proposed destination and confirm before a file is moved.'
            : 'Index a folder first. You can then search its files and request organization suggestions for the results you choose.'}</p>
        </div>
        {folders.length ? (
          <button type="button" className="organize-flow-primary" onClick={() => onNavigate('search')}>Go to Search <span aria-hidden="true">→</span></button>
        ) : (
          <button type="button" className="organize-flow-primary" onClick={onAddFolder} disabled={adding || indexing}>{adding ? 'Opening…' : 'Add Folder'}</button>
        )}
        <div className="organize-trust-note"><span aria-hidden="true">✓</span> Nothing moves until you review and confirm the suggestion.</div>
      </section>
    </div>
  )
}

export default OrganizePage
