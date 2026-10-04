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
  const words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter(Boolean)
  const terms = words.filter((word) => !QUERY_STOP_WORDS.has(word))
  return (terms.length ? terms : words).slice(0, 12)
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

function buildSearchWhere({ query, fileType, dateModified, folderPath, keywords, fileTypes, dateFrom, dateTo }, roots) {
  const clauses = [`LOWER(f.root_folder) IN (${roots.map(() => '?').join(', ')})`]
  const values = [...roots]
  const keyword = typeof query === 'string' ? query.trim() : ''

  if (keyword) {
    const intentTerms = keywords
    const terms = Array.isArray(intentTerms) && intentTerms.length
      ? intentTerms.map((term) => String(term).toLowerCase()).filter(Boolean)
      : queryTerms(keyword)
    const fields = [
      'LOWER(f.filename)', 'LOWER(COALESCE(f.extension, \'\'))',
      'LOWER(COALESCE(f.root_folder, \'\'))', 'LOWER(COALESCE(f.parent_folder, \'\'))',
      'LOWER(COALESCE(f.full_path, \'\'))', 'LOWER(COALESCE(m.document_type, \'\'))',
      'LOWER(COALESCE(m.title, \'\'))', 'LOWER(COALESCE(m.description, \'\'))',
      'LOWER(COALESCE(m.keywords, \'\'))', 'LOWER(COALESCE(m.extracted_text, \'\'))',
      'LOWER(COALESCE(m.entities, \'\'))', 'LOWER(COALESCE(m.category, \'\'))',
    ]
    for (const term of terms.slice(0, 12)) {
      const pattern = `%${escapeLike(term)}%`
      clauses.push(`(${fields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`)
      values.push(...fields.map(() => pattern))
    }
  }

  if (fileType) {
    clauses.push('LOWER(COALESCE(f.file_type, \'\')) = LOWER(?)')
    values.push(fileType)
  }

  const normalizedFileTypes = Array.isArray(fileTypes)
    ? [...new Set(fileTypes.filter((type) => typeof type === 'string' && type.trim()))]
    : []
  if (normalizedFileTypes.length) {
    clauses.push(`LOWER(COALESCE(f.file_type, '')) IN (${normalizedFileTypes.map(() => 'LOWER(?)').join(', ')})`)
    values.push(...normalizedFileTypes)
  }

  const cutoff = getDateCutoff(dateModified)
  if (cutoff) {
    clauses.push('f.modified_at >= ?')
    values.push(cutoff)
  }

  if (isIsoDate(dateFrom)) {
    clauses.push('f.modified_at >= ?')
    values.push(dateFrom)
  }
  if (isIsoDate(dateTo)) {
    clauses.push('f.modified_at < ?')
    values.push(dateTo)
  }

  if (folderPath) {
    const normalizedFolder = String(folderPath).toLowerCase()
    if (!roots.includes(normalizedFolder)) return { sql: '0 = 1', values: [] }
    clauses.push('LOWER(f.root_folder) = ?')
    values.push(normalizedFolder)
  }

  const hasFilter = Boolean(fileType || dateModified !== 'any' || folderPath || fileTypes?.length || dateFrom || dateTo)
  if (keyword && Array.isArray(keywords) && keywords.length === 0 && !hasFilter) clauses.push('0 = 1')

  return { sql: clauses.join(' AND '), values, keyword }
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
}

function getOrder(sort) {
  if (sort === 'newest') return 'f.modified_at DESC, f.filename COLLATE NOCASE ASC'
  if (sort === 'oldest') return 'f.modified_at ASC, f.filename COLLATE NOCASE ASC'
  if (sort === 'name') return 'f.filename COLLATE NOCASE ASC, f.full_path COLLATE NOCASE ASC'
  return 'exactMatch DESC, matchTier DESC, relevanceScore DESC, f.modified_at DESC, f.filename COLLATE NOCASE ASC'
}

