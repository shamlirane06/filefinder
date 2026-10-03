/** Phase 4 pipeline tests with a mocked provider; no network/API key needed. */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDatabase,
  getAiCandidates,
  getAiMetadata,
  getDatabase,
  initDatabase,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'
import { getIndexedFile, searchFiles } from '../services/fileSearch.js'
import { analyzeSelectedFiles, getUnderstandingStatus } from '../services/fileUnderstanding.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-ai-'))
const profilePath = path.join(tempRoot, 'profile')
const selectedPath = path.join(tempRoot, 'selected')
const unselectedPath = path.join(tempRoot, 'unselected')
const imagePath = path.join(selectedPath, 'IMG_2847.jpg')
const pdfPath = path.join(selectedPath, 'scan001.pdf')
const brokenPath = path.join(selectedPath, 'broken.png')
const legacyPath = path.join(selectedPath, 'certificate_final.pdf')

function writeFile(fullPath, contents) {
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, contents)
}

app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profilePath)
    fs.mkdirSync(profilePath, { recursive: true })
    writeFile(imagePath, 'image-content-v1')
    writeFile(pdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT (Academic Transcript) Tj ET\nendstream\n/Type /Page\ntext')
    writeFile(brokenPath, 'broken')
    writeFile(legacyPath, '%PDF-1.4\n/Type /Page\nlegacy')
    writeFile(path.join(selectedPath, 'notes.docx'), 'unsupported')
    writeFile(path.join(unselectedPath, 'private.jpg'), 'must-not-send')

    await initDatabase()
    await indexFolder({ name: 'selected', path: selectedPath })
    await indexFolder({ name: 'unselected', path: unselectedPath })

    const calls = []
    let pdfTextExtractedLocally = false
    let sawProcessingState = false
    const mockProvider = {
      config: { configured: true, model: 'mock-vision-model' },
      async analyzeImage({ filename }) {
        calls.push(filename)
        const file = getAiCandidates([selectedPath]).find((candidate) => candidate.fullPath === filename)
        if (file && getAiMetadata(file.id)?.status === 'processing') sawProcessingState = true
        if (filename === brokenPath) throw new Error('mock model failure')
        return {
          documentType: 'graduation certificate',
          title: 'Bachelor of Technology',
          keywords: ['university', 'graduation', 'certificate'],
          description: 'University graduation certificate for a technology degree.',
          extractedText: 'Example University Bachelor of Technology',
          entities: ['Example University'],
          category: 'education',
        }
      },
      async analyzeDocument({ filename, extractedText }) {
        calls.push(filename)
        if (filename === pdfPath && extractedText?.includes('Academic Transcript')) pdfTextExtractedLocally = true
        return filename === pdfPath
          ? { documentType: 'course transcript', title: 'Academic Record', keywords: ['university'], description: 'University course record.' }
          : { documentType: 'certificate', title: 'Certificate', keywords: ['certificate'], description: 'Certificate document.' }
      },
    }

    const status = getUnderstandingStatus([selectedPath], {})
    const configMissing = !status.configured
    const missingConfig = await analyzeSelectedFiles([selectedPath], { provider: { config: { configured: false, model: 'mock' } } })
    const progress = []
    const first = await analyzeSelectedFiles([selectedPath], { provider: mockProvider, onProgress: (value) => progress.push(value) })
    const db = getDatabase()
    const imageId = db.exec('SELECT id FROM files WHERE full_path = ?', [imagePath])[0].values[0][0]
    const brokenId = db.exec('SELECT id FROM files WHERE full_path = ?', [brokenPath])[0].values[0][0]
    const imageMetadata = getAiMetadata(imageId)
    const brokenMetadata = getAiMetadata(brokenId)
    const firstSearch = searchFiles({ query: 'Find my graduation certificate' }, [selectedPath])
    const legacySearch = searchFiles({ query: 'certificate_final.pdf' }, [selectedPath])
    const callsAfterFirst = calls.length
    const second = await analyzeSelectedFiles([selectedPath], { provider: mockProvider })
    const skippedUnchanged = second.skipped === 3 && calls.length === callsAfterFirst + 1

    writeFile(imagePath, 'image-content-v2-changed')
    const oldFingerprint = imageMetadata.fingerprint
    await analyzeSelectedFiles([selectedPath], { provider: mockProvider })
    const updatedMetadata = getAiMetadata(imageId)
    const changedWasReprocessed = updatedMetadata.fingerprint !== oldFingerprint

    const checks = [
      sawProcessingState,
      imageMetadata.status === 'completed' && imageMetadata.title === 'Bachelor of Technology',
      firstSearch.total === 1 && firstSearch.results[0].fullPath === imagePath,
      firstSearch.results[0].aiMatch && firstSearch.results[0].matchExplanation.includes('graduation certificate'),
      legacySearch.total === 1 && legacySearch.results[0].fullPath === legacyPath,
      first.failed === 1 && first.completed === 3,
      brokenMetadata.status === 'failed' && Boolean(brokenMetadata.processingError),
      pdfTextExtractedLocally,
      calls.every((filename) => !filename.includes('unselected') && !filename.endsWith('.docx')),
      skippedUnchanged,
      changedWasReprocessed,
      configMissing && !missingConfig.ok && /not configured/i.test(missingConfig.message),
      progress.some((item) => item.status === 'processing' && item.total === 4),
      getIndexedFile(imagePath, [selectedPath])?.fullPath === imagePath,
    ]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, checks: checks.length, results: checks, first, skippedUnchanged, changedWasReprocessed }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    closeDatabase()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
