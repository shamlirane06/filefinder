import path from 'path'

const CATEGORY_SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,49}$/u

function normalizeSegment(value) {
  if (typeof value !== 'string') return ''
  const segment = value.trim().replace(/\s+/g, ' ')
  return CATEGORY_SEGMENT.test(segment) && segment !== '.' && segment !== '..' ? segment : ''
}

function searchableText(file) {
  return [file.filename, file.extension, file.fileType, file.documentType, file.title,
    file.description, ...(Array.isArray(file.keywords) ? file.keywords : []), file.extractedText]
    .filter(Boolean).join(' ').replace(/[_-]+/g, ' ').toLocaleLowerCase()
}

export function suggestLocally(file) {
  const text = searchableText(file)
  const extension = String(file.extension || '').toLocaleLowerCase()
  if (/\b(internship|intern)\b/.test(text)) {
    return { category: 'Career', subcategory: 'Internships', reason: 'This contains internship-related information.' }
  }
  if (/\b(certificate|degree|diploma|transcript|graduation)\b/.test(text)) {
    return { category: 'Education', subcategory: 'Certificates', reason: 'This appears to be an academic certificate.' }
  }
  if (/\b(admission|enrollment|enrolment|college application)\b/.test(text)) {
    return { category: 'Education', subcategory: 'Admissions', reason: 'This appears to be an education admission document.' }
  }
  if (/\b(resume|curriculum vitae|\bcv\b)\b/.test(text)) {
    return { category: 'Career', subcategory: 'Resumes', reason: 'This appears to be a resume or CV.' }
  }
  if (/\b(passport|driver.?s license|identity card|\bid card\b)\b/.test(text)) {
    return { category: 'Personal', subcategory: 'Identity', reason: 'This appears to be a personal identity document.' }
  }
  if (/\b(invoice|receipt|tax|bank statement|bill)\b/.test(text)) {
    return { category: 'Finance', subcategory: 'Records', reason: 'This appears to be a financial record.' }
  }
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(extension) || /\b(image|photo|photograph)\b/.test(text)) {
    return { category: 'Media', subcategory: 'Photos', reason: 'This is an image file.' }
  }
  if (['.mp4', '.mov', '.mkv', '.webm'].includes(extension)) {
    return { category: 'Media', subcategory: 'Videos', reason: 'This is a video file.' }
  }
  return { category: 'Documents', subcategory: 'Other', reason: 'This file does not match a more specific local category.' }
}

function validateSuggestion(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const category = normalizeSegment(value.category)
  const subcategory = normalizeSegment(value.subcategory)
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 200) : ''
  if (!category || !subcategory || !reason) return fallback
  return { category, subcategory, reason }
}

function hasUsableAiMetadata(file) {
  return file.aiStatus === 'completed' && Boolean(
    file.documentType || file.title || file.description || file.keywords?.length
  )
}

export function createOrganizationSuggestionService({ getOrganizationData, provider }) {
  async function suggestForFiles(fullPaths, selectedFolders = []) {
    const paths = Array.isArray(fullPaths) ? [...new Set(fullPaths.filter((item) => typeof item === 'string').slice(0, 50))] : []
    const results = []
    for (const fullPath of paths) {
      const file = getOrganizationData(fullPath, selectedFolders)
      if (!file) {
        results.push({ fullPath, error: 'File is not in the selected folders index.' })
        continue
      }
      const fallback = suggestLocally(file)
      let suggestion = fallback
      let usedAi = false
      let aiUnavailable = false
      if (hasUsableAiMetadata(file) && provider?.suggestOrganization) {
        try {
          suggestion = validateSuggestion(await provider.suggestOrganization({
            filename: file.filename,
            extension: file.extension,
            fileType: file.fileType,
            currentFolder: path.basename(file.parentFolder || file.rootFolder || ''),
            documentType: file.documentType,
            title: file.title,
            description: file.description,
            keywords: Array.isArray(file.keywords) ? file.keywords.slice(0, 30) : [],
          }), fallback)
          usedAi = suggestion !== fallback
          aiUnavailable = !usedAi
        } catch {
          aiUnavailable = true
        }
      }
      results.push({
        file: {
          filename: file.filename,
          fullPath: file.fullPath,
          extension: file.extension,
          fileType: file.fileType,
          size: file.size,
          parentFolder: file.parentFolder,
          rootFolder: file.rootFolder,
        },
        ...suggestion,
        usedAi,
        aiUnavailable,
      })
    }
    return results
  }

  return { suggestForFiles }
}

export { validateSuggestion }
