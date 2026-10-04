import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getIndexedFolder, updateIndexedFileLocation } from './database.js'
import { getIndexedFile } from './fileSearch.js'

const CATEGORY_SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,49}$/u

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function friendlyError(error) {
  if (error?.code === 'EEXIST') return 'A file with this name already exists.'
  if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return 'The source or destination is no longer available.'
  if (['EACCES', 'EPERM', 'EROFS'].includes(error?.code)) return 'Permission denied. Check access to the source and destination folders.'
  if (error?.message?.includes('selected folders') || error?.message?.includes('indexed folder')) return error.message
  return 'The file could not be moved. Your indexed file location was not changed.'
}

async function transferWithoutOverwrite(sourcePath, destinationPath, fileSystem = fs.promises) {
  const temporaryPath = path.join(path.dirname(destinationPath), `.filefinder-${randomUUID()}.tmp`)
  let destinationCreated = false
  try {
    await fileSystem.copyFile(sourcePath, temporaryPath, fs.constants.COPYFILE_EXCL)
    try {
      await fileSystem.link(temporaryPath, destinationPath)
    } catch (error) {
      if (error?.code === 'EEXIST') throw error
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error?.code)) throw error
      await fileSystem.copyFile(temporaryPath, destinationPath, fs.constants.COPYFILE_EXCL)
    }
    destinationCreated = true
    await fileSystem.unlink(temporaryPath)
    await fileSystem.unlink(sourcePath)
  } catch (error) {
    try { await fileSystem.unlink(temporaryPath) } catch { /* temporary file may not exist */ }
    if (destinationCreated) {
      try { await fileSystem.unlink(destinationPath) } catch { /* best effort cleanup of this move's destination */ }
    }
    throw error
  }
}

async function moveIndexedFileToPath({ sourcePath, destinationPath, destinationRootPath, selectedFolders, createDestination = false,
  fileSystem = fs.promises, indexedFileLookup = getIndexedFile, indexedFolderLookup = getIndexedFolder,
  updateLocation = updateIndexedFileLocation }) {
  const selected = Array.isArray(selectedFolders) ? selectedFolders : []
  const source = indexedFileLookup(sourcePath, selected)
  const selectedRoot = selected.find((item) => String(typeof item === 'string' ? item : item?.path).toLowerCase() === String(destinationRootPath).toLowerCase())
  const indexedDestinationRoot = selectedRoot && indexedFolderLookup(destinationRootPath)
  if (!source) return { ok: false, error: 'The file is no longer in the selected folders index.' }
  if (!selectedRoot || !indexedDestinationRoot) return { ok: false, error: 'Choose an indexed folder as the destination.' }

  let sourceStats
  let rootRealPath
  let sourceRealPath
  try {
    const rootStats = await fileSystem.stat(source.rootFolder)
    sourceStats = await fileSystem.lstat(source.fullPath)
    if (!rootStats.isDirectory() || !sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      return { ok: false, unavailable: true, error: 'File unavailable. The source is no longer a regular file.' }
    }
    rootRealPath = await fileSystem.realpath(source.rootFolder)
    sourceRealPath = await fileSystem.realpath(source.fullPath)
    if (!isInside(rootRealPath, sourceRealPath)) return { ok: false, error: 'The source file is outside its selected folder.' }
  } catch (error) {
    return { ok: false, unavailable: true, error: friendlyError(error) }
  }

  const destinationResolved = path.resolve(destinationPath)
  const destinationRootResolved = path.resolve(destinationRootPath)
  if (!isInside(destinationRootResolved, destinationResolved) || destinationResolved === source.fullPath) {
    return { ok: false, error: 'The destination is invalid.' }
  }

  const destinationFolder = path.dirname(destinationResolved)
  try {
    if (createDestination) await fileSystem.mkdir(destinationFolder, { recursive: true })
    const destinationRootReal = await fileSystem.realpath(destinationRootPath)
    const destinationFolderReal = await fileSystem.realpath(destinationFolder)
    const destinationStats = await fileSystem.stat(destinationFolderReal)
    if (!destinationStats.isDirectory() || !isInside(destinationRootReal, destinationFolderReal)) {
      return { ok: false, error: 'The destination is invalid or outside the selected folder.' }
    }
  } catch (error) {
    return { ok: false, error: friendlyError(error) }
  }

  try {
    await transferWithoutOverwrite(source.fullPath, destinationResolved, fileSystem)
  } catch (error) {
    return { ok: false, error: friendlyError(error) }
  }

  try {
    const movedStats = await fileSystem.stat(destinationResolved)
    const movedRecord = updateLocation({
      sourcePath: source.fullPath,
      destinationPath: destinationResolved,
      destinationRootPath,
      modifiedAt: movedStats.mtime.toISOString(),
    })
    if (!movedRecord) throw new Error('The file location could not be updated in the index.')
    return {
      ok: true,
      file: movedRecord,
      undo: { previousPath: source.fullPath, previousRootPath: source.rootFolder },
    }
  } catch {
    try {
      await transferWithoutOverwrite(destinationResolved, source.fullPath, fileSystem)
    } catch {
      return { ok: false, error: 'The index update failed and the file could not be restored. Re-index both selected folders.' }
    }
    return { ok: false, error: 'The index update failed. The file was restored to its original location.' }
  }
}

export async function moveIndexedFile({ fullPath, destinationRootPath, categoryPath, selectedFolders, fileSystem,
  indexedFileLookup, indexedFolderLookup, updateLocation }) {
  if (!Array.isArray(categoryPath) || categoryPath.length < 1 || categoryPath.length > 5 ||
      categoryPath.some((segment) => typeof segment !== 'string' || !CATEGORY_SEGMENT.test(segment.trim()) || ['.', '..'].includes(segment.trim()))) {
    return { ok: false, error: 'The suggested destination is invalid.' }
  }
  const source = (indexedFileLookup || getIndexedFile)(fullPath, selectedFolders)
  if (!source) return { ok: false, error: 'The file is no longer in the selected folders index.' }
  const destinationPath = path.join(destinationRootPath, ...categoryPath.map((segment) => segment.trim()), path.basename(source.fullPath))
  return moveIndexedFileToPath({
    sourcePath: source.fullPath,
    destinationPath,
    destinationRootPath,
    selectedFolders,
    createDestination: true,
    fileSystem,
    indexedFileLookup,
    indexedFolderLookup,
    updateLocation,
  })
}

export async function undoIndexedFileMove({ sourcePath, destinationPath, destinationRootPath, selectedFolders, fileSystem,
  indexedFileLookup, indexedFolderLookup, updateLocation }) {
  return moveIndexedFileToPath({
    sourcePath,
    destinationPath,
    destinationRootPath,
    selectedFolders,
    createDestination: false,
    fileSystem,
    indexedFileLookup,
    indexedFolderLookup,
    updateLocation,
  })
}

export { friendlyError, isInside }
