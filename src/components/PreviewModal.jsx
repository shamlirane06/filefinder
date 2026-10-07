import { useEffect, useRef } from 'react'
import { handlePreviewKeyDown } from './previewKeyboard.js'

function formatSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return 'Unavailable'
  if (bytes < 1024) return `${bytes} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`
}

function formatDate(value) {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function PreviewModal({ file, onClose, onOpenFile, onOpenFolder }) {
  const closeButton = useRef(null)
  const openButton = useRef(null)
  const closeHandler = useRef(onClose)

  useEffect(() => {
    closeHandler.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    closeButton.current?.focus()
    function onKeyDown(event) {
      handlePreviewKeyDown(event, () => closeHandler.current(), closeButton.current, openButton.current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <div className="file-preview-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="file-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        <header className="file-preview-modal-header">
          <div className="file-preview-heading-copy">
            <h2 id="file-preview-title">{file.filename}</h2>
            <p title={file.parentFolder}>{file.parentFolder || 'Folder unavailable'}</p>
          </div>
          <button ref={closeButton} type="button" aria-label="Close preview" onClick={onClose}>×</button>
        </header>
        <div className="file-preview-body">
          <div className="file-preview-stage">
            <img src={file.preview} alt={`Preview of ${file.filename}`} />
          </div>
          <aside className="file-preview-details" aria-label="File details">
            <div><span>File type</span><strong>{file.fileType || file.extension?.replace('.', '').toUpperCase() || 'File'}</strong></div>
            <div><span>File size</span><strong>{formatSize(file.size)}</strong></div>
            <div><span>Location</span><strong title={file.parentFolder}>{file.parentFolder || 'Unavailable'}</strong></div>
            <div><span>Modified</span><strong>{formatDate(file.modifiedAt)}</strong></div>
            {(file.aiSummary || file.aiDescription || file.summary) && <div className="file-preview-ai-note"><span>AI summary</span><strong>{file.aiSummary || file.aiDescription || file.summary}</strong></div>}
            {file.matchExplanation && <div className="file-preview-ai-note"><span>Why this matched</span><strong>{file.matchExplanation}</strong></div>}
          </aside>
        </div>
        <footer className="file-preview-actions">
          <button type="button" onClick={() => onOpenFolder?.(file)}>Open Folder</button>
          <button ref={openButton} type="button" className="file-preview-primary" onClick={() => onOpenFile(file)}>Open File</button>
        </footer>
      </section>
    </div>
  )
}

export default PreviewModal
