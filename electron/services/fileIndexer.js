import fs from 'fs'
import path from 'path'
import {
  clearFilesForFolder,
  insertFiles,
  persistDatabase,
  upsertIndexedFolder,
  getFileCountForFolder,
  getIndexedFolder,
} from './database.js'

const KNOWN_TYPES = {
  '.pdf': 'PDF',
  '.docx': 'Word Document',
  '.doc': 'Word Document',
  '.txt': 'Text',
  '.md': 'Markdown',
  '.pptx': 'PowerPoint',
  '.ppt': 'PowerPoint',
  '.xlsx': 'Excel',
  '.xls': 'Excel',
  '.csv': 'CSV',
  '.jpg': 'Image',
  '.jpeg': 'Image',
  '.png': 'Image',
  '.gif': 'Image',
  '.webp': 'Image',
  '.json': 'JSON',
  '.xml': 'XML',
  '.html': 'HTML',
  '.rtf': 'Rich Text',
}

const BATCH_SIZE = 100
const YIELD_EVERY = 40
const PERSIST_EVERY = 500

function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function toIso(dateValue) {
  if (!dateValue) return null
  try {
    return new Date(dateValue).toISOString()
  } catch {
    return null
  }
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (KNOWN_TYPES[ext]) return KNOWN_TYPES[ext]
  if (!ext) return 'File'
  return ext.slice(1).toUpperCase()
}

function describeFsError(error) {
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'Permission denied'
  if (error.code === 'ENOENT') return 'Path no longer exists'
  if (error.code === 'EBUSY') return 'File is in use'
  if (error.code === 'ELOOP') return 'Too many symbolic links'
  return error.message || 'Inaccessible'
}

function isLinkLike(dirent, stats) {
  if (dirent?.isSymbolicLink?.()) return true
  if (stats?.isSymbolicLink?.()) return true
  return Boolean(stats && (stats.mode & 0o170000) === 0o120000)
}

/**
 * Recursively walk a directory. Read-only: never modifies filesystem entries.
 */
async function walkDirectory(currentDir, { onFile, onError, shouldCancel, visitedRef }) {
  let entries

  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch (error) {
    onError?.({
      type: 'directory',
      path: currentDir,
      message: describeFsError(error),
    })
    return
  }

  for (const entry of entries) {
    if (shouldCancel?.()) return

    const fullPath = path.join(currentDir, entry.name)

    try {
      let stats
      try {
        stats = fs.lstatSync(fullPath)
      } catch (error) {
        onError?.({
          type: 'entry',
          path: fullPath,
          message: describeFsError(error),
        })
        continue
      }

      if (isLinkLike(entry, stats)) continue

      if (stats.isDirectory()) {
        await walkDirectory(fullPath, { onFile, onError, shouldCancel, visitedRef })
        continue
      }

      if (!stats.isFile()) continue

      onFile?.({
        filename: entry.name,
        fullPath,
        extension: path.extname(entry.name).toLowerCase(),
        fileType: getFileType(fullPath),
        size: stats.size,
        createdAt: toIso(stats.birthtimeMs || stats.ctimeMs),
        modifiedAt: toIso(stats.mtimeMs),
        parentFolder: path.dirname(fullPath),
      })

      visitedRef.count += 1
      if (visitedRef.count % YIELD_EVERY === 0) {
        await yieldTick()
      }
    } catch (error) {
      onError?.({
        type: 'entry',
        path: fullPath,
        message: error.message,
      })
    }
  }
}

async function countFiles(rootFolder, shouldCancel) {
  let total = 0
  await walkDirectory(rootFolder, {
    shouldCancel,
    visitedRef: { count: 0 },
    onFile: () => {
      total += 1
    },
    onError: () => {},
  })
  return total
}

/**
 * Index a single user-selected folder into SQLite.
 * Replaces previous entries for this folder to avoid duplicates.
 */
