import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const SETTINGS_FILE = 'selected-folders.json'

let mainWindow = null

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

app.whenReady().then(() => {
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

ipcMain.handle('folders:get', () => {
  return loadSelectedFolders()
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

  return { alreadyExists: false, folder, folders }
})

ipcMain.handle('folders:remove', (_event, folderPath) => {
  const folders = loadSelectedFolders().filter(
    (f) => f.path.toLowerCase() !== folderPath.toLowerCase()
  )
  saveSelectedFolders(folders)
  return folders
})

ipcMain.handle('folders:save', (_event, folders) => {
  const ok = saveSelectedFolders(folders)
  return ok ? folders : loadSelectedFolders()
})
