import path from 'path'
import { clipboard, shell } from 'electron'
import { getIndexedFile } from './fileSearch.js'
import { isRegularFileInsideRoot } from './pathSecurity.js'

async function runOpen(targetPath, selectedFolders, openPath = shell.openPath) {
  const file = getIndexedFile(targetPath, selectedFolders)
  if (!file) return { ok: false, error: 'File is not in the selected folders index.' }
  if (!await isRegularFileInsideRoot(file.fullPath, file.rootFolder)) {
    return { ok: false, unavailable: true, error: 'File unavailable. This file may have been moved or deleted.' }
  }

  const error = await openPath(file.fullPath)
  return error
    ? { ok: false, error }
    : { ok: true }
}

export function openIndexedFile(fullPath, selectedFolders, openPath) {
  return runOpen(fullPath, selectedFolders, openPath)
}

export async function openIndexedFolder(fullPath, selectedFolders, openPath = shell.openPath) {
  const file = getIndexedFile(fullPath, selectedFolders)
  if (!file) return { ok: false, error: 'File is not in the selected folders index.' }
  if (!await isRegularFileInsideRoot(file.fullPath, file.rootFolder)) {
    return { ok: false, unavailable: true, error: 'File unavailable. This file may have been moved or deleted.' }
  }
  return runOpen(fullPath, selectedFolders, async () => openPath(path.dirname(file.fullPath)))
}

export async function copyIndexedPath(fullPath, selectedFolders, writeText = clipboard.writeText) {
  const file = getIndexedFile(fullPath, selectedFolders)
  if (!file) return { ok: false, error: 'File is not in the selected folders index.' }
  if (!await isRegularFileInsideRoot(file.fullPath, file.rootFolder)) return { ok: false, unavailable: true, error: 'File unavailable. This file may have been moved or deleted.' }
  writeText(file.fullPath)
  return { ok: true }
}
