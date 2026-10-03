import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import {
  initDatabase,
  getIndexedFolders,
  getIndexedFolder,
  getIndexStats,
  removeIndexedFolder,
  clearAllIndex,
  closeDatabase,
} from './services/database.js'
import { indexFolders } from './services/fileIndexer.js'
import { getSearchOptions, searchFiles } from './services/fileSearch.js'
import { analyzeSelectedFiles, getUnderstandingStatus } from './services/fileUnderstanding.js'
import {
  copyIndexedPath,
  openIndexedFile,
  openIndexedFolder,
} from './services/fileActions.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const SETTINGS_FILE = 'selected-folders.json'

let mainWindow = null
let indexingInProgress = false
let cancelIndexing = false
let aiAnalysisInProgress = false

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function loadSelectedFolders() {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      // Strip BOM if present (can appear from some Windows editors)
      const data = fs.readFileSync(settingsPath, 'utf-8').replace(/^\uFEFF/, '')
      const parsed = JSON.parse(data)
      if (!Array.isArray(parsed.folders)) return []

      let needsSave = false
      const folders = parsed.folders
        .filter((folder) => folder && typeof folder.path === 'string' && folder.path)
        .map((folder) => {
          const normalized = {
            id: getIndexedFolder(folder.path)?.id ||
              (typeof folder.id === 'string' && folder.id ? folder.id : randomUUID()),
            name: typeof folder.name === 'string' && folder.name
              ? folder.name
              : path.basename(folder.path),
            path: folder.path,
            dateAdded: typeof folder.dateAdded === 'string' && folder.dateAdded
              ? folder.dateAdded
              : new Date().toISOString(),
          }

          if (
            normalized.id !== folder.id ||
            normalized.name !== folder.name ||
            normalized.dateAdded !== folder.dateAdded
          ) {
            needsSave = true
          }

          return normalized
        })

      if (needsSave) saveSelectedFolders(folders)
      return folders
    }
  } catch (error) {
    console.error('Failed to load selected folders:', error)
  }
  return []
}

function saveSelectedFolders(folders) {
  try {
    const settingsPath = getSettingsPath()
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ folders }, null, 2),
      'utf-8'
    )
    return true
  } catch (error) {
    console.error('Failed to save selected folders:', error)
    return false
  }
}

function mergeFoldersWithIndex(folders) {
  const indexed = getIndexedFolders()
  const byPath = new Map(
    indexed.map((item) => [item.path.toLowerCase(), item])
  )

  return folders.map((folder) => {
    const meta = byPath.get(folder.path.toLowerCase())
    return {
      ...folder,
      id: meta?.id ?? folder.id,
      lastIndexedAt: meta?.lastIndexedAt ?? null,
      fileCount: meta?.fileCount ?? 0,
      totalSize: meta?.totalSize ?? 0,
      indexStatus: meta?.status ?? 'pending',
    }
  })
}

function sendIndexProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('index:progress', payload)
  }
}

function safeIndexingMessage(message) {
  const value = String(message || '').toLowerCase()
  if (value.includes('permission') || value.includes('eacces') || value.includes('eperm')) {
    return 'Permission denied. Check that FileFinder AI can access this folder.'
  }
  if (value.includes('does not exist') || value.includes('no longer exists') || value.includes('enoent')) {
    return 'This folder is no longer available. Remove it and select a valid folder.'
  }
  if (value.includes('not a folder') || value.includes('invalid folder')) {
    return 'Please choose a valid folder.'
  }
  if (value.includes('could not be accessed')) {
    return 'This folder could not be accessed. Check its permissions and try again.'
  }
  return 'The folder could not be indexed. Check that it is available and try again.'
}

