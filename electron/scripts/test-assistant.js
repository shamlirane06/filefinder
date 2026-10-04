/** File-grounded assistant tests; all AI responses are mocked. */
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
import { extractLocalIntent } from '../services/queryUnderstanding.js'
import { createFileAssistantService } from '../services/fileAssistant.js'
import { createOpenAiProvider } from '../services/aiProvider.js'
import { openIndexedFile, openIndexedFolder } from '../services/fileActions.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-assistant-'))
const profile = path.join(tempRoot, 'profile')
const documentsPath = path.join(tempRoot, 'Documents')

function writeFixture(filename, contents = 'fixture') {
  const fullPath = path.join(documentsPath, filename)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, contents)
  return fullPath
}

function attachMetadata(fullPath, fileId, description) {
  setAiMetadata(fileId, {
    fingerprint: `assistant-${path.basename(fullPath)}`,
    documentType: 'certificate',
    title: path.basename(fullPath, path.extname(fullPath)),
    description,
    extractedText: `${description} Awarded by Example College.`,
    keywords: ['certificate', 'college'],
    entities: ['Example College'],
    category: 'Education',
    status: 'completed',
    processedAt: new Date().toISOString(),
    model: 'mock',
  })
}

app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profile)
    fs.mkdirSync(profile, { recursive: true })
    const internship = writeFixture('College/Internship_Certificate.pdf', '%PDF internship certificate')
    const degree = writeFixture('College/Degree_Certificate.pdf', '%PDF degree certificate')
    const graduation = writeFixture('College/Graduation_Certificate.pdf', '%PDF graduation certificate')
    writeFixture('Personal/Passport_Photo.jpg', 'image')
    const oldNotes = writeFixture('old_notes.txt', 'notes')
    const missing = writeFixture('deleted_file.pdf', '%PDF removed after index')

    await initDatabase()
    await indexFolder({ name: 'Documents', path: documentsPath })
    const db = getDatabase()
    const ids = new Map(db.exec('SELECT id, full_path FROM files')[0].values.map(([id, fullPath]) => [fullPath, id]))
    attachMetadata(internship, ids.get(internship), 'Internship completion award certificate.')
    attachMetadata(degree, ids.get(degree), 'College degree certificate.')
    attachMetadata(graduation, ids.get(graduation), 'Graduation certificate.')
    const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', [hoursAgo(24), internship])
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', [hoursAgo(72), degree])
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', [hoursAgo(24 * 20), graduation])
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', [hoursAgo(24 * 365 * 2), oldNotes])

    let aiCandidates = []
    const provider = {
      config: { configured: true },
      interpretQuery: async (query) => extractLocalIntent(query, [{ name: 'Documents', path: documentsPath }], new Date('2026-10-04T12:00:00.000Z')),
      answerFileQuestion: async ({ question, candidates }) => {
        aiCandidates = candidates
        return question.toLowerCase().includes('internship')
          ? { answer: 'I found your internship certificate.', sourceIds: [1] }
          : { answer: `I found ${candidates.length} certificate files.`, sourceIds: candidates.map((candidate) => candidate.sourceId) }
      },
    }
    const service = createFileAssistantService({ provider, now: () => new Date('2026-10-04T12:00:00.000Z') })
    const selectedFolders = [{ name: 'Documents', path: documentsPath }]

    const find = await service.answerQuestion({ question: 'Find my internship certificate', selectedFolders })
    const count = await service.answerQuestion({ question: 'How many PDFs do I have?', selectedFolders })
    const location = await service.answerQuestion({ question: 'Where is my internship certificate?', selectedFolders })
    const recent = await service.answerQuestion({ question: 'What files were modified recently?', selectedFolders })
    const newest = await service.answerQuestion({ question: 'Which certificate is the newest?', selectedFolders })
    const largest = await service.answerQuestion({ question: 'What is the largest PDF?', selectedFolders })
    const multi = await service.answerQuestion({ question: 'What certificates do I have?', selectedFolders })
    const other = await service.answerQuestion({
      question: 'What other certificates do I have?',
      selectedFolders,
      contextPaths: find.contextPaths,
    })
    const contextualNewest = await service.answerQuestion({
      question: 'Which one is the newest?',
      selectedFolders,
      contextPaths: other.contextPaths,
    })
    const noResults = await service.answerQuestion({ question: 'Find a spaceship blueprint', selectedFolders })

    const unavailableService = createFileAssistantService({
      provider: { config: { configured: false } },
    })
    const unavailable = await unavailableService.answerQuestion({ question: 'Find my internship certificate', selectedFolders })
    const malformedService = createFileAssistantService({
      provider: {
        config: { configured: true },
        interpretQuery: provider.interpretQuery,
        answerFileQuestion: async () => ({ answer: 'I found a made-up file.', sourceIds: [999] }),
      },
    })
    const malformed = await malformedService.answerQuestion({ question: 'Find my internship certificate', selectedFolders })
    const insufficientService = createFileAssistantService({
      provider: {
        config: { configured: true },
        interpretQuery: provider.interpretQuery,
        answerFileQuestion: async () => ({ answer: '', sourceIds: [] }),
      },
    })
    const insufficient = await insufficientService.answerQuestion({ question: 'Find my internship certificate', selectedFolders })

    fs.unlinkSync(missing)
    const missingResponse = await service.answerQuestion({ question: 'Find deleted file', selectedFolders })

    const opened = []
    const fileOpen = await openIndexedFile(internship, selectedFolders, async (fullPath) => { opened.push(fullPath); return '' })
    const folderOpen = await openIndexedFolder(internship, selectedFolders, async (folderPath) => { opened.push(folderPath); return '' })
    const missingOpen = await openIndexedFile(missing, selectedFolders, async () => '')
    let assistantPayload = null
    const apiProvider = createOpenAiProvider({
      config: { configured: true, apiKey: 'mock-secret', model: 'mock-model', endpoint: 'https://example.test/responses' },
      fetchImpl: async (_url, request) => {
        assistantPayload = JSON.parse(request.body)
        return { ok: true, json: async () => ({ output_text: JSON.stringify({ answer: 'The file is a certificate.', sourceIds: [1] }) }) }
      },
    })
    const apiResponse = await apiProvider.answerFileQuestion({
      question: 'What is this certificate?',
      candidates: [{ sourceId: 1, filename: 'Degree_Certificate.pdf', location: 'College', extractedText: 'Degree awarded.' }],
    })

    const checks = [
      find.files.length === 1 && find.files[0].fullPath === internship && find.answer.includes('internship certificate'),
      multi.total === 3 && multi.files.length === 3 && multi.answer.includes('3 certificate files'),
      noResults.files.length === 0 && noResults.answer.startsWith("I couldn't find a matching file"),
      location.answer.includes(path.basename(internship)) && location.answer.includes(path.join(documentsPath, 'College')),
      count.answer.includes('4 PDF files') && count.total === 4,
      recent.files.some((file) => file.fullPath === internship) && !recent.files.some((file) => file.fullPath === oldNotes),
      newest.files[0]?.fullPath === internship && newest.answer.includes('newest matching file'),
      Boolean(other.files.length) && !other.files.some((file) => file.fullPath === internship),
      contextualNewest.files[0]?.fullPath === degree,
      largest.files[0]?.fullPath === graduation,
      aiCandidates.length > 0 && !Object.hasOwn(aiCandidates[0], 'fullPath') && !Object.hasOwn(aiCandidates[0], 'rootFolder'),
      unavailable.aiUnavailable && unavailable.files[0]?.fullPath === internship && unavailable.answer.includes('AI explanations are currently unavailable'),
      malformed.aiUnavailable && malformed.files[0]?.fullPath === internship && !malformed.answer.includes('made-up'),
      !insufficient.aiUnavailable && insufficient.files.length === 0 && insufficient.answer === "I don't have enough information in your indexed files to answer that.",
      missingResponse.files.length === 0 && missingResponse.answer.startsWith("I couldn't find a matching file"),
      fileOpen.ok && folderOpen.ok && opened[0] === internship && opened[1] === path.join(documentsPath, 'College'),
      missingOpen.unavailable === true,
      apiResponse.sourceIds[0] === 1 && assistantPayload.store === false &&
        JSON.stringify(assistantPayload).includes('Degree_Certificate.pdf') &&
        !JSON.stringify(assistantPayload).includes('mock-secret') && !JSON.stringify(assistantPayload).includes('fullPath'),
    ]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, checks: checks.length, failedChecks: checks.flatMap((value, index) => value ? [] : [index + 1]) }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    closeDatabase()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
