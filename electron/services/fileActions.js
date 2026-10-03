import path from 'path'
import fs from 'fs'
import { clipboard, shell } from 'electron'
import { getIndexedFile } from './fileSearch.js'

async function runOpen(targetPath, selectedFolders, openPath = shell.openPath) {
  const file = getIndexedFile(targetPath, selectedFolders)
  if (!file) return { ok: false, error: 'File is not in the selected folders index.' }
  if (!fs.existsSync(file.fullPath)) {
    return { ok: false, unavailable: true, error: 'File unavailable. This file may have been moved or deleted.' }
  }

  const error = await openPath(targetPath)
  return error
    ? { ok: false, error }
    : { ok: true }
}

export function openIndexedFile(fullPath, selectedFolders, openPath) {
  return runOpen(fullPath, selectedFolders, openPath)
}

export function openIndexedFolder(fullPath, selectedFolders, openPath = shell.openPath) {
  const file = getIndexedFile(fullPath, selectedFolders)
  if (!file) return Promise.resolve({ ok: false, error: 'File is not in the selected folders index.' })
  if (!fs.existsSync(file.fullPath)) {
    return Promise.resolve({ ok: false, unavailable: true, error: 'File unavailable. This file may have been moved or deleted.' })
  }
  return runOpen(fullPath, selectedFolders, async () => openPath(path.dirname(file.fullPath)))
}

export async function copyIndexedPath(fullPath, selectedFolders, writeText = clipboard.writeText) {
  const file = getIndexedFile(fullPath, selectedFolders)
  if (!file) return { ok: false, error: 'File is not in the selected folders index.' }
  writeText(file.fullPath)
  return { ok: true }
}
