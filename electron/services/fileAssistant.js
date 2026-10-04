import fs from 'fs'
import { understandQuery } from './queryUnderstanding.js'
import { searchFiles } from './fileSearch.js'
import { getFileOrganizationData } from './database.js'

function normalizedKeywords(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean)
    .map((word) => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word))].slice(0, 12)
}

function rankMode(question) {
  const text = question.toLocaleLowerCase()
  if (/\b(largest|biggest|largest file|biggest file)\b/.test(text)) return 'largest'
  if (/\b(newest|latest|most recent|oldest)\b/.test(text)) return text.includes('oldest') ? 'oldest' : 'newest'
  return ''
}

function isCountQuestion(question) {
  return /\b(how many|how much|count)\b/i.test(question)
}

function isLocationQuestion(question) {
  return /\b(where|what folder|which folder|what location|whereabouts)\b/i.test(question)
}

function humanType(intent) {
  if (intent.fileTypes?.includes('PDF')) return 'PDF'
  if (intent.fileTypes?.includes('Image')) return 'image'
  if (intent.fileTypes?.length) return intent.fileTypes[0]
  return intent.keywords?.filter(Boolean).join(' ') || 'matching'
}

function deterministicAnswer({ question, files, total, intent, rank }) {
  if (isCountQuestion(question)) {
    const noun = humanType(intent)
    return `I found ${Number(total).toLocaleString()} ${noun}${noun === 'PDF' ? ' file' : ' file'}${total === 1 ? '' : 's'} in your indexed folders.`
  }
  if (!files.length) return "I couldn't find a matching file in your indexed folders. Try another description or add/index another folder."
  if (rank === 'newest' || rank === 'oldest') {
    const file = files[0]
    return `${rank === 'oldest' ? 'The oldest' : 'The newest'} matching file is ${file.filename}${file.modifiedAt ? `, modified ${new Date(file.modifiedAt).toLocaleString()}` : ''}.`
  }
  if (rank === 'largest') {
    const file = files[0]
    return `The largest matching file is ${file.filename} (${Number(file.size || 0).toLocaleString()} bytes).`
  }
  if (/\b(recent|recently)\b/i.test(question)) {
    return `I found ${Number(total).toLocaleString()} recently modified ${Number(total) === 1 ? 'file' : 'files'}.`
  }
  if (isLocationQuestion(question)) {
    const file = files[0]
    return `I found ${file.filename} in ${file.parentFolder}.`
  }
  if (files.length === 1) {
    const subject = intent.keywords?.join(' ').trim()
    return subject ? `I found your ${subject}: ${files[0].filename}.` : `I found ${files[0].filename}.`
  }
  return `I found ${Number(total).toLocaleString()} matching ${Number(total) === 1 ? 'file' : 'files'}.`
}

function safeAiAnswer(value, candidateFiles) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.answer !== 'string') return null
  const answer = value.answer.trim().slice(0, 700)
  if (!Array.isArray(value.sourceIds)) return null
  if (!answer && value.sourceIds.length === 0) {
    return { answer: "I don't have enough information in your indexed files to answer that.", files: [], insufficient: true }
  }
  if (!answer) return null
  const candidatesById = new Map(candidateFiles.map((file, index) => [index + 1, file]))
  const sources = [...new Set(value.sourceIds.filter((id) => Number.isInteger(id) && candidatesById.has(id)))].slice(0, 8)
  if (!sources.length) return null
  const filenamesInAnswer = answer.match(/[\w .()-]+\.(?:pdf|jpe?g|png|webp|gif|bmp|docx?|xlsx?|pptx?|txt|csv|zip|mp4|mov|mkv|webm)/gi) || []
  if (filenamesInAnswer.some((name) => !sources.some((id) => candidatesById.get(id).filename.toLocaleLowerCase() === name.trim().toLocaleLowerCase()))) return null
  return { answer, files: sources.map((id) => candidatesById.get(id)) }
}

function fileReference(file) {
  return {
    filename: file.filename,
    fullPath: file.fullPath,
    extension: file.extension,
    fileType: file.fileType,
    size: file.size,
    createdAt: file.createdAt,
    modifiedAt: file.modifiedAt,
    parentFolder: file.parentFolder,
    rootFolder: file.rootFolder,
    documentType: file.documentType,
  }
}