function buildRelevanceScore(query, keywords) {
  const groups = [
    { fields: ['LOWER(f.filename)', 'LOWER(COALESCE(f.extension, \'\'))'], tier: 7, points: 70 },
    { fields: ['LOWER(COALESCE(m.title, \'\'))'], tier: 6, points: 60 },
    { fields: ['LOWER(COALESCE(m.document_type, \'\'))'], tier: 5, points: 50 },
    { fields: ['LOWER(COALESCE(m.keywords, \'\'))'], tier: 4, points: 40 },
    { fields: ['LOWER(COALESCE(m.description, \'\'))'], tier: 3, points: 30 },
    { fields: ['LOWER(COALESCE(m.extracted_text, \'\'))'], tier: 2, points: 20 },
    { fields: ['LOWER(COALESCE(f.full_path, \'\'))', 'LOWER(COALESCE(f.root_folder, \'\'))', 'LOWER(COALESCE(f.parent_folder, \'\'))'], tier: 1, points: 10 },
  ]
  const terms = [...new Set(keywords.map((term) => String(term).toLowerCase()).filter(Boolean))].slice(0, 12)
  const exactSql = query ? 'CASE WHEN LOWER(f.filename) = LOWER(?) THEN 1 ELSE 0 END' : '0'
  const tierCases = []
  const tierValues = []
  for (const group of groups) {
    const conditions = []
    for (const term of terms) {
      for (const field of group.fields) {
        conditions.push(`${field} LIKE ? ESCAPE '!'`)
        tierValues.push(`%${escapeLike(term)}%`)
      }
    }
    if (conditions.length) tierCases.push(`WHEN (${conditions.join(' OR ')}) THEN ${group.tier}`)
  }
  const tierSql = tierCases.length ? `CASE ${tierCases.join(' ')} ELSE 0 END` : '0'
  const clauses = []
  const values = []
  for (const term of terms) {
    for (const group of groups) {
      for (const field of group.fields) {
        clauses.push(`CASE WHEN ${field} LIKE ? ESCAPE '!' THEN ${group.points} ELSE 0 END`)
        values.push(`%${escapeLike(term)}%`)
      }
    }
  }
  return {
    exactSql,
    tierSql,
    sql: clauses.length ? clauses.join(' + ') : '0',
    values: [...(query ? [query.toLowerCase()] : []), ...tierValues, ...values],
    terms,
  }
}

/** Search only the selected roots, using indexed metadata and parameterized SQL. */
export function searchFiles(options = {}, selectedFolders = []) {
  const roots = uniqueSelectedPaths(selectedFolders)
  if (!roots.length) return { results: [], total: 0 }

  const normalizedOptions = {
    query: typeof options.query === 'string' ? options.query.slice(0, 500) : '',
    fileType: typeof options.fileType === 'string' ? options.fileType.trim() : '',
    dateModified: typeof options.dateModified === 'string' ? options.dateModified : 'any',
    folderPath: typeof options.folderPath === 'string' ? options.folderPath.trim() : '',
    sort: typeof options.sort === 'string' ? options.sort : 'relevance',
    keywords: Array.isArray(options.keywords) ? options.keywords : undefined,
    fileTypes: Array.isArray(options.fileTypes) ? options.fileTypes : [],
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  }
  const where = buildSearchWhere(normalizedOptions, roots)
  const hasFilter = Boolean(
    normalizedOptions.fileType ||
    getDateCutoff(normalizedOptions.dateModified) ||
    normalizedOptions.folderPath
    || normalizedOptions.fileTypes.length
    || isIsoDate(normalizedOptions.dateFrom)
    || isIsoDate(normalizedOptions.dateTo)
  )
  if (!where.keyword && !hasFilter) return { results: [], total: 0 }

  const count = readRows(
    `SELECT COUNT(*) AS total FROM files f
     LEFT JOIN ai_file_metadata m ON m.file_id = f.id AND m.status = 'completed'
     WHERE ${where.sql}`,
    where.values
  )[0]?.total ?? 0
  const scoringTerms = Array.isArray(normalizedOptions.keywords)
    ? normalizedOptions.keywords.map((term) => String(term).toLowerCase()).filter(Boolean).slice(0, 12)
    : queryTerms(where.keyword)
  const relevance = buildRelevanceScore(where.keyword, scoringTerms)
  const order = getOrder(normalizedOptions.sort)
  const scoredRows = readRows(`
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
      m.category AS aiCategory,
      (${relevance.exactSql}) AS exactMatch,
      (${relevance.tierSql}) AS matchTier,
      (${relevance.sql}) AS relevanceScore
    FROM files f
    LEFT JOIN ai_file_metadata m ON m.file_id = f.id AND m.status = 'completed'
    WHERE ${where.sql}
    ORDER BY ${order}
  `, [...relevance.values, ...where.values])
  const results = scoredRows.map((row) => {
    const metadataText = [row.documentType, row.aiTitle, row.aiDescription, row.extractedText,
      row.aiKeywords, row.aiEntities, row.aiCategory].filter(Boolean).join(' ').toLowerCase()
    const matchedAiTerm = scoringTerms.find((term) => metadataText.includes(term))
    const aiMatch = Boolean(matchedAiTerm)
    const matchExplanation = aiMatch
      ? row.documentType
        ? `Identified as ${row.documentType}.`
        : `Contains ${matchedAiTerm}-related information.`
      : ''
    const {
      aiTitle: _aiTitle,
      aiDescription: _aiDescription,
      extractedText: _extractedText,
      aiKeywords: _aiKeywords,
      aiEntities: _aiEntities,
      aiCategory: _aiCategory,
      exactMatch: _exactMatch,
      matchTier: _matchTier,
      relevanceScore: _relevanceScore,
      ...safeRow
    } = row
    return {
      ...safeRow,
      aiMatch,
      matchExplanation,
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
