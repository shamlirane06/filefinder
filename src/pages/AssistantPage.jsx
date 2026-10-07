import { useEffect, useRef, useState } from 'react'
import PreviewModal from '../components/PreviewModal'
import './AssistantPage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null
const PREVIEW_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])
const EXAMPLES = [
  'Find my certificates',
  'Show recent PDFs',
  'Where is my resume?',
  'Find internship documents',
]

function formatSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value)) return 'Size unavailable'
  if (value < 1024) return `${value} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`
}

function formatDate(value) {
  if (!value) return 'Modified date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Modified date unavailable' : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function AssistantFileCard({ file, onReindexFolder, indexing }) {
  const [status, setStatus] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [thumbnail, setThumbnail] = useState('')
  const [previewingFile, setPreviewingFile] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!api?.getFilePreview || !PREVIEW_EXTENSIONS.has(file.extension?.toLowerCase())) return undefined
    let active = true
    api.getFilePreview(file.fullPath, 'thumbnail').then((result) => {
      if (!active) return
      if (result?.status === 'ready' && result.dataUrl) setThumbnail(result.dataUrl)
      if (result?.status === 'unavailable') setUnavailable(true)
    }).catch(() => {})
    return () => { active = false }
  }, [file.fullPath, file.extension])

  async function runAction(action) {
    if (!api?.[action]) {
      setStatus('Desktop file actions are unavailable.')
      return
    }
    setStatus('')
    try {
      const result = await api[action](file.fullPath)
      if (result?.unavailable) setUnavailable(true)
      setStatus(result?.ok ? (action === 'openFile' ? 'File opened.' : 'Folder opened.') : result?.error || 'The file action could not be completed.')
    } catch {
      setStatus('The file action could not be completed. Please try again.')
    }
  }

  async function openPreview() {
    if (!api?.getFilePreview || previewLoading) return
    setPreviewLoading(true)
    setStatus('')
    try {
      const result = await api.getFilePreview(file.fullPath, 'large')
      if (result?.status === 'ready' && result.dataUrl) {
        setPreviewingFile({ ...file, preview: result.dataUrl })
      } else {
        if (result?.status === 'unavailable') setUnavailable(true)
        setStatus(result?.status === 'unavailable' ? 'This file may have been moved or deleted.' : 'Preview is unavailable for this file.')
      }
    } catch {
      setStatus('Preview could not be loaded. Please try again.')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <article className="search-result-card assistant-file-card">
      <div className="search-result-heading">
        {thumbnail ? <img className="assistant-file-thumbnail" src={thumbnail} alt={`Preview of ${file.filename}`} /> : <div className="assistant-file-type" aria-hidden="true">
          {file.extension ? file.extension.replace('.', '').slice(0, 4).toUpperCase() : 'FILE'}
        </div>}
        <div className="search-file-title">
          <h3>{file.filename}</h3>
          <p>{file.fileType || 'File'} · {formatSize(file.size)} · Modified {formatDate(file.modifiedAt)}</p>
        </div>
      </div>
      <p className="search-file-location" title={file.parentFolder}>{file.parentFolder}</p>
      {file.documentType && <p className="assistant-file-document-type">{file.documentType}</p>}
      <div className="search-result-actions">
        <button type="button" onClick={openPreview} disabled={previewLoading}>{previewLoading ? 'Loading preview…' : 'Preview'}</button>
        <button type="button" onClick={() => runAction('openFile')}>Open File</button>
        <button type="button" onClick={() => runAction('openFolder')}>Open Folder</button>
      </div>
      {status && <p className="assistant-file-status" role="status">{status}</p>}
      {unavailable && (
        <button type="button" className="assistant-reindex-button" onClick={() => onReindexFolder?.(file.rootFolder)} disabled={indexing}>
          {indexing ? 'Re-indexing…' : 'Re-index folder'}
        </button>
      )}
      {previewingFile && (
        <PreviewModal
          file={previewingFile}
          onClose={() => setPreviewingFile(null)}
          onOpenFile={(selectedFile) => { setPreviewingFile(null); runAction('openFile', selectedFile) }}
          onOpenFolder={(selectedFile) => { setPreviewingFile(null); runAction('openFolder', selectedFile) }}
        />
      )}
    </article>
  )
}

