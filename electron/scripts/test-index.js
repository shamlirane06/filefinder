/**
 * Isolated Phase 2 indexing smoke test.
 * Run: npx electron electron/scripts/test-index.js
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import {
  initDatabase,
  getDatabase,
  getIndexStats,
  getIndexedFolder,
  getIndexedFolders,
  getSampleFiles,
  closeDatabase,
} from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'

const require = createRequire(import.meta.url)
const BULK_FILES = 220
const SELECTED_FILE_COUNT = BULK_FILES + 11
const AFTER_DELETE_COUNT = SELECTED_FILE_COUNT - 1
const SECOND_FOLDER_COUNT = 2
const TOTAL_AFTER_INDEX = AFTER_DELETE_COUNT + SECOND_FOLDER_COUNT

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
  writeFile(path.join(sampleDir, 'docs', 'certificate.pdf'), 'metadata only')
  writeFile(path.join(sampleDir, 'docs', 'letter.docx'), 'metadata only')
  writeFile(path.join(sampleDir, 'photos', 'photo.jpg'), 'not-a-real-image')
  writeFile(path.join(sampleDir, 'photos', 'diagram.png'), 'not-a-real-image')
  writeFile(path.join(sampleDir, 'videos', 'clip.mp4'), 'metadata only')
  writeFile(path.join(sampleDir, 'videos', 'clip.mov'), 'metadata only')
  writeFile(path.join(sampleDir, 'archives', 'backup.zip'), 'metadata only')
  writeFile(path.join(sampleDir, '__MACOSX', 'metadata.bin'), 'metadata')
  writeFile(path.join(sampleDir, 'node_modules', 'package', 'generated.txt'), 'ignore')
  writeFile(path.join(sampleDir, '.git', 'objects', 'generated.txt'), 'ignore')
  writeFile(path.join(sampleDir, '.cache', 'generated.txt'), 'ignore')
  writeFile(path.join(sampleDir, 'temp', 'generated.txt'), 'ignore')

  const extensions = ['.txt', '.jpg', '.pdf', '.docx']
  for (let index = 0; index < BULK_FILES; index += 1) {
    const extension = extensions[index % extensions.length]
    writeFile(path.join(sampleDir, 'bulk', `item-${index}${extension}`), `fixture ${index}`)
  }

  const secondFolder = path.join(testRoot, 'second-selected-folder')
  writeFile(path.join(secondFolder, 'readme.txt'), 'same name, separate folder')
  writeFile(path.join(secondFolder, 'image.png'), 'metadata only')
  fs.mkdirSync(path.join(testRoot, 'empty-selected-folder'), { recursive: true })
}

async function seedLegacyDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
  })
  const legacyDb = new SQL.Database()
  legacyDb.run(`
    CREATE TABLE indexed_folders (
      path TEXT PRIMARY KEY COLLATE NOCASE,
      name TEXT NOT NULL,
      last_indexed_at TEXT,
      file_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ready'
    )
  `)
  legacyDb.run(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      full_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
      extension TEXT,
      file_type TEXT,
      size INTEGER,
      created_at TEXT,
      modified_at TEXT,
      parent_folder TEXT,
      root_folder TEXT NOT NULL COLLATE NOCASE
    )
  `)
  legacyDb.run(
    'INSERT INTO indexed_folders (path, name, last_indexed_at, file_count, status) VALUES (?, ?, ?, ?, ?)',
    [sampleDir, 'selected-folder', new Date().toISOString(), 1, 'ready']
  )
  legacyDb.run(
    'INSERT INTO files (filename, full_path, extension, file_type, size, created_at, modified_at, parent_folder, root_folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['readme.txt', path.join(sampleDir, 'readme.txt'), '.txt', 'Text', 5, null, null, sampleDir, sampleDir]
  )
  const dbPath = path.join(profileDir, 'filefinder-index.sqlite')
  fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()))
  legacyDb.close()
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
      const persisted = stats.totalFiles === TOTAL_AFTER_INDEX &&
        folder?.fileCount === AFTER_DELETE_COUNT && Boolean(folder.lastIndexedAt && folder.id)
      ok = Boolean(persisted)
      console.log(JSON.stringify({ restartVerified: Boolean(persisted), stats, folder }))
      closeDatabase()
      return
    }

    ensureSample()
    await seedLegacyDatabase()
    await initDatabase()

    const migratedFolder = getIndexedFolder(sampleDir)
    const migratedFile = getSampleFiles(1000).find(
      (row) => row.full_path === path.join(sampleDir, 'readme.txt')
    )
    const migrationVerified = Boolean(
      migratedFolder?.id && migratedFile?.folder_id === migratedFolder.id
    )

    console.log('Indexing selected fixture:', sampleDir)
    const progressEvents = []
    const result = await indexFolder(
      { name: 'selected-folder', path: sampleDir },
      { onProgress: (progress) => progressEvents.push(progress) }
    )
    const indexingProgressReported = progressEvents.some(
      (progress) => progress.status === 'indexing' && progress.found >= 40 && progress.total === 0
    ) && progressEvents.some(
      (progress) => progress.status === 'indexing' && progress.total === SELECTED_FILE_COUNT && progress.indexed > 0
    )
    const stats = getIndexStats()
    const sample = getSampleFiles(20)
    const required = [
      'filename',
      'folder_id',
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
    const nested = getSampleFiles(1000).some((row) =>
      String(row.full_path).toLowerCase().includes(`${path.sep}docs${path.sep}deep${path.sep}`)
    )
    const indexedFolder = getIndexedFolder(sampleDir)
    const metadataCorrect = sample.every((row) =>
      path.isAbsolute(row.full_path) &&
      row.root_folder === sampleDir &&
      row.folder_id === indexedFolder.id &&
      row.parent_folder === path.dirname(row.full_path) &&
      typeof row.extension === 'string' &&
      typeof row.size === 'number'
    )
    const supportedExtensions = new Map(sample.map((row) => [row.extension, row.file_type]))
    const fileTypesCorrect = supportedExtensions.get('.mp4') === 'Video' &&
      supportedExtensions.get('.mov') === 'Video' &&
      supportedExtensions.get('.zip') === 'Archive' &&
      supportedExtensions.get('.docx') === 'Word Document'
    const allIndexed = getSampleFiles(1000)
    const indexedSize = allIndexed.reduce((sum, row) => sum + (row.size || 0), 0)
    const firstFolderSizeCorrect = indexedFolder.totalSize === indexedSize
    const foreignKeyRows = getDatabase().exec('PRAGMA foreign_key_list(files)')[0]?.values ?? []
    const foreignKeyCorrect = foreignKeyRows.some((row) =>
      row[2] === 'indexed_folders' && row[3] === 'folder_id' && row[4] === 'id'
    )
    const indexNames = new Set(
      getDatabase().exec('PRAGMA index_list(files)')[0]?.values.map((row) => row[1]) ?? []
    )
    const searchIndexesCorrect = [
      'idx_files_filename', 'idx_files_extension', 'idx_files_path', 'idx_files_folder_id',
    ].every((name) => indexNames.has(name))

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

    const secondDir = path.join(testRoot, 'second-selected-folder')
    const secondResult = await indexFolder({ name: 'second-selected-folder', path: secondDir })
    const emptyDir = path.join(testRoot, 'empty-selected-folder')
    const emptyResult = await indexFolder({ name: 'empty-selected-folder', path: emptyDir })
    const indexedRoots = getIndexedFolders()
    const secondFolder = indexedRoots.find((folder) => folder.path === secondDir)
    const firstFolder = indexedRoots.find((folder) => folder.path === sampleDir)
    const duplicateNames = getSampleFiles(1000).filter((row) => row.filename === 'readme.txt')
    const folderRelationsCorrect = Boolean(
      secondFolder?.id && firstFolder?.id !== secondFolder?.id &&
      duplicateNames.length === 2 &&
      new Set(duplicateNames.map((row) => row.folder_id)).size === 2
    )

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
      result.indexed === SELECTED_FILE_COUNT &&
      stats.totalFiles === SELECTED_FILE_COUNT &&
      !missingFields.length &&
      metadataCorrect &&
      migrationVerified &&
      fileTypesCorrect &&
      indexingProgressReported &&
      firstFolderSizeCorrect &&
      foreignKeyCorrect &&
      searchIndexesCorrect &&
      nested &&
      reindex.indexed === SELECTED_FILE_COUNT &&
      afterReindex.totalFiles === SELECTED_FILE_COUNT &&
      simulatedDeletion &&
      deletionResult.indexed === AFTER_DELETE_COUNT &&
      deletionResult.skippedErrors === 1 &&
      afterDeletion.totalFiles === AFTER_DELETE_COUNT &&
      secondResult.indexed === SECOND_FOLDER_COUNT &&
      emptyResult.indexed === 0 &&
      folderRelationsCorrect &&
      databaseExists &&
      afterRestart.totalFiles === TOTAL_AFTER_INDEX &&
      processRestartVerified &&
      foldersAfterRestart.some((folder) => folder.path === sampleDir && folder.lastIndexedAt) &&
      /does not exist/i.test(missingFolderError || '')

    console.log(JSON.stringify({
      result: result.indexed,
      reindex: afterReindex.totalFiles,
      migrationVerified,
      fileTypesCorrect,
      indexingProgressReported,
      firstFolderSizeCorrect,
      foreignKeyCorrect,
      searchIndexesCorrect,
      ignoredDirectoriesExcluded: stats.totalFiles === SELECTED_FILE_COUNT,
      folderRelationsCorrect,
      secondFolderFiles: secondResult.indexed,
      emptyFolderFiles: emptyResult.indexed,
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
