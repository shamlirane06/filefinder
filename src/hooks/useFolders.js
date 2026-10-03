import { useCallback, useEffect, useState } from 'react'

const api = typeof window !== 'undefined' ? window.fileFinder : null

function formatRelativeTime(iso) {
  if (!iso) return null

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null

  const diffMs = Date.now() - then
  const diffSec = Math.round(diffMs / 1000)

  if (diffSec < 45) return 'Just now'
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.round(diffSec / 60))
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diffSec < 86400) {
    const hours = Math.max(1, Math.round(diffSec / 3600))
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.max(1, Math.round(diffSec / 86400))
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function useFolders() {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState(null)
  const [totalFiles, setTotalFiles] = useState(0)

  const refreshStatus = useCallback(async () => {
    if (!api?.getIndexStatus) return
    try {
      const status = await api.getIndexStatus()
      if (Array.isArray(status.folders)) {
        setFolders(status.folders)
      }
      setTotalFiles(status.totalFiles ?? 0)
      setIndexing(Boolean(status.indexing))
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribe = null

    async function load() {
      if (!api) {
        setLoading(false)
        setError('Desktop APIs unavailable. Please run the Electron app.')
        return
      }

      try {
        const saved = await api.getFolders()
        if (!cancelled) {
          setFolders(Array.isArray(saved) ? saved : [])
          setError(null)
        }

        if (api.getIndexStatus) {
          const status = await api.getIndexStatus()
          if (!cancelled) {
            setTotalFiles(status.totalFiles ?? 0)
            setIndexing(Boolean(status.indexing))
            if (Array.isArray(status.folders) && status.folders.length) {
              setFolders(status.folders)
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load saved folders.')
          console.error(err)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    if (api?.onIndexProgress) {
      unsubscribe = api.onIndexProgress((progress) => {
        setIndexProgress(progress)
        setIndexing(progress.status === 'indexing')

        if (Array.isArray(progress.folders)) {
          setFolders(progress.folders)
        }

        if (typeof progress.totalFiles === 'number') {
          setTotalFiles(progress.totalFiles)
        } else if (progress.status === 'ready' && typeof progress.indexed === 'number') {
          setTotalFiles(progress.indexed)
        }

        if (progress.status === 'ready' || progress.status === 'error') {
          setIndexing(false)
          refreshStatus()
        }
      })
    }

    return () => {
      cancelled = true
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [refreshStatus])

  const addFolder = useCallback(async () => {
    if (!api || adding) return

    setAdding(true)
    setError(null)

    try {
      const result = await api.selectFolder()
      if (!result) {
        return
      }

      if (result.alreadyExists) {
        setError('That folder is already selected.')
        return
      }

      if (result.folders) {
        setFolders(result.folders)
      } else if (result.folder) {
        setFolders((prev) => [...prev, result.folder])
      }

      if (result.indexingStarted) {
        setIndexing(true)
        setIndexProgress({
          status: 'indexing',
          folderPath: result.folder?.path,
          indexed: 0,
          message: 'Indexing your files...',
        })
      }

      if (result.indexResult?.totalFiles != null) {
        setTotalFiles(result.indexResult.totalFiles)
      }
    } catch (err) {
      setError('Could not add folder. Please try again.')
      console.error(err)
    } finally {
      setAdding(false)
      await refreshStatus()
    }
  }, [adding, refreshStatus])

  const removeFolder = useCallback(async (folderPath) => {
    if (!api) return

    setError(null)

    try {
      const updated = await api.removeFolder(folderPath)
      setFolders(Array.isArray(updated) ? updated : [])
      await refreshStatus()
    } catch (err) {
      setError('Could not remove folder.')
      console.error(err)
    }
  }, [refreshStatus])

  const reindexFolder = useCallback(async (folderPath) => {
    if (!api?.reindex || indexing) return

    setError(null)
    setIndexing(true)
    setIndexProgress({
      status: 'indexing',
      folderPath,
      message: 'Indexing your files...',
      indexed: 0,
    })

    try {
      const result = await api.reindex(folderPath)
      if (!result.ok && result.error) {
        setError(result.error)
      }
      if (Array.isArray(result.folders)) {
        setFolders(result.folders)
      }
      if (typeof result.totalFiles === 'number') {
        setTotalFiles(result.totalFiles)
      }
    } catch (err) {
      setError('Could not re-index folder.')
      console.error(err)
    } finally {
      setIndexing(false)
      await refreshStatus()
    }
  }, [indexing, refreshStatus])

  const reindexAll = useCallback(async () => {
    if (!api?.reindex || indexing) return

    setError(null)
    setIndexing(true)
    setIndexProgress({
      status: 'indexing',
      message: 'Indexing your files...',
      indexed: 0,
    })

    try {
      const result = await api.reindex()
      if (Array.isArray(result.folders)) {
        setFolders(result.folders)
      }
      if (typeof result.totalFiles === 'number') {
        setTotalFiles(result.totalFiles)
      }
    } catch (err) {
      setError('Could not re-index folders.')
      console.error(err)
    } finally {
      setIndexing(false)
      await refreshStatus()
    }
  }, [indexing, refreshStatus])

  const clearIndex = useCallback(async () => {
    if (!api?.clearIndex || indexing) return

    setError(null)
    try {
      const result = await api.clearIndex()
      if (Array.isArray(result.folders)) {
        setFolders(result.folders)
      }
      setTotalFiles(0)
      setIndexProgress({
        status: 'ready',
        message: 'Index cleared.',
        indexed: 0,
      })
    } catch (err) {
      setError('Could not clear index.')
      console.error(err)
    }
  }, [indexing])

  return {
    folders,
    loading,
    adding,
    error,
    indexing,
    indexProgress,
    totalFiles,
    addFolder,
    removeFolder,
    reindexFolder,
    reindexAll,
    clearIndex,
    formatRelativeTime,
  }
}
