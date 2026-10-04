import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import {
  getAiCandidates,
  getAiMetadata,
  getAiIndexStatus,
  persistDatabase,
  setAiMetadata,
} from './database.js'
import { createOpenAiProvider, getAiProviderConfig } from './aiProvider.js'
import { extractSelectablePdfText } from './pdfTextExtractor.js'
import { isRegularFileInsideRoot } from './pathSecurity.js'

const IMAGE_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_PDF_PAGES = 20

function countVisiblePdfPages(bytes) {
  const source = bytes.toString('latin1')
  return [...source.matchAll(/\/Type\s*\/Page\b/g)].length
}

function cleanString(value, limit = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function cleanList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean))].slice(0, 50)
}

function normalizeAnalysis(value) {
  return {
    documentType: cleanString(value?.documentType, 160),
    title: cleanString(value?.title, 240),
    description: cleanString(value?.description, 600),
    extractedText: cleanString(value?.extractedText, 20000),
    keywords: cleanList(value?.keywords),
    entities: cleanList(value?.entities),
    category: cleanString(value?.category, 120),
  }
}

function userError(error) {
  const message = String(error?.message || '')
  if (message.includes('API key') || message.includes('not configured')) return message
  if (message.includes('AI provider') || message.includes('network') || message.includes('unreadable')) return message
  if (error?.code === 'ENOENT') return 'File is no longer available. Re-index its folder and try again.'
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'File cannot be read because access was denied.'
  return message.includes('exceeds the') ? message : 'This file could not be analyzed. It may be corrupted or inaccessible.'
}

export function getUnderstandingStatus(selectedFolders = [], env = process.env) {
  const config = getAiProviderConfig(env)
  return { ...getAiIndexStatus(selectedFolders), configured: config.configured, provider: config.provider, model: config.model }
}

/** Analyze only files beneath selected indexed folder roots. One file failure never aborts the queue. */
export async function analyzeSelectedFiles(selectedFolders, {
  provider = createOpenAiProvider(),
  onProgress,
  shouldCancel = () => false,
} = {}) {
  const config = provider.config || getAiProviderConfig()
  if (!config.configured) {
    return { ok: false, configured: false, message: 'AI analysis is not configured. Set FILEFINDER_AI_API_KEY in the app environment and restart.' }
  }

  const candidates = getAiCandidates(selectedFolders)
  const summary = { ok: true, total: candidates.length, completed: 0, failed: 0, skipped: 0, cancelled: false }
  const emit = (current, filename, status) => onProgress?.({
    status: 'processing',
    current,
    total: candidates.length,
    completed: summary.completed,
    failed: summary.failed,
    skipped: summary.skipped,
    filename,
    itemStatus: status,
  })

  for (let index = 0; index < candidates.length; index += 1) {
    if (shouldCancel()) {
      summary.cancelled = true
      break
    }
    const file = candidates[index]
    emit(index, file.filename, 'processing')
    let fingerprint = ''
    try {
      const ext = path.extname(file.fullPath).toLowerCase()
      const mimeType = IMAGE_TYPES.get(ext)
      const isPdf = ext === '.pdf'
      if (!mimeType && !isPdf) throw new Error('Unsupported file type.')
      const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
      if (!await isRegularFileInsideRoot(file.fullPath, file.rootFolder)) {
        throw Object.assign(new Error('File is outside its selected folder.'), { code: 'EACCES' })
      }
      const stats = await fs.stat(file.fullPath)
      if (!stats.isFile()) throw new Error('Unsupported file type.')
      if (stats.size > maxBytes) throw new Error(`File exceeds the ${isPdf ? '20 MB PDF' : '15 MB image'} analysis limit.`)
      const bytes = await fs.readFile(file.fullPath)
      if (bytes.length > maxBytes) throw new Error(`File exceeds the ${isPdf ? '20 MB PDF' : '15 MB image'} analysis limit.`)
      if (isPdf && countVisiblePdfPages(bytes) > MAX_PDF_PAGES) {
        throw new Error('PDF exceeds the 20-page analysis limit.')
      }
      fingerprint = createHash('sha256').update(bytes).digest('hex')
      const previous = getAiMetadata(file.id)
      if (previous?.status === 'completed' && previous.fingerprint === fingerprint) {
        summary.completed += 1
        summary.skipped += 1
        emit(index + 1, file.filename, 'skipped')
        continue
      }

      setAiMetadata(file.id, { fingerprint, status: 'processing', model: config.model })
      const input = { filename: file.fullPath, bytes, mimeType }
      const raw = isPdf
        ? await provider.analyzeDocument({ ...input, extractedText: extractSelectablePdfText(bytes) })
        : await provider.analyzeImage(input)
      const analysis = normalizeAnalysis(raw)
      setAiMetadata(file.id, {
        ...analysis,
        fingerprint,
        status: 'completed',
        processedAt: new Date().toISOString(),
        model: config.model,
        processingError: null,
      })
      summary.completed += 1
    } catch (error) {
      const previous = getAiMetadata(file.id)
      setAiMetadata(file.id, {
        fingerprint: fingerprint || previous?.fingerprint || 'unavailable',
        status: 'failed',
        model: config.model,
        processedAt: new Date().toISOString(),
        processingError: userError(error),
      })
      summary.failed += 1
    }
    persistDatabase()
    emit(index + 1, file.filename, summary.failed && !summary.completed ? 'failed' : 'completed')
  }
  persistDatabase()
  return {
    ...summary,
    status: summary.cancelled ? 'cancelled' : 'complete',
    ...getAiIndexStatus(selectedFolders),
  }
}
