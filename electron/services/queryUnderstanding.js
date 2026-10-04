const STOP_WORDS = new Set([
  'find', 'show', 'search', 'look', 'locate', 'get', 'please', 'me', 'my', 'the',
  'a', 'an', 'for', 'about', 'of', 'in', 'from', 'with', 'to', 'on', 'is', 'are',
  'document', 'documents', 'file', 'files', 'last', 'past', 'this', 'modified', 'updated',
  'what', 'which', 'where', 'how', 'many', 'do', 'does', 'did', 'i', 'we', 'have',
  'one', 'other', 'all', 'newest', 'latest', 'oldest', 'largest', 'biggest', 'smallest', 'were', 'been',
])

const TYPE_TERMS = new Map([
  ['pdf', ['PDF']], ['pdfs', ['PDF']],
  ['image', ['Image']], ['images', ['Image']], ['photo', ['Image']], ['photos', ['Image']],
  ['picture', ['Image']], ['pictures', ['Image']],
  ['video', ['Video']], ['videos', ['Video']],
  ['word', ['Word Document']], ['docx', ['Word Document']], ['doc', ['Word Document']],
  ['spreadsheet', ['Excel']], ['excel', ['Excel']], ['xlsx', ['Excel']], ['xls', ['Excel']],
  ['presentation', ['PowerPoint']], ['powerpoint', ['PowerPoint']], ['pptx', ['PowerPoint']],
  ['text', ['Text']], ['txt', ['Text']], ['csv', ['CSV']],
])

const DOCUMENT_TYPES = ['PDF', 'Word Document', 'Text', 'Markdown', 'PowerPoint', 'Excel', 'CSV', 'Rich Text']
const DATE_TERMS = new Set(['recent', 'recently', 'today', 'yesterday', 'week', 'month', 'year', 'september', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'october', 'november', 'december'])

function words(value) {
  return String(value || '').toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter(Boolean)
}

export function isNaturalLanguageQuery(query) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return false
  if (/\.[a-z0-9]{1,8}$/i.test(trimmed) || /^\.[a-z0-9]{1,8}$/i.test(trimmed)) return false
  const tokens = words(trimmed)
  return tokens.length > 1 || /\b(find|show|search|look for|locate|get)\b/i.test(trimmed)
}

function resolveFolder(value, selectedFolders) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const wanted = value.trim().toLocaleLowerCase()
  const matches = selectedFolders.filter((folder) =>
    folder?.name?.trim().toLocaleLowerCase() === wanted ||
    folder?.path?.trim().toLocaleLowerCase() === wanted
  )
  return matches.length === 1 ? matches[0].path : ''
}

function locallyDetectFolder(query, selectedFolders) {
  const text = String(query || '').toLocaleLowerCase()
  const matches = selectedFolders.filter((folder) => {
    const name = folder?.name?.trim()
    return name && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(name)}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text)
  })
  return matches.length === 1 ? matches[0].path : ''
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function localDateIntent(query, now = new Date()) {
  const lower = query.toLocaleLowerCase()
  if (/\b(today|this week|last week|past week|recently|recent)\b/.test(lower)) {
    return { dateModified: lower.includes('today') ? 'day' : 'week' }
  }
  if (/\b(this month|last month|past month)\b/.test(lower)) return { dateModified: 'month' }
  if (/\b(this year|last year|past year)\b/.test(lower)) return { dateModified: 'year' }

  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const monthIndex = months.findIndex((month) => new RegExp(`\\b${month}\\b`, 'i').test(lower))
  if (monthIndex >= 0) {
    const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/)
    const year = Number(yearMatch?.[1] || now.getFullYear())
    const from = new Date(year, monthIndex, 1)
    const to = new Date(year, monthIndex + 1, 1)
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() }
  }
  return {}
}

function normalizeFileTypes(value) {
  const input = Array.isArray(value) ? value : []
  const types = new Set()
  for (const entry of input) {
    const normalized = String(entry || '').toLowerCase().trim()
    if (normalized === 'pdf') types.add('PDF')
    else if (['image', 'images', 'photo', 'photos', 'picture', 'pictures'].includes(normalized)) types.add('Image')
    else if (['video', 'videos'].includes(normalized)) types.add('Video')
    else if (normalized === 'document' || normalized === 'documents') DOCUMENT_TYPES.forEach((type) => types.add(type))
    else {
      const existing = [...TYPE_TERMS.values()].flat().find((type) => type.toLowerCase() === normalized)
      if (existing) types.add(existing)
    }
  }
  return [...types]
}

