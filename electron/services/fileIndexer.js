import fs from 'fs'
import path from 'path'
import {
  clearFilesForFolder,
  insertFiles,
  setFolderStatus,
  upsertIndexedFolder,
  getFileCountForFolder,
} from './database.js'

const SUPPORTED_EXTENSIONS = {
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
}

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '$recycle.bin',
  'system volume information',
  '.trash',
  '__macosx',
])

const BATCH_SIZE = 100
const PROGRESS_EVERY = 25

function toIso(dateValue) {
  if (!dateValue) return null
  try {
    return new Date(dateValue).toISOString()
  } catch {
    return null
  }
}

function isSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return Object.prototype.hasOwnProperty.call(SUPPORTED_EXTENSIONS, ext)
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_EXTENSIONS[ext] || 'Other'
}

function shouldSkipDirectory(dirName) {
  return SKIP_DIR_NAMES.has(dirName.toLowerCase())
}

/**
 * Recursively walk a directory and collect supported file metadata.
 * Never modifies filesystem entries — read-only.
 */
function walkDirectory(rootFolder, currentDir, onFile, onError) {
  let entries

  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch (error) {
    onError?.({
      type: 'directory',
      path: currentDir,
      message: error.code === 'EACCES' || error.code === 'EPERM'
        ? 'Permission denied'
        : error.message,
    })
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name)

    try {
      if (entry.isSymbolicLink()) {
        continue
      }

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue
        walkDirectory(rootFolder, fullPath, onFile, onError)
        continue
      }

      if (!entry.isFile()) continue
      if (!isSupportedFile(fullPath)) continue

      let stats
      try {
        stats = fs.statSync(fullPath)
      } catch (error) {
        onError?.({
          type: 'file',
          path: fullPath,
          message: error.code === 'ENOENT'
            ? 'File no longer exists'
            : error.code === 'EACCES' || error.code === 'EPERM'
              ? 'Permission denied'
              : error.message,
        })
        continue
      }

      if (!stats.isFile()) continue

      onFile({
        filename: entry.name,
        fullPath,
        extension: path.extname(entry.name).toLowerCase(),
        fileType: getFileType(fullPath),
        size: stats.size,
        createdAt: toIso(stats.birthtimeMs || stats.ctimeMs),
        modifiedAt: toIso(stats.mtimeMs),
        parentFolder: path.dirname(fullPath),
        rootFolder,
      })
    } catch (error) {
      onError?.({
        type: 'entry',
        path: fullPath,
        message: error.message,
      })
    }
  }
}

/**
 * Index a single user-selected folder into SQLite.
 * Replaces previous entries for this folder to avoid duplicates.
 */
export async function indexFolder(folder, { onProgress } = {}) {
  const folderPath = folder.path
  const folderName = folder.name || path.basename(folderPath)

  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('Invalid folder path')
  }

  if (!path.isAbsolute(folderPath)) {
    throw new Error('Folder path must be absolute')
  }

  if (!fs.existsSync(folderPath)) {
    upsertIndexedFolder({
      path: folderPath,
      name: folderName,
      lastIndexedAt: null,
      fileCount: 0,
      status: 'error',
    })
    throw new Error('Folder does not exist')
  }

  let stats
  try {
    stats = fs.statSync(folderPath)
  } catch (error) {
    const message =
      error.code === 'EACCES' || error.code === 'EPERM'
        ? 'Permission denied'
        : error.message
    upsertIndexedFolder({
      path: folderPath,
      name: folderName,
      lastIndexedAt: null,
      fileCount: 0,
      status: 'error',
    })
    throw new Error(message)
  }

  if (!stats.isDirectory()) {
    throw new Error('Selected path is not a folder')
  }

  upsertIndexedFolder({
    path: folderPath,
    name: folderName,
    lastIndexedAt: null,
    fileCount: 0,
    status: 'indexing',
  })

  onProgress?.({
    status: 'indexing',
    folderPath,
    folderName,
    indexed: 0,
    message: 'Indexing your files...',
  })

  // Remove previous entries for this folder, then insert fresh data
  clearFilesForFolder(folderPath)

  let indexed = 0
  let skippedErrors = 0
  let batch = []

  const flushBatch = () => {
    if (!batch.length) return
    insertFiles(batch)
    batch = []
  }

  walkDirectory(
    folderPath,
    folderPath,
    (fileMeta) => {
      batch.push(fileMeta)
      indexed += 1

      if (batch.length >= BATCH_SIZE) {
        flushBatch()
      }

      if (indexed % PROGRESS_EVERY === 0) {
        onProgress?.({
          status: 'indexing',
          folderPath,
          folderName,
          indexed,
          message: `Indexing your files... ${indexed.toLocaleString()} found`,
        })
      }
    },
    () => {
      skippedErrors += 1
    }
  )

  flushBatch()

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
    status: 'ready',
    folderPath,
    folderName,
    indexed: fileCount,
    skippedErrors,
    lastIndexedAt,
    message:
      fileCount > 0
        ? `Indexed ${fileCount.toLocaleString()} files`
        : 'No supported files found in this folder',
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
      const result = await indexFolder(folder, { onProgress })
      results.push(result)
    } catch (error) {
      const failure = {
        status: 'error',
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

export function markFolderRemoved(folderPath) {
  setFolderStatus(folderPath, 'removed')
}

export { SUPPORTED_EXTENSIONS }
