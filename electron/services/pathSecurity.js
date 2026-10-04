import fs from 'fs/promises'
import path from 'path'

export function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Revalidate indexed paths at use time; an indexed file may have been replaced by a symlink. */
export async function isRegularFileInsideRoot(filePath, rootPath, fileSystem = fs) {
  if (typeof filePath !== 'string' || typeof rootPath !== 'string' || !path.isAbsolute(filePath) || !path.isAbsolute(rootPath)) return false
  const resolvedRoot = path.resolve(rootPath)
  const resolvedFile = path.resolve(filePath)
  if (!isPathInside(resolvedRoot, resolvedFile) || resolvedRoot === resolvedFile) return false
  try {
    const rootStats = await fileSystem.lstat(resolvedRoot)
    const fileStats = await fileSystem.lstat(resolvedFile)
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || !fileStats.isFile() || fileStats.isSymbolicLink()) return false
    const [realRoot, realFile] = await Promise.all([fileSystem.realpath(resolvedRoot), fileSystem.realpath(resolvedFile)])
    return isPathInside(realRoot, realFile) && realRoot !== realFile
  } catch {
    return false
  }
}