export function createFileAssistantService({
  provider,
  understand = understandQuery,
  search = searchFiles,
  getFileData = getFileOrganizationData,
  fileExists = fs.existsSync,
  now = () => new Date(),
} = {}) {
  async function answerQuestion({ question, selectedFolders = [], contextPaths = [] }) {
    const query = typeof question === 'string' ? question.trim().slice(0, 600) : ''
    if (!query) return { answer: 'Enter a question about your indexed files.', files: [], contextPaths: [], aiUnavailable: false }
    const roots = Array.isArray(selectedFolders) ? selectedFolders : []
    const mode = rankMode(query)
    const contextFollowUp = roots.length > 0 && Array.isArray(contextPaths) && contextPaths.length > 0 &&
      /\b(which one|which is|of those|among them|from those)\b/i.test(query) && Boolean(mode)
    let files = []
    let total = 0
    let intent = { keywords: [], fileTypes: [], dateModified: 'any' }
    let queryUnderstandingUnavailable = false

    if (contextFollowUp) {
      files = contextPaths.slice(0, 30).map((filePath) => getFileData(filePath, roots)).filter((file) => file && fileExists(file.fullPath))
      if (mode === 'newest') files.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')))
      else if (mode === 'oldest') files.sort((a, b) => String(a.modifiedAt || '').localeCompare(String(b.modifiedAt || '')))
      else files.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))
      total = files.length
    } else {
      let understanding
      try {
        understanding = await understand(query, roots, { provider, now: now() })
      } catch {
        understanding = { intent: { keywords: [], fileTypes: [], dateModified: 'any' }, aiUnavailable: true }
      }
      intent = understanding?.intent || intent
      queryUnderstandingUnavailable = Boolean(understanding?.aiUnavailable)
      const keywords = normalizedKeywords(intent.keywords)
      const searchQuery = keywords.join(' ')
      const countQuestion = isCountQuestion(query)
      const newestOrLargest = Boolean(mode)
      const matchAll = !searchQuery && !intent.fileTypes?.length && !intent.fileType &&
        (!intent.dateModified || intent.dateModified === 'any') && (countQuestion || newestOrLargest)
      let response
      try {
        response = search({
          query: searchQuery,
          keywords,
          fileType: intent.fileType,
          fileTypes: intent.fileTypes,
          folderPath: intent.folderPath,
          dateModified: intent.dateModified || 'any',
          dateFrom: intent.dateFrom,
          dateTo: intent.dateTo,
          sort: mode || (query.toLocaleLowerCase().includes('recent') ? 'newest' : 'relevance'),
          matchAll,
          limit: mode ? 30 : 1000,
        }, roots)
      } catch {
        return { answer: 'I could not search the index just now. Please try again.', files: [], contextPaths: [], aiUnavailable: queryUnderstandingUnavailable }
      }
      const allFiles = response?.results || []
      const priorPaths = new Set(/\bother\b/i.test(query) ? contextPaths : [])
      const candidates = allFiles.filter((file) => !priorPaths.has(file.fullPath))
      files = candidates.filter((file) => fileExists(file.fullPath))
      const excludedCount = priorPaths.size ? allFiles.filter((file) => priorPaths.has(file.fullPath)).length : 0
      const missingCount = candidates.length - files.length
      total = Math.max(0, (Number(response?.total) || 0) - excludedCount - missingCount)
      if (mode === 'largest') files.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))
      else if (mode === 'newest') files.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')))
      else if (mode === 'oldest') files.sort((a, b) => String(a.modifiedAt || '').localeCompare(String(b.modifiedAt || '')))
    }

    if (!files.length) {
      return {
        answer: "I couldn't find a matching file in your indexed folders. Try another description or add/index another folder.",
        files: [],
        contextPaths: [],
        aiUnavailable: queryUnderstandingUnavailable || !provider?.config?.configured,
      }
    }

    let presentedFiles
    try {
      presentedFiles = files.slice(0, isCountQuestion(query) ? 8 : 10).map((file) => {
        const metadata = getFileData(file.fullPath, roots) || {}
        return {
          ...file,
          ...metadata,
          title: metadata.title || file.aiTitle || '',
          description: metadata.description || file.aiDescription || '',
          keywords: Array.isArray(metadata.keywords) ? metadata.keywords : [],
          extractedText: metadata.extractedText || '',
        }
      })
    } catch {
      return { answer: 'I could not read the indexed file information just now. Please try again.', files: [], contextPaths: [], aiUnavailable: false }
    }
    const deterministic = isCountQuestion(query) || isLocationQuestion(query) || Boolean(mode) || query.toLocaleLowerCase().includes('recent')
    let answer = deterministicAnswer({ question: query, files: presentedFiles, total, intent, rank: mode })
    let sourceFiles = presentedFiles
    let aiUnavailable = queryUnderstandingUnavailable || !provider?.config?.configured

    if (!deterministic && provider?.config?.configured && provider?.answerFileQuestion) {
      try {
        const records = presentedFiles.slice(0, 8).map((file) => {
          const relative = file.rootFolder && file.parentFolder
            ? file.parentFolder.slice(file.rootFolder.length).replace(/^[\\/]+/, '')
            : file.parentFolder
          return {
            filename: file.filename,
            extension: file.extension,
            location: relative || pathBasename(file.rootFolder),
            fileType: file.fileType,
            size: Number(file.size),
            modifiedAt: file.modifiedAt,
            documentType: file.documentType,
            title: file.title,
            description: file.description,
            keywords: file.keywords,
            extractedText: file.extractedText,
          }
        })
        const aiResponse = await provider.answerFileQuestion({
          question: query,
          candidates: records.map((record, index) => ({ ...record, sourceId: index + 1 })),
        })
        const validAnswer = safeAiAnswer(aiResponse, presentedFiles.slice(0, 8))
        if (!validAnswer) throw new Error('Invalid assistant response')
        answer = validAnswer.insufficient
          ? "I don't have enough information in your indexed files to answer that."
          : validAnswer.answer
        sourceFiles = validAnswer.files
        aiUnavailable = false
      } catch {
        aiUnavailable = true
        answer = `${deterministicAnswer({ question: query, files: presentedFiles, total, intent, rank: mode })} AI explanations are currently unavailable.`
      }
    } else if (!deterministic && aiUnavailable) {
      answer = `${deterministicAnswer({ question: query, files: presentedFiles, total, intent, rank: mode })} AI explanations are currently unavailable.`
    }

    return {
      answer,
      files: sourceFiles.map(fileReference),
      total,
      aiUnavailable,
      contextPaths: presentedFiles.slice(0, 10).map((file) => file.fullPath),
    }
  }

  return { answerQuestion }
}

function pathBasename(value) {
  return String(value || '').split(/[\\/]/).filter(Boolean).at(-1) || ''
}

export { deterministicAnswer, normalizedKeywords, safeAiAnswer }
