/**
 * Headless Phase 2 indexing smoke test.
 * Run: npx electron electron/scripts/test-index.js
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  initDatabase,
  getIndexStats,
  getIndexedFolders,
  getSampleFiles,
  clearAllIndex,
  closeDatabase,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sampleDir = path.join(__dirname, '../../test-index-sample')

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function ensureSample() {
  fs.rmSync(sampleDir, { recursive: true, force: true })
  writeFile(path.join(sampleDir, 'readme.txt'), 'hello')
  writeFile(path.join(sampleDir, 'docs', 'report.csv'), 'a,b\n1,2')
  writeFile(path.join(sampleDir, 'docs', 'deep', 'notes.md'), '# notes')
  writeFile(path.join(sampleDir, 'photos', 'photo.jpg'), 'not-a-real-image')
}

app.whenReady().then(async () => {
  try {
    await initDatabase()
    clearAllIndex()
    ensureSample()

    console.log('Indexing:', sampleDir)
    const result = await indexFolder({ name: 'test-index-sample', path: sampleDir })
    console.log('index result:', JSON.stringify(result, null, 2))

    const stats = getIndexStats()
    const sample = getSampleFiles(20)
    console.log('stats:', stats)
    console.log('folders:', getIndexedFolders())
    console.log('sample rows:', sample)

    const required = [
      'filename',
      'full_path',
      'extension',
      'file_type',
      'size',
      'created_at',
      'modified_at',
      'parent_folder',
    ]
    const missingCols = sample.flatMap((row) =>
      required.filter((key) => row[key] == null && key !== 'extension')
    )

    const nested = sample.some((row) =>
      String(row.full_path).toLowerCase().includes(`${path.sep}docs${path.sep}deep${path.sep}`)
    )

    const reindex = await indexFolder({ name: 'test-index-sample', path: sampleDir })
    const afterReindex = getIndexStats()
    console.log('reindex result:', reindex.indexed, 'stats:', afterReindex)

    const dbPath = path.join(app.getPath('userData'), 'filefinder-index.sqlite')
    console.log('db path:', dbPath, 'size:', fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0)

    let missingError = null
    try {
      await indexFolder({
        name: 'missing',
        path: path.join(sampleDir, 'does-not-exist'),
      })
    } catch (error) {
      missingError = error.message
    }
    console.log('missing folder error:', missingError)

    closeDatabase()
    await initDatabase()
    const afterRestart = getIndexStats()
    const foldersAfterRestart = getIndexedFolders()
    console.log('after restart:', afterRestart, foldersAfterRestart)

    const ok =
      result.indexed === 4 &&
      stats.totalFiles === 4 &&
      afterReindex.totalFiles === 4 &&
      afterRestart.totalFiles === 4 &&
      foldersAfterRestart.length === 1 &&
      nested &&
      !missingCols.length &&
      /does not exist/i.test(missingError || '')

    if (ok) {
      console.log('PASS: recursive scan, sqlite fields, no duplicates, persistence, missing folder handled')
      app.exit(0)
    } else {
      console.error('FAIL', {
        indexed: result.indexed,
        afterReindex: afterReindex.totalFiles,
        nested,
        missingCols,
        missingError,
      })
      app.exit(1)
    }
  } catch (error) {
    console.error('FAIL:', error)
    app.exit(1)
  }
})