function localIntent(query, selectedFolders, now) {
  const tokens = words(query)
  const fileTypes = new Set()
  for (const token of tokens) for (const type of TYPE_TERMS.get(token) || []) fileTypes.add(type)
  const folderPath = locallyDetectFolder(query, selectedFolders)
  const dateIntent = localDateIntent(query, now)
  const keywords = tokens.filter((token) => {
    if (STOP_WORDS.has(token) || DATE_TERMS.has(token) || /^\d{4}$/.test(token)) return false
    if (TYPE_TERMS.has(token)) return false
    if (folderPath) {
      const folder = selectedFolders.find((item) => item.path === folderPath)
      if (folder?.name && token === folder.name.toLocaleLowerCase()) return false
    }
    return true
  })
  return { keywords: [...new Set(keywords)], fileTypes: [...fileTypes], folderPath, ...dateIntent }
}

function validateAiIntent(value, query, selectedFolders, now) {
  const base = localIntent(query, selectedFolders, now)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid query intent')
  if (value.keywords != null && (!Array.isArray(value.keywords) || value.keywords.some((term) => typeof term !== 'string'))) {
    throw new Error('Invalid query keywords')
  }
  const parsedKeywords = Array.isArray(value.keywords) ? value.keywords : base.keywords
  const keywords = (parsedKeywords.length ? parsedKeywords : base.keywords)
    .map((term) => term.trim().toLocaleLowerCase().slice(0, 80))
    .filter((term) => term && !STOP_WORDS.has(term))
    .slice(0, 12)
  const parsedFileTypes = value.fileTypes == null ? [] : normalizeFileTypes(value.fileTypes)
  const fileTypes = parsedFileTypes.length ? parsedFileTypes : base.fileTypes
  let folderPath = resolveFolder(value.folder, selectedFolders) || base.folderPath
  const dateFilter = typeof value.dateFilter === 'string' ? value.dateFilter : ''
  let date = {}
  if (dateFilter === 'today') date = { dateModified: 'day' }
  else if (['last_week', 'past_week', 'recently'].includes(dateFilter)) date = { dateModified: 'week' }
  else if (['last_month', 'past_month'].includes(dateFilter)) date = { dateModified: 'month' }
  else if (['last_year', 'past_year'].includes(dateFilter)) date = { dateModified: 'year' }
  else if (dateFilter && dateFilter !== 'any') {
    const match = dateFilter.match(/^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/)
    if (match) {
      const from = new Date(Number(match[1]), Number(match[2]) - 1, 1)
      const to = new Date(Number(match[1]), Number(match[2]), 1)
      date = { dateFrom: from.toISOString(), dateTo: to.toISOString() }
    } else date = base.dateModified ? { dateModified: base.dateModified } : base.dateFrom ? { dateFrom: base.dateFrom, dateTo: base.dateTo } : {}
  } else if (!dateFilter) {
    date = base.dateModified ? { dateModified: base.dateModified } : base.dateFrom ? { dateFrom: base.dateFrom, dateTo: base.dateTo } : {}
  }
  return { keywords, fileTypes, folderPath, ...date }
}

export async function understandQuery(query, selectedFolders = [], {
  provider,
  now = new Date(),
} = {}) {
  const fallback = localIntent(query, selectedFolders, now)
  if (!isNaturalLanguageQuery(query)) {
    return { intent: { ...fallback, keywords: [String(query || '').trim()] }, naturalLanguage: false, usedAi: false, aiUnavailable: false }
  }
  if (!provider?.interpretQuery) {
    return { intent: fallback, naturalLanguage: true, usedAi: false, aiUnavailable: true }
  }
  try {
    const rawIntent = await provider.interpretQuery(query)
    return {
      intent: validateAiIntent(rawIntent, query, selectedFolders, now),
      naturalLanguage: true,
      usedAi: true,
      aiUnavailable: false,
    }
  } catch {
    return { intent: fallback, naturalLanguage: true, usedAi: false, aiUnavailable: true }
  }
}

export { localIntent as extractLocalIntent, validateAiIntent }
