import { useEffect, useState } from 'react'
import './SettingsPage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null

function SettingsPage({
  folders,
  indexing,
  totalFiles,
  onNavigate,
  onReindexAll,
  onClearIndex,
  formatRelativeTime,
  desktopAvailable,
}) {
  const [aiStatus, setAiStatus] = useState(null)
  const [aiProgress, setAiProgress] = useState(null)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiMessage, setAiMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const status = await api?.getAiStatus?.()
        if (!cancelled) setAiStatus(status)
      } catch {
        if (!cancelled) setAiMessage('Could not load AI analysis status.')
      }
    }
    refresh()
    const unsubscribe = api?.onAiProgress?.((progress) => {
      setAiProgress(progress)
      if (progress.complete) {
        setAiRunning(false)
        setAiMessage(progress.message || (progress.ok ? 'AI analysis complete.' : 'AI analysis could not be started.'))
        refresh()
      } else {
        setAiRunning(true)
      }
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [folders])

  async function startAiAnalysis() {
    if (!api?.analyzeFilesWithAi || aiRunning || indexing) return
    setAiRunning(true)
    setAiMessage('')
    setAiProgress({ status: 'processing', current: 0, total: aiStatus?.remaining ?? 0 })
    try {
      const result = await api.analyzeFilesWithAi()
      if (result?.complete || !result?.ok) {
        setAiRunning(false)
        setAiMessage(result.message || `${result.completed ?? 0} files analyzed; ${result.failed ?? 0} could not be analyzed.`)
        if (result.ok) setAiProgress({ ...result, current: result.total, complete: true })
        const status = await api.getAiStatus()
        setAiStatus(status)
      }
    } catch {
      setAiRunning(false)
      setAiMessage('AI analysis could not be completed. Please try again.')
    }
  }

  const progressPercent = aiProgress?.total > 0
    ? Math.min(100, Math.round((aiProgress.current / aiProgress.total) * 100))
    : 0
  return (
    <div className="page settings-page">
      <div className="page-header">
        <div className="page-eyebrow">Settings</div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Manage folders, privacy preferences, and application details.
        </p>
      </div>

      <section className="settings-section">
        <h2>Indexed folders</h2>
        <p className="settings-desc">
          FileFinder AI only indexes folders you explicitly select.
        </p>
        {folders.length === 0 ? (
          <p className="settings-empty">No folders selected yet.</p>
        ) : (
          <ul className="settings-folder-list">
            {folders.map((folder) => (
              <li key={folder.path}>
                <strong>{folder.name}</strong>
                <span>{folder.path}</span>
                <span className="settings-folder-meta">
                  {folder.lastIndexedAt
                    ? `Last indexed: ${formatRelativeTime?.(folder.lastIndexedAt) || '—'}`
                    : 'Not indexed yet'}
                  {typeof folder.fileCount === 'number'
                    ? ` · ${folder.fileCount.toLocaleString()} files`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="settings-link-btn"
          onClick={() => onNavigate('home')}
        >
          Manage folders on Home
        </button>
      </section>

      <section className="settings-section">
        <h2>Index management</h2>
        <p className="settings-desc">
          {totalFiles > 0
            ? `${totalFiles.toLocaleString()} files currently in the local index.`
            : 'No files indexed yet. Add a folder on Home to start.'}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="settings-action-btn"
            onClick={onReindexAll}
            disabled={indexing || aiRunning || folders.length === 0}
          >
            {indexing ? 'Indexing…' : 'Re-index all folders'}
          </button>
          <button
            type="button"
            className="settings-action-btn danger"
            onClick={onClearIndex}
            disabled={indexing || aiRunning || totalFiles === 0}
          >
            Clear index
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>AI Configuration</h2>
        <p className="settings-desc">
          Analyze supported JPG, JPEG, PNG, WEBP, and PDF files to make their contents searchable.
          Only files in your selected folders are considered. Images are limited to 15 MB and PDFs to 20 MB.
        </p>
        <p className="settings-ai-privacy">
          Starting analysis sends each supported file to the configured AI provider. Analysis is opt-in;
          file index and generated metadata remain local. The provider's data-handling and retention rules apply to submitted content.
          Do not analyze files you do not want to share.
        </p>
        <p className="settings-ai-status">
          {aiStatus ? `${aiStatus.supportedFiles.toLocaleString()} supported files · ${aiStatus.analyzed.toLocaleString()} analyzed · ${aiStatus.remaining.toLocaleString()} remaining` : 'Loading AI status…'}
        </p>
        {!aiStatus?.configured && (
          <p className="settings-ai-config">
            AI provider is not configured. Set FILEFINDER_AI_API_KEY in the operating system environment and restart the app.
            Optional: set FILEFINDER_AI_MODEL. The API key is never entered into or exposed to the React interface.
          </p>
        )}
        <button
          type="button"
          className="settings-action-btn"
          onClick={startAiAnalysis}
          disabled={!desktopAvailable || !aiStatus?.configured || aiRunning || indexing || !aiStatus?.supportedFiles}
        >
          {aiRunning ? 'Analyzing files…' : 'Analyze files with AI'}
        </button>
        {aiRunning && (
          <div className="settings-ai-progress" role="status" aria-live="polite">
            <span>Analyzing files… {aiProgress?.current ?? 0} / {aiProgress?.total ?? aiStatus?.remaining ?? 0}</span>
            <div className="settings-ai-progress-track">
              <div className="settings-ai-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            {aiProgress?.filename && <small>{aiProgress.filename}</small>}
          </div>
        )}
        {aiMessage && <p className="settings-ai-message" role="status">{aiMessage}</p>}
        {aiStatus?.failed > 0 && !aiRunning && (
          <p className="settings-ai-status">{aiStatus.failed.toLocaleString()} files could not be analyzed. Start analysis again to retry them.</p>
        )}
      </section>

      <section className="settings-section">
        <h2>Privacy</h2>
        <p className="settings-desc">
          FileFinder AI only indexes folders you explicitly select. Indexing and search stay on your computer.
          Content is sent to the configured AI provider only after you choose “Analyze files with AI.”
        </p>
      </section>

      <section className="settings-section">
        <h2>Application Information</h2>
        <p className="settings-desc">
          FileFinder AI v0.2.0 — Phase 2 indexing. Find, understand, and organize your files.
        </p>
      </section>
    </div>
  )
}

export default SettingsPage
