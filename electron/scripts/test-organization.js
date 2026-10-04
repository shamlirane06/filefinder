/** Organization suggestions and confirmed file-move tests. */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDatabase,
  getDatabase,
  getFileOrganizationData,
  initDatabase,
  setAiMetadata,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'
import { searchFiles } from '../services/fileSearch.js'
import { createOrganizationSuggestionService } from '../services/organizationSuggestions.js'
import { moveIndexedFile, undoIndexedFileMove } from '../services/fileOrganization.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-organization-'))
const profile = path.join(tempRoot, 'profile')
const downloadsPath = path.join(tempRoot, 'Downloads')
const documentsPath = path.join(tempRoot, 'Documents')

function createFile(folder, filename, contents = 'fixture') {
  const fullPath = path.join(folder, filename)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, contents)
  return fullPath
}

function fileId(fullPath) {
  return getDatabase().exec('SELECT id FROM files WHERE full_path = ?', [fullPath])[0]?.values[0]?.[0]
}

function addAiMetadata(fullPath) {
  setAiMetadata(fileId(fullPath), {
    fingerprint: `test-${path.basename(fullPath)}`,
    documentType: 'graduation certificate',
    title: 'Bachelor degree award',
    description: 'Academic degree completion document.',
    extractedText: 'This is a graduation certificate from a university.',
    keywords: ['graduation', 'degree', 'certificate'],
    entities: [],
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
    const graduation = createFile(downloadsPath, 'Graduation_Certificate.pdf')
    const degree = createFile(downloadsPath, 'Degree_Certificate.pdf')
    const internship = createFile(downloadsPath, 'Internship_Certificate.pdf')
    const disappearing = createFile(downloadsPath, 'disappearing.pdf')
    const moveFailure = createFile(downloadsPath, 'move_failure.pdf')
    const duplicate = createFile(downloadsPath, 'Graduation_Certificate.pdf')
    createFile(path.join(documentsPath, 'Education', 'Certificates'), path.basename(duplicate), 'existing destination')
    await initDatabase()
    await indexFolder({ name: 'Downloads', path: downloadsPath })
    await indexFolder({ name: 'Documents', path: documentsPath })
    addAiMetadata(graduation)

    const selected = [{ name: 'Downloads', path: downloadsPath }, { name: 'Documents', path: documentsPath }]
    let aiInput = null
    const aiSuggestions = createOrganizationSuggestionService({
      getOrganizationData: getFileOrganizationData,
      provider: { async suggestOrganization(input) {
        aiInput = input
        return { category: 'Education', subcategory: 'Certificates', reason: 'Identified as an academic certificate.' }
      } },
    })
    const aiResult = (await aiSuggestions.suggestForFiles([graduation], selected))[0]
    const localSuggestions = createOrganizationSuggestionService({ getOrganizationData: getFileOrganizationData })
    const multiple = await localSuggestions.suggestForFiles([degree, internship], selected)
    const failedAi = createOrganizationSuggestionService({
      getOrganizationData: getFileOrganizationData,
      provider: { async suggestOrganization() { throw new Error('offline') } },
    })
    const aiUnavailable = (await failedAi.suggestForFiles([graduation], selected))[0]

    const duplicateMove = await moveIndexedFile({
      fullPath: graduation,
      destinationRootPath: documentsPath,
      categoryPath: ['Education', 'Certificates'],
      selectedFolders: selected,
    })

    fs.unlinkSync(disappearing)
    const missingMove = await moveIndexedFile({
      fullPath: disappearing,
      destinationRootPath: documentsPath,
      categoryPath: ['Documents', 'Other'],
      selectedFolders: selected,
    })

    const failingFileSystem = new Proxy(fs.promises, {
      get(target, key) {
        if (key === 'copyFile') return async () => { const error = new Error('mock move failure'); error.code = 'EIO'; throw error }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const failedMove = await moveIndexedFile({
      fullPath: moveFailure,
      destinationRootPath: documentsPath,
      categoryPath: ['Documents', 'Other'],
      selectedFolders: selected,
      fileSystem: failingFileSystem,
    })

    const successfulMove = await moveIndexedFile({
      fullPath: degree,
      destinationRootPath: documentsPath,
      categoryPath: [multiple[0].category, multiple[0].subcategory],
      selectedFolders: selected,
    })
    const movedPath = successfulMove.file?.fullPath
    const movePhysicalSuccess = successfulMove.ok && fs.existsSync(movedPath) && !fs.existsSync(degree)
    const movedDbRow = getDatabase().exec('SELECT folder_id, full_path, root_folder, parent_folder, modified_at FROM files WHERE full_path = ?', [movedPath])[0]?.values[0]
    const movedSearch = searchFiles({ query: 'Degree_Certificate.pdf' }, selected)
    const undo = await undoIndexedFileMove({
      sourcePath: movedPath,
      destinationPath: successfulMove.undo?.previousPath,
      destinationRootPath: successfulMove.undo?.previousRootPath,
      selectedFolders: selected,
    })
    const restoredSearch = searchFiles({ query: 'Degree_Certificate.pdf' }, selected)

    const searchPage = fs.readFileSync(new URL('../../src/pages/SearchPage.jsx', import.meta.url), 'utf8')
    const checks = [
      aiResult.category === 'Education' && aiResult.subcategory === 'Certificates' && aiResult.usedAi,
      Boolean(aiInput) && !Object.hasOwn(aiInput, 'extractedText') && aiResult.reason.includes('academic certificate'),
      multiple.length === 2 && multiple[0].category === 'Education' && multiple[1].category === 'Career',
      localSuggestions && multiple.every((suggestion) => !suggestion.usedAi),
      searchPage.includes('Review organization suggestion') && searchPage.includes('Current location') && searchPage.includes('Suggested location'),
      searchPage.includes('setConfirmingMove(true)') && searchPage.includes('Confirm move') && searchPage.includes('api.moveOrganizedFile('),
      movePhysicalSuccess,
      !duplicateMove.ok && duplicateMove.error.includes('already exists') && fs.existsSync(graduation),
      !missingMove.ok && missingMove.unavailable && getDatabase().exec('SELECT 1 FROM files WHERE full_path = ?', [disappearing])[0]?.values.length === 1,
      Boolean(movedDbRow?.[1] === movedPath && movedDbRow?.[2] === documentsPath &&
        movedDbRow?.[3] === path.dirname(movedPath) && movedDbRow?.[0]),
      !failedMove.ok && fs.existsSync(moveFailure) && !fs.existsSync(path.join(documentsPath, 'Documents', 'Other', 'move_failure.pdf')),
      undo.ok && fs.existsSync(degree) && !fs.existsSync(movedPath),
      restoredSearch.results.some((file) => file.fullPath === degree) && !movedSearch.results.some((file) => file.fullPath === degree),
      aiUnavailable.aiUnavailable && aiUnavailable.category === 'Education' && aiUnavailable.subcategory === 'Certificates',
      searchPage.includes('organization:undo') || fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8').includes('undoOrganizedMove'),
    ]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({
      passed,
      checks: checks.length,
      failedChecks: checks.flatMap((value, index) => value ? [] : [index + 1]),
    }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    closeDatabase()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