async function runIndexForFolders(folders) {
  if (!folders.length) {
    return { ok: true, results: [] }
  }

  if (indexingInProgress || aiAnalysisInProgress) {
    return { ok: false, error: 'Wait for indexing or AI analysis to finish.' }
  }

  indexingInProgress = true
  cancelIndexing = false

  sendIndexProgress({
    status: 'indexing',
    message: 'Indexing your files...',
    indexed: 0,
  })

  try {
    const results = await indexFolders(folders, {
      onProgress: (progress) => {
        sendIndexProgress(progress)
      },
      shouldCancel: () => cancelIndexing,
    })

    const stats = getIndexStats()
    const totalIndexed = results.reduce((sum, r) => sum + (r.indexed || 0), 0)
    const skippedFiles = results.reduce((sum, result) => sum + (result.skippedErrors || 0), 0)
    const hasError = results.some(
      (r) => r.status === 'error' || r.status === 'folder-error' ||
        (r.skippedErrors > 0 && (r.indexed || 0) === 0)
    )
    const failure = results.find((result) =>
      result.status === 'folder-error' || result.status === 'error' ||
      (result.skippedErrors > 0 && (result.indexed || 0) === 0)
    )
    const skipped = results.some((result) => result.skippedErrors > 0 && (result.indexed || 0) > 0)

    const summary = {
      status: hasError && totalIndexed === 0 ? 'error' : 'ready',
      complete: true,
      indexed: totalIndexed,
      total: totalIndexed,
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      skippedFiles,
      folders: mergeFoldersWithIndex(loadSelectedFolders()),
      message:
        failure && totalIndexed === 0
          ? safeIndexingMessage(failure.message)
          : totalIndexed > 0
            ? skipped
              ? `${totalIndexed.toLocaleString()} files indexed · ${skippedFiles.toLocaleString()} skipped`
              : 'Your files are ready to search.'
            : 'No files were found in the selected folders.',
      results,
    }

    sendIndexProgress(summary)
    return { ok: true, ...summary }
  } catch (error) {
    const failure = {
      status: 'error',
      complete: true,
      message: safeIndexingMessage(error.message),
      folders: mergeFoldersWithIndex(loadSelectedFolders()),
    }
    sendIndexProgress(failure)
    return { ok: false, ...failure }
  } finally {
    indexingInProgress = false
    cancelIndexing = false
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    title: 'FileFinder AI',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Failed to load the secure Electron bridge at ${preloadPath}:`, error)
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})

ipcMain.handle('folders:get', () => {
  return mergeFoldersWithIndex(loadSelectedFolders())
})

ipcMain.handle('folders:select', async () => {
  let result
  try {
    result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select a folder to index',
    })
  } catch (error) {
    console.error('Failed to open folder picker:', error)
    throw new Error('Could not open the folder picker.')
  }

  if (result.canceled || !result.filePaths.length) {
    return null
  }

  const folderPath = result.filePaths[0]
  const folderName = path.basename(folderPath)

  const folders = loadSelectedFolders()
  const alreadyExists = folders.some(
    (f) => f.path.toLowerCase() === folderPath.toLowerCase()
  )

  if (alreadyExists) {
    return {
      alreadyExists: true,
      folder: folders.find((folder) => folder.path.toLowerCase() === folderPath.toLowerCase()),
    }
  }

  const folder = {
    id: randomUUID(),
    name: folderName,
    path: folderPath,
    dateAdded: new Date().toISOString(),
  }
  folders.push(folder)
  if (!saveSelectedFolders(folders)) {
    throw new Error('Could not save selected folders')
  }

  return {
    alreadyExists: false,
    folder,
    folders: mergeFoldersWithIndex(folders),
    indexingStarted: false,
  }
})

ipcMain.handle('folders:remove', async (_event, folderPath) => {
  if (aiAnalysisInProgress) throw new Error('Wait for AI analysis to finish before removing a folder.')
  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('Invalid folder path')
  }

  const selectedFolders = loadSelectedFolders()
  const selected = selectedFolders.some(
    (f) => f.path.toLowerCase() === folderPath.toLowerCase()
  )
  if (!selected) {
    throw new Error('Folder is not in your selected list.')
  }

  const folders = selectedFolders.filter(
    (f) => f.path.toLowerCase() !== folderPath.toLowerCase()
  )
  if (!saveSelectedFolders(folders)) {
    throw new Error('Could not save selected folders')
  }

  try {
    removeIndexedFolder(folderPath)
  } catch (error) {
    console.error('Failed to remove folder from index:', error)
  }

  return mergeFoldersWithIndex(folders)
})

ipcMain.handle('index:getStatus', () => {
  const stats = getIndexStats()
  return {
    indexing: indexingInProgress,
    ...stats,
    folders: mergeFoldersWithIndex(loadSelectedFolders()),
  }
})

ipcMain.handle('index:reindex', async (_event, folderPath) => {
  const folders = loadSelectedFolders()

  if (folderPath) {
    const folder = folders.find(
      (f) => f.path.toLowerCase() === String(folderPath).toLowerCase()
    )
    if (!folder) {
      return { ok: false, error: 'Folder is not in your selected list.' }
    }
    return runIndexForFolders([folder])
  }

  return runIndexForFolders(folders)
})

ipcMain.handle('index:clear', () => {
  if (aiAnalysisInProgress) return { ok: false, error: 'Wait for AI analysis to finish before clearing the index.' }
  clearAllIndex()
  return {
    ok: true,
    folders: mergeFoldersWithIndex(loadSelectedFolders()),
    totalFiles: 0,
    totalFolders: 0,
  }
})

ipcMain.handle('search:options', () => {
  return getSearchOptions(loadSelectedFolders())
})

ipcMain.handle('search:query', (_event, options) => {
  return searchFiles(options, loadSelectedFolders())
})

ipcMain.handle('file:open', (_event, fullPath) => {
  return openIndexedFile(fullPath, loadSelectedFolders())
})

ipcMain.handle('file:openFolder', (_event, fullPath) => {
  return openIndexedFolder(fullPath, loadSelectedFolders())
})

ipcMain.handle('file:copyPath', (_event, fullPath) => {
  return copyIndexedPath(fullPath, loadSelectedFolders())
})

ipcMain.handle('ai:getStatus', () => getUnderstandingStatus(loadSelectedFolders()))

ipcMain.handle('ai:analyze', async () => {
  if (indexingInProgress || aiAnalysisInProgress) {
    return { ok: false, message: 'Wait for the current indexing or analysis to finish.' }
  }
  const selectedFolders = loadSelectedFolders()
  const sendProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ai:progress', progress)
  }
  aiAnalysisInProgress = true
  try {
    const result = await analyzeSelectedFiles(selectedFolders, { onProgress: sendProgress })
    sendProgress({ ...result, status: result.ok ? 'complete' : 'error', complete: true })
    return result
  } catch {
    const result = { ok: false, status: 'error', complete: true, message: 'AI analysis could not be completed. Please try again.' }
    sendProgress(result)
    return result
  } finally {
    aiAnalysisInProgress = false
  }
})
