import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  initDatabase,
  getIndexedFolders,
  getIndexStats,
  removeIndexedFolder,
  clearAllIndex,
  closeDatabase,
} from './services/database.js'
import { indexFolder, indexFolders } from './services/fileIndexer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const SETTINGS_FILE = 'selected-folders.json'

let mainWindow = null
let indexingInProgress = false
let cancelIndexing = false

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function loadSelectedFolders() {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(data)
      return Array.isArray(parsed.folders) ? parsed.folders : []
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
      lastIndexedAt: meta?.lastIndexedAt ?? null,
      fileCount: meta?.fileCount ?? 0,
      indexStatus: meta?.status ?? 'pending',
    }
  })
}

function sendIndexProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('index:progress', payload)
  }
}

async function runIndexForFolders(folders) {
  if (!folders.length) {
    return { ok: true, results: [] }
  }

  if (indexingInProgress) {
    return { ok: false, error: 'Indexing is already in progress.' }
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
    const hasError = results.some((r) => r.status === 'error')

    const summary = {
      status: hasError && totalIndexed === 0 ? 'error' : 'ready',
      indexed: totalIndexed,
      totalFiles: stats.totalFiles,
      folders: mergeFoldersWithIndex(loadSelectedFolders()),
      message:
        totalIndexed > 0
          ? `Indexed ${totalIndexed.toLocaleString()} files. Your files are ready to search.`
          : hasError
            ? 'Indexing finished with errors.'
            : 'No supported files found.',
      results,
    }

    sendIndexProgress(summary)
    return { ok: true, ...summary }
  } catch (error) {
    const failure = {
      status: 'error',
      message: error.message || 'Indexing failed',
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
    minWidth: 900,
    minHeight: 600,
    title: 'FileFinder AI',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
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
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select a folder to index',
  })

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
    return { alreadyExists: true, folder: { name: folderName, path: folderPath } }
  }

  const folder = { name: folderName, path: folderPath }
  folders.push(folder)
  saveSelectedFolders(folders)

  // Index the newly added folder
  const indexResult = await runIndexForFolders([folder])

  return {
    alreadyExists: false,
    folder,
    folders: mergeFoldersWithIndex(folders),
    indexResult,
  }
})

ipcMain.handle('folders:remove', async (_event, folderPath) => {
  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('Invalid folder path')
  }

  const folders = loadSelectedFolders().filter(
    (f) => f.path.toLowerCase() !== folderPath.toLowerCase()
  )
  saveSelectedFolders(folders)

  try {
    removeIndexedFolder(folderPath)
  } catch (error) {
    console.error('Failed to remove folder from index:', error)
  }

  return mergeFoldersWithIndex(folders)
})

ipcMain.handle('folders:save', (_event, folders) => {
  const ok = saveSelectedFolders(folders)
  return ok ? mergeFoldersWithIndex(folders) : mergeFoldersWithIndex(loadSelectedFolders())
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
  clearAllIndex()
  return {
    ok: true,
    folders: mergeFoldersWithIndex(loadSelectedFolders()),
    totalFiles: 0,
    totalFolders: 0,
  }
})
