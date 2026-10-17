import { useEffect, useState } from 'react'
import FolderList from '../components/FolderList'
import './SettingsPage.css'

const api = typeof window !== 'undefined' ? window.fileFinder : null

function formatCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count.toLocaleString() : '—'
}

function SettingsPage({
  theme = 'light',
  folders = [],
  loading,
  adding,
  indexing,
  indexProgress,
  totalFiles = 0,
  error,
  onAddFolder,
  onRemoveFolder,
  onReindexFolder,
  onReindexAll,
  onClearIndex,
  formatRelativeTime,
  desktopAvailable,
}) {
  const [aiStatus, setAiStatus] = useState(null)
  const [aiProgress, setAiProgress] = useState(null)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiMessageIsError, setAiMessageIsError] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => {
    try { return localStorage.getItem('filefinder-reduced-motion') === 'true' } catch { return false }
  })

  function updateReducedMotion(enabled) {
    setReducedMotion(enabled)
    document.documentElement.dataset.reducedMotion = enabled ? 'true' : 'false'
    try { localStorage.setItem('filefinder-reduced-motion', String(enabled)) } catch { /* Keep the current-session preference. */ }
  }

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const status = await api?.getAiStatus?.()
        if (!cancelled) setAiStatus(status)
      } catch {
        if (!cancelled) {
          setAiMessage('Could not load AI analysis status.')
          setAiMessageIsError(true)
        }
      }
    }
    refresh()
    const unsubscribe = api?.onAiProgress?.((progress) => {
      setAiProgress(progress)
      if (progress.complete) {
        setAiRunning(false)
        setAiMessage(progress.message || (progress.ok ? 'AI analysis complete.' : 'AI analysis could not be started.'))
        setAiMessageIsError(!progress.ok)
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
    setAiMessageIsError(false)
    setAiProgress({ status: 'processing', current: 0, total: aiStatus?.remaining ?? 0 })
    try {
      const result = await api.analyzeFilesWithAi()
      if (result?.complete || !result?.ok) {
        setAiRunning(false)
        setAiMessage(result.message || `${result.completed ?? 0} files analyzed; ${result.failed ?? 0} could not be analyzed.`)
        setAiMessageIsError(!result.ok)
        if (result.ok) setAiProgress({ ...result, current: result.total, complete: true })
        const status = await api.getAiStatus()
        setAiStatus(status)
      }
    } catch {
      setAiRunning(false)
      setAiMessage('AI analysis could not be completed. Please try again.')
      setAiMessageIsError(true)
    }
  }

  const progressPercent = aiProgress?.total > 0
    ? Math.min(100, Math.round((aiProgress.current / aiProgress.total) * 100))
    : 0
  const aiConfigured = Boolean(aiStatus?.configured)
  const indexingPercent = indexProgress?.total > 0
    ? Math.min(100, Math.round(((indexProgress.indexed ?? 0) / indexProgress.total) * 100))
    : null

  return (
    <div className="page settings-page">
      <div className="settings-content">
        <header className="settings-page-header">
          <span className="page-eyebrow">PREFERENCES</span>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your local index, appearance, and optional AI file analysis.</p>
        </header>

        {error && desktopAvailable && <p className="settings-operation-error" role="alert">{error}</p>}

        <div className="settings-grid">
          <section className="settings-section" aria-labelledby="settings-appearance-title">
            <div className="settings-section-heading">
              <div><h2 id="settings-appearance-title">Appearance</h2><p className="settings-desc">Adjust how FileFinder AI looks and moves.</p></div>
            </div>
            <div className="settings-theme-row">
              <div><strong>Color theme</strong><span>Change between light and dark using the theme control in the sidebar.</span></div>
              <span className={`settings-theme-badge is-${theme}`}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </div>
            <label className="settings-motion-row">
              <span><strong>Reduced motion</strong><small>Reduce interface animation and transitions.</small></span>
              <input type="checkbox" checked={reducedMotion} onChange={(event) => updateReducedMotion(event.target.checked)} />
            </label>
          </section>

          <section className="settings-section" aria-labelledby="settings-index-title">
            <div className="settings-section-heading">
              <div><h2 id="settings-index-title">Indexing</h2><p className="settings-desc">Refresh or clear the metadata stored in your local index.</p></div>
              <span className={`settings-status-chip${indexing ? ' is-active' : ''}`} role="status"><i aria-hidden="true" />{indexing ? 'Indexing' : `${formatCount(totalFiles)} files indexed`}</span>
            </div>
            {indexing && (
              <div className="settings-index-progress" role="status" aria-live="polite">
                <div><span>{indexProgress?.message || 'Updating selected folders…'}</span>{indexingPercent !== null && <strong>{indexingPercent}%</strong>}</div>
                <div className={`settings-progress-track${indexingPercent === null ? ' is-indeterminate' : ''}`} role="progressbar" aria-label="Folder indexing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indexingPercent ?? undefined}>
                  <span style={indexingPercent !== null ? { width: `${indexingPercent}%` } : undefined} />
                </div>
              </div>
            )}
            <div className="settings-actions">
              <button type="button" className="settings-action-btn is-primary" onClick={onReindexAll} disabled={!desktopAvailable || indexing || aiRunning || folders.length === 0}>
                {indexing ? 'Indexing…' : 'Re-index all folders'}
              </button>
              <button type="button" className="settings-action-btn danger" onClick={onClearIndex} disabled={!desktopAvailable || indexing || aiRunning || totalFiles === 0}>
                Clear index
              </button>
            </div>
          </section>

          <section className="settings-section is-wide" aria-labelledby="settings-folders-title">
            <div className="settings-section-heading">
              <div><h2 id="settings-folders-title">Indexed folders</h2><p className="settings-desc">Only folders you select are included in your local index.</p></div>
              <button type="button" className="settings-action-btn is-primary" onClick={onAddFolder} disabled={!desktopAvailable || adding || indexing || aiRunning}>
                {adding ? 'Opening…' : 'Add folder'}
              </button>
            </div>
            {loading && <p className="settings-folder-loading" role="status">Loading selected folders…</p>}
            {!loading && folders.length === 0 && (
              <div className="settings-empty-state">
                <strong>No folders selected yet</strong>
                <span>Add a folder to start building your local file index.</span>
              </div>
            )}
            {folders.length > 0 && (
              <FolderList
                folders={folders}
                loading={loading}
                indexing={indexing}
                indexProgress={indexProgress}
                indexingFolderPath={indexProgress?.folderPath}
                onRemove={onRemoveFolder}
                onReindex={onReindexFolder}
                formatRelativeTime={formatRelativeTime}
                actionsDisabled={aiRunning}
              />
            )}
            {!desktopAvailable && <p className="settings-desktop-note" role="status">Run FileFinder AI in its Electron desktop app to manage local folders.</p>}
          </section>

          <section className="settings-section is-wide" aria-labelledby="settings-ai-title">
            <div className="settings-section-heading">
              <div><h2 id="settings-ai-title">AI file analysis</h2><p className="settings-desc">Optional content analysis for supported files in your selected folders.</p></div>
              <span className={`settings-config-badge${aiStatus ? (aiConfigured ? ' is-configured' : ' is-unconfigured') : aiMessageIsError ? ' is-error' : ''}`} role="status">
                {aiStatus ? (aiConfigured ? 'Configured' : 'Not configured') : aiMessageIsError ? 'Status unavailable' : desktopAvailable ? 'Checking status' : 'Desktop required'}
              </span>
            </div>
            <p className="settings-ai-description">
              Analyze JPG, JPEG, PNG, WEBP, and PDF files to make their contents searchable. Images are limited to 15 MB and PDFs to 20 MB. Analysis starts only when you choose the action below.
            </p>
            <div className="settings-ai-privacy">
              <strong>Privacy</strong>
              <p>Starting analysis sends each supported file to your configured AI provider. The index and generated metadata remain local. The provider’s data-handling and retention rules apply to submitted content; do not analyze files you do not want to share.</p>
            </div>
            <div className="settings-ai-metrics" aria-label="AI analysis status">
              <div><span>Supported files</span><strong>{aiStatus ? formatCount(aiStatus.supportedFiles) : '—'}</strong></div>
              <div><span>Analyzed</span><strong>{aiStatus ? formatCount(aiStatus.analyzed) : '—'}</strong></div>
              <div><span>Remaining</span><strong>{aiStatus ? formatCount(aiStatus.remaining) : '—'}</strong></div>
            </div>
            {aiStatus && !aiConfigured && (
              <p className="settings-ai-config">AI provider is not configured. Set FILEFINDER_AI_API_KEY in the operating system environment and restart the app. Optionally set FILEFINDER_AI_MODEL. The API key is never entered into or exposed to the React interface.</p>
            )}
            {!desktopAvailable && <p className="settings-desktop-note" role="status">AI analysis is available in the Electron desktop app.</p>}
            <div className="settings-ai-action-row">
              <button type="button" className="settings-action-btn is-primary" onClick={startAiAnalysis} disabled={!desktopAvailable || !aiConfigured || aiRunning || indexing || !aiStatus?.supportedFiles}>
                {aiRunning ? 'Analyzing files…' : 'Analyze files with AI'}
              </button>
              {aiStatus && !aiStatus.supportedFiles && <span>No supported files are available in the selected folders.</span>}
            </div>
            {aiRunning && (
              <div className="settings-ai-progress" role="status" aria-live="polite">
                <div><span>Analyzing files… {formatCount(aiProgress?.current ?? 0)} / {formatCount(aiProgress?.total ?? aiStatus?.remaining ?? 0)}</span><strong>{progressPercent}%</strong></div>
                <div className="settings-progress-track" role="progressbar" aria-label="AI analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div>
                {aiProgress?.filename && <small title={aiProgress.filename}>{aiProgress.filename}</small>}
              </div>
            )}
            {aiMessage && <p className={`settings-ai-message${aiMessageIsError ? ' is-error' : ''}`} role={aiMessageIsError ? 'alert' : 'status'}>{aiMessage}</p>}
            {aiStatus?.failed > 0 && !aiRunning && (
              <p className="settings-ai-failed" role="status">{formatCount(aiStatus.failed)} files could not be analyzed. Start analysis again to retry them.</p>
            )}
          </section>

          <section className="settings-section" aria-labelledby="settings-privacy-title">
            <h2 id="settings-privacy-title">Privacy</h2>
            <p className="settings-desc">Folder indexing and keyword search run locally. Natural-language queries and relevant file metadata for assistant answers or organization suggestions may be sent to your configured AI provider. File contents are submitted only when you start AI file analysis.</p>
          </section>

          <section className="settings-section" aria-labelledby="settings-app-title">
            <h2 id="settings-app-title">Application information</h2>
            <p className="settings-desc">FileFinder AI desktop application · Local SQLite index · {formatCount(totalFiles)} {Number(totalFiles) === 1 ? 'file' : 'files'} indexed.</p>
            <span className="settings-version">Version 0.1.0</span>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
