import path from 'path'

/** Directory names that commonly contain generated or temporary files. */
export const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  'temp',
])

/** Human-readable labels for common file extensions; unknown types stay indexable. */
export const FILE_TYPES = {
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
  '.mp4': 'Video',
  '.mov': 'Video',
  '.zip': 'Archive',
  '.json': 'JSON',
  '.xml': 'XML',
  '.html': 'HTML',
  '.rtf': 'Rich Text',
}

const APPDATA_CACHE_PARTS = [
  ['appdata', 'local', 'temp'],
  ['appdata', 'local', 'cache'],
]

export function shouldIgnoreDirectory(directoryPath, selectedRoot) {
  const relativePath = path.relative(selectedRoot, directoryPath)
  if (
    !relativePath || relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)
  ) return false

  const relativeParts = relativePath.split(/[\\/]+/).map((part) => part.toLowerCase())
  if (relativeParts.some((part) => IGNORED_DIRECTORY_NAMES.has(part))) return true

  const rootParts = path.resolve(selectedRoot).split(/[\\/]+/).filter(Boolean).map((part) => part.toLowerCase())
  const parts = [...rootParts, ...relativeParts]
  return APPDATA_CACHE_PARTS.some((pattern) => {
    for (let start = 0; start <= parts.length - pattern.length; start += 1) {
      const end = start + pattern.length
      if (
        end > rootParts.length &&
        pattern.every((part, index) => parts[start + index] === part)
      ) return true
    }
    return false
  })
}
