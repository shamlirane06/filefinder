/**
 * Headless Phase 2 indexing smoke test.
 * Run: npx electron electron/scripts/test-index.js
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase, getIndexStats, getIndexedFolders, clearAllIndex } from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sampleDir = path.join(__dirname, '../../test-index-sample')

app.whenReady().then(async () => {
  try {
    await initDatabase()
    clearAllIndex()

    if (!fs.existsSync(sampleDir)) {
      console.error('FAIL: sample folder missing:', sampleDir)
      app.exit(1)
      return
    }

    console.log('Indexing:', sampleDir)
    const result = await indexFolder({ name: 'test-index-sample', path: sampleDir })
    console.log('index result:', JSON.stringify(result, null, 2))

    const stats = getIndexStats()
    console.log('stats:', stats)
    console.log('folders:', getIndexedFolders())

    const reindex = await indexFolder({ name: 'test-index-sample', path: sampleDir })
    const afterReindex = getIndexStats()
    console.log('reindex result:', reindex.indexed, 'stats:', afterReindex)

    const dbPath = path.join(app.getPath('userData'), 'filefinder-index.sqlite')
    console.log('db path:', dbPath, 'size:', fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0)

    if (result.indexed >= 4 && stats.totalFiles >= 4 && afterReindex.totalFiles === 4) {
      console.log('PASS: indexing wrote files to SQLite; reindex did not duplicate')
      app.exit(0)
    } else {
      console.error('FAIL: expected 4 files without duplicates, got', result.indexed, afterReindex.totalFiles)
      app.exit(1)
    }
  } catch (error) {
    console.error('FAIL:', error)
    app.exit(1)
  }
})
