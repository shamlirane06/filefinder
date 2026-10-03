import { getDatabase } from './database.js'

const DATE_RANGES = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
}

function uniqueSelectedPaths(selectedFolders) {
  if (!Array.isArray(selectedFolders)) return []
  return [...new Set(selectedFolders
    .map((folder) => typeof folder === 'string' ? folder : folder?.path)
    .filter((folderPath) => typeof folderPath === 'string' && folderPath.length)
    .map((folderPath) => folderPath.toLowerCase()))]
}

function escapeLike(value) {
  return value.replace(/[!%_]/g, (character) => `!${character}`)
}

const QUERY_STOP_WORDS = new Set(['find', 'show', 'get', 'locate', 'search', 'for', 'my', 'the', 'a', 'an', 'please', 'me', 'this', 'that'])

function queryTerms(query) {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter(Boolean)
  const terms = words.filter((word) => !QUERY_STOP_WORDS.has(word))
  return terms.length ? terms : words
}

function getDateCutoff(range) {
  const age = DATE_RANGES[range]
  return age ? new Date(Date.now() - age).toISOString() : null
}

function readRows(sql, values) {
  const statement = getDatabase().prepare(sql)
  const rows = []
  try {
    statement.bind(values)
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

function buildSearchWhere({ query, fileType, dateModified, folderPath }, roots) {
  const clauses = [`LOWER(f.root_folder) IN (${roots.map(() => '?').join(', ')})`]
  const values = [...roots]
  const keyword = typeof query === 'string' ? query.trim() : ''

  if (keyword) {
    const fields = [
      'LOWER(f.filename)', 'LOWER(COALESCE(f.extension, \'\'))',
      'LOWER(COALESCE(f.root_folder, \'\'))', 'LOWER(COALESCE(f.parent_folder, \'\'))',
      'LOWER(COALESCE(f.full_path, \'\'))', 'LOWER(COALESCE(m.document_type, \'\'))',
      'LOWER(COALESCE(m.title, \'\'))', 'LOWER(COALESCE(m.description, \'\'))',
      'LOWER(COALESCE(m.keywords, \'\'))', 'LOWER(COALESCE(m.extracted_text, \'\'))',
      'LOWER(COALESCE(m.entities, \'\'))', 'LOWER(COALESCE(m.category, \'\'))',
    ]
    for (const term of queryTerms(keyword)) {
      const pattern = `%${escapeLike(term)}%`
      clauses.push(`(${fields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`)
      values.push(...fields.map(() => pattern))
    }
  }

  if (fileType) {
    clauses.push('LOWER(COALESCE(f.file_type, \'\')) = LOWER(?)')
    values.push(fileType)
  }

  const cutoff = getDateCutoff(dateModified)
  if (cutoff) {
    clauses.push('f.modified_at >= ?')
    values.push(cutoff)
  }

  if (folderPath) {
    const normalizedFolder = String(folderPath).toLowerCase()
    if (!roots.includes(normalizedFolder)) return { sql: '0 = 1', values: [] }
    clauses.push('LOWER(f.root_folder) = ?')
    values.push(normalizedFolder)
  }

  return { sql: clauses.join(' AND '), values, keyword }
}

function getOrder(sort, keyword) {
  if (sort === 'newest') return { sql: 'f.modified_at DESC, f.filename COLLATE NOCASE ASC', values: [] }
  if (sort === 'oldest') return { sql: 'f.modified_at ASC, f.filename COLLATE NOCASE ASC', values: [] }
  if (sort === 'name') return { sql: 'f.filename COLLATE NOCASE ASC, f.full_path COLLATE NOCASE ASC', values: [] }
  if (!keyword) return { sql: 'f.filename COLLATE NOCASE ASC', values: [] }

  const extension = keyword.startsWith('.') ? keyword : `.${keyword}`
  const pattern = `%${escapeLike(keyword.toLowerCase())}%`
  return {
    sql: `CASE
      WHEN LOWER(f.filename) = LOWER(?) THEN 0
      WHEN LOWER(f.filename) LIKE LOWER(?) ESCAPE '!' THEN 1
      WHEN LOWER(COALESCE(f.extension, '')) = LOWER(?) THEN 2
      WHEN LOWER(COALESCE(f.full_path, '')) LIKE LOWER(?) ESCAPE '!' THEN 3
      ELSE 4
    END, f.modified_at DESC, f.filename COLLATE NOCASE ASC`,
    values: [keyword, pattern, extension, pattern],
  }
}

/** Search only the selected roots, using indexed metadata and parameterized SQL. */
export function searchFiles(options = {}, selectedFolders = []) {
  const roots = uniqueSelectedPaths(selectedFolders)
  if (!roots.length) return { results: [], total: 0 }

  const normalizedOptions = {
    query: typeof options.query === 'string' ? options.query : '',
    fileType: typeof options.fileType === 'string' ? options.fileType.trim() : '',
    dateModified: typeof options.dateModified === 'string' ? options.dateModified : 'any',
    folderPath: typeof options.folderPath === 'string' ? options.folderPath.trim() : '',
    sort: typeof options.sort === 'string' ? options.sort : 'relevance',
  }
  const where = buildSearchWhere(normalizedOptions, roots)
  const hasFilter = Boolean(
    normalizedOptions.fileType ||
    getDateCutoff(normalizedOptions.dateModified) ||
    normalizedOptions.folderPath
  )
  if (!where.keyword && !hasFilter) return { results: [], total: 0 }

  const count = readRows(
    `SELECT COUNT(*) AS total FROM files f
     LEFT JOIN ai_file_metadata m ON m.file_id = f.id AND m.status = 'completed'
     WHERE ${where.sql}`,
    where.values
  )[0]?.total ?? 0
  const order = getOrder(normalizedOptions.sort, where.keyword)
  const results = readRows(`
    SELECT
      f.filename,
      f.full_path AS fullPath,
      f.extension,
      f.file_type AS fileType,
      f.size,
      f.created_at AS createdAt,
      f.modified_at AS modifiedAt,
      f.parent_folder AS parentFolder,
      f.root_folder AS rootFolder,
      m.document_type AS documentType,
      m.title AS aiTitle,
      m.description AS aiDescription,
      m.extracted_text AS extractedText,
      m.keywords AS aiKeywords,
      m.entities AS aiEntities,
      m.category AS aiCategory
    FROM files f
    LEFT JOIN ai_file_metadata m ON m.file_id = f.id AND m.status = 'completed'
    WHERE ${where.sql}
    ORDER BY ${order.sql}
  `, [...where.values, ...order.values]).map((row) => {
    const metadataText = [row.documentType, row.aiTitle, row.aiDescription, row.extractedText,
      row.aiKeywords, row.aiEntities, row.aiCategory].filter(Boolean).join(' ').toLowerCase()
    const aiMatch = Boolean(where.keyword && queryTerms(where.keyword).every((term) => metadataText.includes(term)))
    return {
      ...row,
      aiMatch,
      matchExplanation: aiMatch
        ? `AI identified this as ${row.documentType || row.aiCategory || row.aiTitle || 'a matching document'}.`
        : '',
    }
  })

  return { results, total: count }
}

export function getSearchOptions(selectedFolders = []) {
  const roots = uniqueSelectedPaths(selectedFolders)
  if (!roots.length) return { fileTypes: [] }
  const fileTypes = readRows(`
    SELECT DISTINCT file_type AS fileType
    FROM files
    WHERE LOWER(root_folder) IN (${roots.map(() => '?').join(', ')})
      AND file_type IS NOT NULL AND file_type != ''
    ORDER BY file_type COLLATE NOCASE
  `, roots).map((row) => row.fileType)
  return { fileTypes }
}

export function getIndexedFile(fullPath, selectedFolders = []) {
  if (typeof fullPath !== 'string' || !fullPath.trim()) return null
  const roots = uniqueSelectedPaths(selectedFolders)
  if (!roots.length) return null
  return readRows(`
    SELECT full_path AS fullPath, parent_folder AS parentFolder, root_folder AS rootFolder
    FROM files
    WHERE LOWER(full_path) = LOWER(?)
      AND LOWER(root_folder) IN (${roots.map(() => '?').join(', ')})
    LIMIT 1
  `, [fullPath, ...roots])[0] ?? null
}
