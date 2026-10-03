/**
 * Isolated Phase 3 file-search and file-action verification.
 * Run: npm run test:search
 */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDatabase,
  getDatabase,
  initDatabase,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'
import { getIndexedFile, getSearchOptions, searchFiles } from '../services/fileSearch.js'
import {
  copyIndexedPath,
  openIndexedFile,
  openIndexedFolder,
} from '../services/fileActions.js'

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-search-'))
const profileDir = path.join(testRoot, 'profile')
const documentsPath = path.join(testRoot, 'Documents')
const legalPath = path.join(testRoot, 'Legal')
const unselectedPath = path.join(testRoot, 'NotSelected')

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function resultNames(response) {
  return response.results.map((result) => result.filename)
}

app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profileDir)
    fs.mkdirSync(profileDir, { recursive: true })
    writeFile(path.join(documentsPath, 'Internship_Certificate.pdf'), 'certificate')
    writeFile(path.join(documentsPath, 'reports', 'Certificate_2025.jpg'), 'photo')
    writeFile(path.join(documentsPath, 'Budget.pdf'), 'budget')
    writeFile(path.join(legalPath, 'Degree_Certificate.PDF'), 'degree')
    writeFile(path.join(unselectedPath, 'Certificate_Leak.pdf'), 'must stay hidden')
    await initDatabase()

    await indexFolder({ name: 'Documents', path: documentsPath })
    await indexFolder({ name: 'Legal', path: legalPath })
    await indexFolder({ name: 'NotSelected', path: unselectedPath })
    const selected = [documentsPath, legalPath]
    const db = getDatabase()
    const timestamps = [
      [path.join(documentsPath, 'Internship_Certificate.pdf'), '2026-10-02T10:00:00.000Z'],
      [path.join(documentsPath, 'reports', 'Certificate_2025.jpg'), '2025-03-03T10:00:00.000Z'],
      [path.join(documentsPath, 'Budget.pdf'), '2020-01-01T10:00:00.000Z'],
      [path.join(legalPath, 'Degree_Certificate.PDF'), '2024-04-04T10:00:00.000Z'],
    ]
    for (const [fullPath, modifiedAt] of timestamps) {
      db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', [modifiedAt, fullPath])
    }

    const tests = []
    tests.push(searchFiles({ query: 'Internship_Certificate.pdf' }, selected).total === 1)
    tests.push(searchFiles({ query: 'intern' }, selected).total === 1)
    tests.push(searchFiles({ query: 'CERTIFICATE' }, selected).total === 3)
    tests.push(searchFiles({ query: "' OR 1=1 --" }, selected).total <= 4)
    tests.push(searchFiles({ query: '.pdf' }, selected).total === 3)
    tests.push(searchFiles({ query: 'legal' }, selected).total === 1)
    tests.push(searchFiles({ query: 'reports' }, selected).total === 1)
    tests.push(searchFiles({ query: '' }, selected).total === 0)
    tests.push(searchFiles({ query: 'there-is-no-such-file' }, selected).total === 0)
    tests.push(searchFiles({ query: '', fileType: 'PDF' }, selected).total === 3)
    tests.push(searchFiles({ query: '', dateModified: 'week' }, selected).total === 1)
    tests.push(searchFiles({ query: '', folderPath: legalPath }, selected).total === 1)
    tests.push(searchFiles({ query: '', folderPath: unselectedPath }, selected).total === 0)
    tests.push(getSearchOptions(selected).fileTypes.includes('PDF'))
    tests.push(!resultNames(searchFiles({ query: 'certificate' }, selected)).includes('Certificate_Leak.pdf'))

    const byName = resultNames(searchFiles({ query: 'certificate', sort: 'name' }, selected))
    tests.push(byName.join('|') === 'Certificate_2025.jpg|Degree_Certificate.PDF|Internship_Certificate.pdf')
    const newestPdfs = resultNames(searchFiles({ query: '.pdf', sort: 'newest' }, selected))
    tests.push(newestPdfs[0] === 'Internship_Certificate.pdf')
    const oldestPdfs = resultNames(searchFiles({ query: '.pdf', sort: 'oldest' }, selected))
    tests.push(oldestPdfs[0] === 'Budget.pdf')
    const relevant = resultNames(searchFiles({ query: 'Internship_Certificate.pdf', sort: 'relevance' }, selected))
    tests.push(relevant[0] === 'Internship_Certificate.pdf')

    const targetPath = path.join(documentsPath, 'Internship_Certificate.pdf')
    const opened = []
    const openResult = await openIndexedFile(targetPath, selected, async (target) => {
      opened.push(target)
      return ''
    })
    const folderResult = await openIndexedFolder(targetPath, selected, async (target) => {
      opened.push(target)
      return ''
    })
    let copiedPath = ''
    const copyResult = await copyIndexedPath(targetPath, selected, (value) => {
      copiedPath = value
    })
    const rejectedOpen = await openIndexedFile(
      path.join(unselectedPath, 'Certificate_Leak.pdf'),
      selected,
      async () => { throw new Error('Unselected paths must not be opened') }
    )
    tests.push(openResult.ok && opened[0] === targetPath)
    tests.push(folderResult.ok && opened[1] === documentsPath)
    tests.push(copyResult.ok && copiedPath === targetPath)
    tests.push(!rejectedOpen.ok)
    tests.push(getIndexedFile(targetPath, selected)?.fullPath === targetPath)
    fs.unlinkSync(targetPath)
    const staleOpen = await openIndexedFile(targetPath, selected, async () => '')
    tests.push(staleOpen.unavailable === true)
    tests.push(staleOpen.error.includes('may have been moved or deleted'))
    passed = tests.every(Boolean)
    console.log(JSON.stringify({ passed, checks: tests.length, failedChecks: tests.flatMap((value, index) => value ? [] : [index + 1]), indexedRoots: 3, selectedRoots: 2 }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    closeDatabase()
    fs.rmSync(testRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