export async function indexFolder(folder, { onProgress, shouldCancel } = {}) {
  const folderPath = folder.path
  const folderName = folder.name || path.basename(folderPath)

  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('Invalid folder path')
  }

  if (!path.isAbsolute(folderPath)) {
    throw new Error('Folder path must be absolute')
  }

  const markError = (message, { clearFiles = false, keepPrevious = false } = {}) => {
    if (clearFiles) {
      clearFilesForFolder(folderPath)
    }
    const previous = keepPrevious ? getIndexedFolder(folderPath) : null
    upsertIndexedFolder({
      path: folderPath,
      name: folderName,
      lastIndexedAt: previous?.lastIndexedAt ?? null,
      fileCount: previous?.fileCount ?? (keepPrevious ? getFileCountForFolder(folderPath) : 0),
      status: 'error',
    })
    throw new Error(message)
  }

  if (!fs.existsSync(folderPath)) {
    markError('Folder does not exist', { clearFiles: true })
  }

  let stats
  try {
    stats = fs.lstatSync(folderPath)
  } catch (error) {
    markError(describeFsError(error), { keepPrevious: true })
  }

  if (isLinkLike(null, stats) || !stats.isDirectory()) {
    markError('Selected path is not a folder')
  }

  const previous = getIndexedFolder(folderPath)

  upsertIndexedFolder({
    path: folderPath,
    name: folderName,
    lastIndexedAt: previous?.lastIndexedAt ?? null,
    fileCount: previous?.fileCount ?? 0,
    status: 'indexing',
  })

  onProgress?.({
    status: 'indexing',
    folderPath,
    folderName,
    indexed: 0,
    total: 0,
    message: 'Indexing your files...',
  })

  const total = await countFiles(folderPath, shouldCancel)

  if (shouldCancel?.()) {
    upsertIndexedFolder({
      path: folderPath,
      name: folderName,
      lastIndexedAt: previous?.lastIndexedAt ?? null,
      fileCount: getFileCountForFolder(folderPath),
      status: previous?.status === 'ready' ? 'ready' : 'pending',
    })
    return {
      status: 'cancelled',
      folderPath,
      folderName,
      indexed: 0,
      skippedErrors: 0,
      message: 'Indexing cancelled.',
    }
  }

  onProgress?.({
    status: 'indexing',
    folderPath,
    folderName,
    indexed: 0,
    total,
    message: 'Indexing your files...',
  })

  upsertIndexedFolder({
    path: folderPath,
    name: folderName,
    lastIndexedAt: previous?.lastIndexedAt ?? null,
    fileCount: 0,
    status: 'indexing',
  })
  clearFilesForFolder(folderPath)

  let indexed = 0
  let skippedErrors = 0
  let batch = []
  let sincePersist = 0

  const flushBatch = ({ persistAfter = false } = {}) => {
    if (!batch.length) return
    insertFiles(batch, { persistAfter })
    sincePersist += batch.length
    batch = []
    if (sincePersist >= PERSIST_EVERY) {
      persistDatabase()
      sincePersist = 0
    }
  }

  await walkDirectory(folderPath, {
    shouldCancel,
    visitedRef: { count: 0 },
    onFile: (fileMeta) => {
      batch.push({ ...fileMeta, rootFolder: folderPath })
      indexed += 1

      if (batch.length >= BATCH_SIZE) {
        flushBatch()
      }

      if (indexed === 1 || indexed % YIELD_EVERY === 0 || indexed === total) {
        onProgress?.({
          status: 'indexing',
          folderPath,
          folderName,
          indexed,
          total,
          skippedErrors,
          message: `${indexed.toLocaleString()} files indexed`,
        })
      }
    },
    onError: () => {
      skippedErrors += 1
    },
  })

  flushBatch()
  persistDatabase()

  const fileCount = getFileCountForFolder(folderPath)
  const lastIndexedAt = new Date().toISOString()

  upsertIndexedFolder({
    path: folderPath,
    name: folderName,
    lastIndexedAt,
    fileCount,
    status: 'ready',
  })

  const result = {
    status: 'folder-complete',
    folderPath,
    folderName,
    indexed: fileCount,
    total: fileCount,
    skippedErrors,
    lastIndexedAt,
    message:
      skippedErrors > 0
        ? `${fileCount.toLocaleString()} files indexed (${skippedErrors.toLocaleString()} skipped)`
        : `${fileCount.toLocaleString()} files indexed`,
  }

  onProgress?.(result)
  return result
}

/**
 * Index multiple folders sequentially.
 */
export async function indexFolders(folders, { onProgress, shouldCancel } = {}) {
  const results = []

  for (const folder of folders) {
    if (shouldCancel?.()) break

    try {
      const result = await indexFolder(folder, { onProgress, shouldCancel })
      results.push(result)
    } catch (error) {
      const failure = {
        status: 'folder-error',
        folderPath: folder.path,
        folderName: folder.name,
        indexed: 0,
        message: error.message || 'Indexing failed',
      }
      onProgress?.(failure)
      results.push(failure)
    }
  }

  return results
}

export { KNOWN_TYPES as SUPPORTED_EXTENSIONS }
