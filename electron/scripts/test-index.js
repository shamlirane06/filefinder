/**
 * Isolated Phase 2 indexing smoke test.
 * Run: npx electron electron/scripts/test-index.js
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  initDatabase,
  getIndexStats,
  getIndexedFolders,
  getSampleFiles,
  closeDatabase,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'

const isRestartCheck = process.argv[2] === '--verify-restart'
const testRoot = isRestartCheck
  ? process.argv[3]
  : fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-index-'))
const sampleDir = path.join(testRoot, 'selected-folder')
const profileDir = path.join(testRoot, 'profile')
const scriptPath = fileURLToPath(import.meta.url)

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function ensureSample() {
  writeFile(path.join(sampleDir, 'readme.txt'), 'hello')
  writeFile(path.join(sampleDir, 'docs', 'report.csv'), 'a,b\n1,2')
  writeFile(path.join(sampleDir, 'docs', 'deep', 'notes.md'), '# notes')
  writeFile(path.join(sampleDir, 'photos', 'photo.jpg'), 'not-a-real-image')
  writeFile(path.join(sampleDir, '__MACOSX', 'metadata.bin'), 'metadata')
}

function cleanup() {
  closeDatabase()
  fs.rmSync(testRoot, { recursive: true, force: true })
}

app.whenReady().then(async () => {
  let ok = false
  try {
    app.setPath('userData', profileDir)
    fs.mkdirSync(profileDir, { recursive: true })
    if (isRestartCheck) {
      await initDatabase()
      const stats = getIndexStats()
      const folder = getIndexedFolders().find((item) => item.path === sampleDir)
      const persisted = stats.totalFiles === 4 && folder?.fileCount === 4 && folder.lastIndexedAt
      ok = Boolean(persisted)
      console.log(JSON.stringify({ restartVerified: Boolean(persisted), stats, folder }))
      closeDatabase()
      return
    }

    ensureSample()
    await initDatabase()

    console.log('Indexing selected fixture:', sampleDir)
    const result = await indexFolder({ name: 'selected-folder', path: sampleDir })
    const stats = getIndexStats()
    const sample = getSampleFiles(20)
    const required = [
      'filename',
      'full_path',
      'file_type',
      'size',
      'created_at',
      'modified_at',
      'parent_folder',
      'root_folder',
    ]
    const missingFields = sample.flatMap((row) =>
      required.filter((key) => row[key] == null)
    )
    const nested = sample.some((row) =>
      String(row.full_path).toLowerCase().includes(`${path.sep}docs${path.sep}deep${path.sep}`)
    )
    const metadataCorrect = sample.every((row) =>
      path.isAbsolute(row.full_path) &&
      row.root_folder === sampleDir &&
      row.parent_folder === path.dirname(row.full_path) &&
      typeof row.extension === 'string' &&
      typeof row.size === 'number'
    )

    const reindex = await indexFolder({ name: 'selected-folder', path: sampleDir })
    const afterReindex = getIndexStats()

    const photosDir = path.join(sampleDir, 'photos')
    const removedFile = path.join(photosDir, 'photo.jpg')
    const staleEntries = fs.readdirSync(photosDir, { withFileTypes: true })
    const originalReaddir = fs.readdirSync
    let simulatedDeletion = false
    let deletionResult
    try {
      deletionResult = await indexFolder(
        { name: 'selected-folder', path: sampleDir },
        {
          onProgress: (progress) => {
            if (!simulatedDeletion && progress.total > 0 && progress.indexed === 0) {
              simulatedDeletion = true
              fs.readdirSync = function (directory, options) {
                if (path.resolve(directory) === path.resolve(photosDir)) return staleEntries
                return originalReaddir.call(fs, directory, options)
              }
              fs.unlinkSync(removedFile)
            }
          },
        }
      )
    } finally {
      fs.readdirSync = originalReaddir
    }
    const afterDeletion = getIndexStats()

    const dbPath = path.join(profileDir, 'filefinder-index.sqlite')
    const databaseExists = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0

    let missingFolderError = null
    try {
      await indexFolder({
        name: 'missing',
        path: path.join(sampleDir, 'does-not-exist'),
      })
    } catch (error) {
      missingFolderError = error.message
    }

    closeDatabase()
    await initDatabase()
    const afterRestart = getIndexStats()
    const foldersAfterRestart = getIndexedFolders()
    closeDatabase()
    const processRestart = spawnSync(
      process.execPath,
      [scriptPath, '--verify-restart', testRoot],
      { encoding: 'utf8' }
    )
    const processRestartVerified = processRestart.status === 0

    ok =
      result.indexed === 5 &&
      stats.totalFiles === 5 &&
      !missingFields.length &&
      metadataCorrect &&
      nested &&
      reindex.indexed === 5 &&
      afterReindex.totalFiles === 5 &&
      simulatedDeletion &&
      deletionResult.indexed === 4 &&
      deletionResult.skippedErrors === 1 &&
      afterDeletion.totalFiles === 4 &&
      databaseExists &&
      afterRestart.totalFiles === 4 &&
      processRestartVerified &&
      foldersAfterRestart.some((folder) => folder.path === sampleDir && folder.lastIndexedAt) &&
      /does not exist/i.test(missingFolderError || '')

    console.log(JSON.stringify({
      result: result.indexed,
      reindex: afterReindex.totalFiles,
      deletedDuringScan: deletionResult,
      afterRestart,
      processRestart: processRestart.stdout?.trim(),
      databaseExists,
      missingFolderError,
      passed: ok,
    }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    if (!isRestartCheck) cleanup()
    app.exit(ok ? 0 : 1)
  }
})
