import { useEffect, useRef } from 'react'
import { handlePreviewKeyDown } from './previewKeyboard.js'

function PreviewModal({ file, onClose, onOpenFile }) {
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
          <h2 id="file-preview-title">{file.filename}</h2>
          <button ref={closeButton} type="button" aria-label="Close preview" onClick={onClose}>×</button>
        </header>
        <img src={file.preview} alt={`Preview of ${file.filename}`} />
        <footer>
          <button ref={openButton} type="button" onClick={() => onOpenFile(file)}>Open File</button>
        </footer>
      </section>
    </div>
  )
}

export default PreviewModal
