/** Natural-language query understanding and ranked SQLite search tests; no API key/network required. */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDatabase,
  getDatabase,
  initDatabase,
  setAiMetadata,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'
import { searchFiles } from '../services/fileSearch.js'
import { understandQuery, extractLocalIntent } from '../services/queryUnderstanding.js'
import { createOpenAiProvider } from '../services/aiProvider.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-natural-'))
const profile = path.join(tempRoot, 'profile')
const folderPath = path.join(tempRoot, 'Documents')

function writeFile(relativePath, contents) {
  const fullPath = path.join(folderPath, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, contents)
  return fullPath
}

function setMetadata(fullPath, documentType, title, keywords, description, modifiedAt) {
  const db = getDatabase()
  const file = db.exec('SELECT id FROM files WHERE full_path = ?', [fullPath])[0].values[0]
  setAiMetadata(file[0], {
    fingerprint: `hash-${path.basename(fullPath)}`,
    documentType,
    title,
    keywords,
    description,
    extractedText: '',
    entities: [],
    category: '',
    status: 'completed',
    processedAt: new Date().toISOString(),
    model: 'mock',
  })
  if (modifiedAt) db.run('UPDATE files SET modified_at = ? WHERE id = ?', [modifiedAt, file[0]])
}

app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profile)
    fs.mkdirSync(profile, { recursive: true })
    const graduation = writeFile('degree_certificate.pdf', '%PDF graduation')
    const internship = writeFile('internship_letter.pdf', '%PDF internship')
    const passport = writeFile('passport_photo.jpg', 'image passport')
    const exact = writeFile('certificate.pdf', '%PDF exact')
    const oldFile = writeFile('old_notes.txt', 'notes')
    await initDatabase()
    await indexFolder({ name: 'Documents', path: folderPath })
    setMetadata(graduation, 'graduation certificate', 'Bachelor of Technology', ['graduation', 'degree', 'certificate'], 'University degree awarded at graduation.')
    setMetadata(internship, 'employment letter', 'Internship Offer Letter', ['internship', 'offer'], 'Offer for a summer internship position.')
    setMetadata(passport, 'passport photograph', 'Passport Photo', ['passport', 'identity photo'], 'Photograph intended for a passport application.')
    setMetadata(exact, 'receipt', 'Certificate Request Receipt', ['certificate'], 'Request receipt.')
    setMetadata(oldFile, 'notes', 'Old notes', ['notes'], 'Old notes.')
    const db = getDatabase()
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', ['2026-09-05T12:00:00.000Z', oldFile])
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', ['2026-10-01T12:00:00.000Z', graduation])

    let parserInput = ''
    const parser = {
      async interpretQuery(query) {
        parserInput = query
        if (query.toLowerCase().includes('internship')) {
          return { keywords: ['internship'], fileTypes: ['PDF'], dateFilter: '', folder: 'Documents' }
        }
        if (query.toLowerCase().includes('passport')) {
          return { keywords: ['passport'], fileTypes: ['Image'], dateFilter: '', folder: null }
        }
        return { keywords: ['graduation', 'certificate'], fileTypes: [], dateFilter: '', folder: null }
      },
    }
    const folders = [{ name: 'Documents', path: folderPath }]
    const intentCases = await Promise.all([
      understandQuery('Find my graduation certificate', folders, { provider: parser }),
      understandQuery('Show my internship PDFs', folders, { provider: parser }),
      understandQuery('Find photos of my passport', folders, { provider: parser }),
    ])
    const searches = intentCases.map(({ intent }, index) => searchFiles({
      query: ['Find my graduation certificate', 'Show my internship PDFs', 'Find photos of my passport'][index],
      ...intent,
    }, folders))

    const success = await understandQuery('Find my internship PDFs', folders, { provider: parser })
    const malformed = await understandQuery('Find my graduation certificate', folders, {
      provider: { interpretQuery: async () => ({ keywords: 'not-an-array', fileTypes: [] }) },
    })
    const missingKey = await understandQuery('Find my graduation certificate', folders)
    const providerFailure = await understandQuery('Find my graduation certificate', folders, {
      provider: { interpretQuery: async () => { throw new Error('network down') } },
    })
    const exactSearch = searchFiles({ query: 'certificate.pdf', keywords: ['certificate.pdf'] }, folders)
    const extensionSearch = searchFiles({ query: '.pdf', keywords: ['.pdf'] }, folders)
    const folderSearch = searchFiles({ query: 'Documents', keywords: ['Documents'], folderPath }, folders)
    const rankSearch = searchFiles({ query: 'certificate.pdf', keywords: ['certificate', 'pdf'] }, folders)
    const monthlyDate = extractLocalIntent('photos from September 2026', folders, new Date('2026-10-04T12:00:00.000Z'))
    const dateSearch = searchFiles({ query: '', dateFrom: monthlyDate.dateFrom, dateTo: monthlyDate.dateTo }, folders)
    const imageFilterSearch = searches[2]
    const apiPayloads = []
    const apiProvider = createOpenAiProvider({
      config: { configured: true, apiKey: 'mock-secret', model: 'mock', endpoint: 'https://example.test/responses' },
      fetchImpl: async (_url, request) => {
        apiPayloads.push(JSON.parse(request.body))
        return { ok: true, json: async () => ({ output_text: JSON.stringify({ keywords: ['passport'], fileTypes: ['Image'], dateFilter: '', folder: null }) }) }
      },
    })
    const apiParsed = await understandQuery('Find passport photos', folders, { provider: apiProvider })

    const checks = [
      searches[0].results.some((file) => file.fullPath === graduation) && searches[0].results[0].fullPath === graduation,
      searches[0].results[0].aiMatch && searches[0].results[0].matchExplanation === 'Identified as graduation certificate.',
      searches[1].results.some((file) => file.fullPath === internship) && searches[1].results.every((file) => file.fileType === 'PDF'),
      imageFilterSearch.results.some((file) => file.fullPath === passport) && imageFilterSearch.results.every((file) => file.fileType === 'Image'),
      exactSearch.results[0]?.fullPath === exact,
      extensionSearch.total === 3,
      folderSearch.total === 5,
      success.usedAi && success.intent.keywords.includes('internship') && success.intent.fileTypes.includes('PDF'),
      malformed.aiUnavailable && malformed.intent.keywords.includes('graduation') && malformed.intent.keywords.includes('certificate'),
      missingKey.aiUnavailable && missingKey.intent.keywords.includes('graduation'),
      providerFailure.aiUnavailable && providerFailure.intent.keywords.includes('certificate'),
      searches.every((search) => search.results.every((file) => !('extractedText' in file) && !('aiDescription' in file))),
      rankSearch.results[0]?.fullPath === exact && rankSearch.results[0].relevanceScore == null,
      monthlyDate.dateFrom === new Date(2026, 8, 1).toISOString() && monthlyDate.dateTo === new Date(2026, 9, 1).toISOString(),
      dateSearch.total === 1 && dateSearch.results[0]?.fullPath === oldFile,
      parserInput.includes('internship'),
      apiParsed.usedAi && apiPayloads.length === 1 && apiPayloads[0].store === false && !JSON.stringify(apiPayloads[0]).includes(folderPath),
    ]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, checks: checks.length, results: checks }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    closeDatabase()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