function AssistantPage({ folders, onAddFolder, onReindexFolder, onReindexAll, indexing, desktopAvailable }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const conversationId = useRef('')
  const messageList = useRef(null)
  const indexedCount = folders.reduce((total, folder) => total + (Number(folder.fileCount) || 0), 0)

  useEffect(() => {
    messageList.current?.scrollTo({ top: messageList.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function submitQuestion(question = input) {
    const text = String(question || '').trim().slice(0, 600)
    if (!text || loading) return
    setMessages((current) => [...current, { role: 'user', text }])
    setInput('')
    setError('')
    setLoading(true)
    try {
      if (!api?.askAssistant) throw new Error('The desktop assistant is unavailable.')
      const response = await api.askAssistant(text, conversationId.current)
      if (response?.conversationId) conversationId.current = response.conversationId
      setMessages((current) => [...current, {
        role: 'assistant',
        text: response?.answer || 'I could not answer that from your indexed files.',
        files: Array.isArray(response?.files) ? response.files : [],
      }])
    } catch {
      setError('The assistant could not search your indexed files. Please try again.')
      setMessages((current) => [...current, {
        role: 'assistant',
        text: 'I could not search your indexed files just now. Please try again.',
        files: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page assistant-page">
      <header className="page-header">
        <div className="page-eyebrow">Assistant</div>
        <h1 className="page-title">Find files with AI</h1>
        <p className="page-subtitle">Describe a file or ask where it is in your indexed folders.</p>
      </header>

      {indexedCount === 0 && (
        <div className="assistant-index-notice" role="status">
          <strong>Add and index a folder before asking FileFinder about your files.</strong>
          {desktopAvailable && <button type="button" onClick={onAddFolder} disabled={indexing}>Add Folder</button>}
          {desktopAvailable && folders.length > 0 && <button type="button" onClick={onReindexAll} disabled={indexing}>Re-index folders</button>}
        </div>
      )}

      {!desktopAvailable && (
        <p className="search-desktop-required" role="alert">
          <strong>Desktop app required</strong>
          <span>Run FileFinder AI in the Electron desktop app to search your local index.</span>
        </p>
      )}

      <section className="assistant-chat-panel" aria-label="FileFinder assistant">
        <div className="assistant-messages" ref={messageList} aria-live="polite">
          {messages.length === 0 && (
            <div className="assistant-welcome">
              <div className="assistant-welcome-mark" aria-hidden="true">✦</div>
              <h2>Ask me to find a file.</h2>
              <p>Answers are grounded in your indexed files, with source files shown alongside the response.</p>
              <div className="assistant-examples">
                {EXAMPLES.map((example) => (
                  <button type="button" key={example} onClick={() => submitQuestion(example)} disabled={loading || !desktopAvailable}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={`${message.role}-${index}`}>
              <div className="assistant-message-label">{message.role === 'user' ? 'You' : 'FileFinder AI'}</div>
              <p className="assistant-message-text">{message.text}</p>
              {message.files?.length > 0 && (
                <div className="assistant-sources">
                  <h3>{message.files.length === 1 ? 'Source' : 'Sources'}</h3>
                  {message.files.map((file) => (
                    <AssistantFileCard
                      key={file.fullPath}
                      file={file}
                      onReindexFolder={onReindexFolder}
                      indexing={indexing}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && <p className="assistant-thinking" role="status">Searching your files…</p>}
        </div>

        {error && <p className="assistant-error" role="alert">{error}</p>}
        <form className="assistant-input-row" onSubmit={(event) => {
          event.preventDefault()
          submitQuestion()
        }}>
          <label className="visually-hidden" htmlFor="assistant-question">Ask about your files</label>
          <textarea
            id="assistant-question"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submitQuestion()
              }
            }}
            placeholder="Ask about your files..."
            rows={2}
            maxLength={600}
            disabled={loading || !desktopAvailable}
          />
          <button type="submit" disabled={loading || !input.trim() || !desktopAvailable}>
            {loading ? 'Searching…' : 'Send'}
          </button>
        </form>
        <p className="assistant-privacy-note">Answers use indexed file details. Only relevant candidate metadata may be sent to your configured AI provider.</p>
      </section>
    </div>
  )
}

export default AssistantPage
