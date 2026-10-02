import { useCallback, useEffect, useState } from 'react'

const api = typeof window !== 'undefined' ? window.fileFinder : null

export function useFolders() {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

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
    return () => {
      cancelled = true
    }
  }, [])

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
    } catch (err) {
      setError('Could not add folder. Please try again.')
      console.error(err)
    } finally {
      setAdding(false)
    }
  }, [adding])

  const removeFolder = useCallback(async (folderPath) => {
    if (!api) return

    setError(null)

    try {
      const updated = await api.removeFolder(folderPath)
      setFolders(Array.isArray(updated) ? updated : [])
    } catch (err) {
      setError('Could not remove folder.')
      console.error(err)
    }
  }, [])

  return {
    folders,
    loading,
    adding,
    error,
    addFolder,
    removeFolder,
  }
}
