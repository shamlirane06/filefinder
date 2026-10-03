import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { app } from 'electron'

const require = createRequire(import.meta.url)

let db = null
let dbPath = null

function getDbPath() {
  return path.join(app.getPath('userData'), 'filefinder-index.sqlite')
}

function persist() {
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export async function initDatabase() {
  if (db) return db

  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(path.dirname(require.resolve('sql.js')), file),
  })

  dbPath = getDbPath()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS indexed_folders (
      id TEXT NOT NULL UNIQUE,
      path TEXT PRIMARY KEY COLLATE NOCASE,
      name TEXT NOT NULL,
      last_indexed_at TEXT,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'
    )
  `)

  const folderColumns = new Set(
    db.exec('PRAGMA table_info(indexed_folders)')[0]?.values.map((row) => row[1]) ?? []
  )
  if (!folderColumns.has('id')) db.run('ALTER TABLE indexed_folders ADD COLUMN id TEXT')
  const migrateFolderSize = !folderColumns.has('total_size')
  if (migrateFolderSize) {
    db.run('ALTER TABLE indexed_folders ADD COLUMN total_size INTEGER DEFAULT 0')
  }
  const foldersWithoutId = db.exec(
    "SELECT path FROM indexed_folders WHERE id IS NULL OR id = ''"
  )[0]?.values ?? []
  for (const [folderPath] of foldersWithoutId) {
    db.run('UPDATE indexed_folders SET id = ? WHERE path = ?', [randomUUID(), folderPath])
  }
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_indexed_folders_id ON indexed_folders(id)')

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id TEXT NOT NULL REFERENCES indexed_folders(id),
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

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_file_metadata (
      file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      document_type TEXT,
      title TEXT,
      description TEXT,
      extracted_text TEXT,
      keywords TEXT NOT NULL DEFAULT '[]',
      entities TEXT NOT NULL DEFAULT '[]',
      category TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      ai_processed INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT,
      model TEXT,
      processing_error TEXT
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_metadata_status ON ai_file_metadata(status)')

  const fileColumns = new Set(
    db.exec('PRAGMA table_info(files)')[0]?.values.map((row) => row[1]) ?? []
  )
  const migrateFileFolderId = !fileColumns.has('folder_id')
  if (migrateFileFolderId) {
    db.run('ALTER TABLE files ADD COLUMN folder_id TEXT REFERENCES indexed_folders(id)')
  }
  if (migrateFileFolderId) {
    db.run(`
      UPDATE files
      SET folder_id = (
        SELECT indexed_folders.id
        FROM indexed_folders
        WHERE indexed_folders.path = files.root_folder COLLATE NOCASE
      )
      WHERE folder_id IS NULL
    `)
  }
  if (migrateFolderSize) {
    db.run(`
      UPDATE indexed_folders
      SET total_size = (
        SELECT COALESCE(SUM(files.size), 0)
        FROM files
        WHERE files.root_folder = indexed_folders.path COLLATE NOCASE
      )
    `)
  }

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_root ON files(root_folder)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(full_path)
  `)

  // A crash mid-scan can leave folders stuck in "indexing".
  // Discard partial rows written after a rebuild cleared the prior folder index.
  db.run(`
    DELETE FROM files
    WHERE root_folder IN (
      SELECT path FROM indexed_folders
      WHERE status = 'indexing' AND file_count = 0
    )
  `)
  db.run(`
    UPDATE indexed_folders
    SET status = CASE
      WHEN file_count > 0 THEN 'ready'
      ELSE 'pending'
    END
    WHERE status = 'indexing'
  `)

  persist()
  return db
}

export function persistDatabase() {
  persist()
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function getIndexedFolder(folderPath) {
  const database = getDatabase()
  const stmt = database.prepare(
    `
    SELECT id, path, name, last_indexed_at, file_count, total_size, status
    FROM indexed_folders
    WHERE path = ? COLLATE NOCASE
    `
  )
  stmt.bind([folderPath])
  let row = null
  if (stmt.step()) {
    row = stmt.getAsObject()
  }
  stmt.free()
  if (!row) return null
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    lastIndexedAt: row.last_indexed_at,
    fileCount: row.file_count ?? 0,
    totalSize: row.total_size ?? 0,
    status: row.status,
  }
}

function aiRootPaths(selectedFolders) {
  return [...new Set((Array.isArray(selectedFolders) ? selectedFolders : [])
    .map((item) => typeof item === 'string' ? item : item?.path)
    .filter((item) => typeof item === 'string' && item.length)
    .map((item) => item.toLowerCase()))]
}

function queryRows(sql, values = []) {
  const statement = getDatabase().prepare(sql)
  try {
    statement.bind(values)
    const rows = []
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

export function getAiCandidates(selectedFolders = []) {
  const roots = aiRootPaths(selectedFolders)
  if (!roots.length) return []
  return queryRows(`
    SELECT id, full_path AS fullPath, filename, extension, size, modified_at AS modifiedAt,
           root_folder AS rootFolder
    FROM files
    WHERE LOWER(root_folder) IN (${roots.map(() => '?').join(', ')})
      AND LOWER(extension) IN ('.jpg', '.jpeg', '.png', '.webp', '.pdf')
    ORDER BY full_path COLLATE NOCASE
  `, roots)
}

export function getAiMetadata(fileId) {
  return queryRows(`
    SELECT fingerprint, document_type AS documentType, title, description,
           extracted_text AS extractedText, keywords, entities, category,
           status, processed_at AS processedAt, model, processing_error AS processingError
    FROM ai_file_metadata WHERE file_id = ? LIMIT 1
  `, [fileId])[0] ?? null
}

export function setAiMetadata(fileId, metadata) {
  getDatabase().run(`
    INSERT INTO ai_file_metadata (
      file_id, fingerprint, document_type, title, description, extracted_text,
      keywords, entities, category, status, ai_processed, processed_at, model, processing_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_id) DO UPDATE SET
      fingerprint = excluded.fingerprint,
      document_type = excluded.document_type,
      title = excluded.title,
      description = excluded.description,
      extracted_text = excluded.extracted_text,
      keywords = excluded.keywords,
      entities = excluded.entities,
      category = excluded.category,
      status = excluded.status,
      ai_processed = excluded.ai_processed,
      processed_at = excluded.processed_at,
      model = excluded.model,
      processing_error = excluded.processing_error
  `, [
    fileId,
    metadata.fingerprint,
    metadata.documentType ?? null,
    metadata.title ?? null,
    metadata.description ?? null,
    metadata.extractedText ?? null,
    JSON.stringify(metadata.keywords ?? []),
    JSON.stringify(metadata.entities ?? []),
    metadata.category ?? null,
    metadata.status,
    metadata.status === 'completed' ? 1 : 0,
    metadata.processedAt ?? null,
    metadata.model ?? null,
    metadata.processingError ?? null,
  ])
}

export function getAiIndexStatus(selectedFolders = []) {
  const files = getAiCandidates(selectedFolders)
  const roots = aiRootPaths(selectedFolders)
  const completed = roots.length
    ? queryRows(`SELECT COUNT(*) AS count FROM ai_file_metadata m
        JOIN files f ON f.id = m.file_id
        WHERE LOWER(f.root_folder) IN (${roots.map(() => '?').join(', ')})
          AND LOWER(f.extension) IN ('.jpg', '.jpeg', '.png', '.webp', '.pdf')
          AND m.status = 'completed'`, roots)[0]?.count ?? 0
    : 0
  const failed = roots.length
    ? queryRows(`SELECT COUNT(*) AS count FROM ai_file_metadata m
        JOIN files f ON f.id = m.file_id
        WHERE LOWER(f.root_folder) IN (${roots.map(() => '?').join(', ')})
          AND LOWER(f.extension) IN ('.jpg', '.jpeg', '.png', '.webp', '.pdf')
          AND m.status = 'failed'`, roots)[0]?.count ?? 0
    : 0
  return { supportedFiles: files.length, analyzed: completed, failed, remaining: Math.max(0, files.length - completed) }
}

export function upsertIndexedFolder({ id, path: folderPath, name, lastIndexedAt, fileCount, totalSize, status }) {
  const database = getDatabase()
  const previous = getIndexedFolder(folderPath)
  const folderId = previous?.id || id || randomUUID()
  database.run(
    `
    INSERT INTO indexed_folders (id, path, name, last_indexed_at, file_count, total_size, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      id = excluded.id,
      name = excluded.name,
      last_indexed_at = excluded.last_indexed_at,
      file_count = excluded.file_count,
      total_size = excluded.total_size,
      status = excluded.status
    `,
    [
      folderId,
      folderPath,
      name,
      lastIndexedAt ?? previous?.lastIndexedAt ?? null,
      fileCount ?? previous?.fileCount ?? 0,
      totalSize ?? previous?.totalSize ?? 0,
      status ?? 'pending',
    ]
  )
  persist()
  return folderId
}

export function setFolderStatus(folderPath, status) {
  const database = getDatabase()
  database.run(
    `UPDATE indexed_folders SET status = ? WHERE path = ? COLLATE NOCASE`,
    [status, folderPath]
  )
  persist()
}

export function removeIndexedFolder(folderPath) {
  const database = getDatabase()
  database.run(`DELETE FROM files WHERE root_folder = ? COLLATE NOCASE`, [folderPath])
  database.run(`DELETE FROM indexed_folders WHERE path = ? COLLATE NOCASE`, [folderPath])
  persist()
}

export function clearFilesForFolder(folderPath) {
  const database = getDatabase()
  database.run(`DELETE FROM files WHERE root_folder = ? COLLATE NOCASE`, [folderPath])
  persist()
}

export function insertFiles(files, { persistAfter = true } = {}) {
  if (!files.length) return

  const database = getDatabase()
  database.run('BEGIN TRANSACTION')

  try {
    const stmt = database.prepare(`
      INSERT INTO files (
        folder_id, filename, full_path, extension, file_type, size,
        created_at, modified_at, parent_folder, root_folder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(full_path) DO UPDATE SET
        folder_id = excluded.folder_id,
        filename = excluded.filename,
        extension = excluded.extension,
        file_type = excluded.file_type,
        size = excluded.size,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        parent_folder = excluded.parent_folder,
        root_folder = excluded.root_folder
    `)

    for (const file of files) {
      stmt.run([
        file.folderId,
        file.filename,
        file.fullPath,
        file.extension,
        file.fileType,
        file.size,
        file.createdAt,
        file.modifiedAt,
        file.parentFolder,
        file.rootFolder,
      ])
    }

    const pendingAi = database.prepare(`
      INSERT OR IGNORE INTO ai_file_metadata (file_id, fingerprint, status)
      SELECT id, '', 'pending' FROM files WHERE full_path = ? COLLATE NOCASE
        AND LOWER(extension) IN ('.jpg', '.jpeg', '.png', '.webp', '.pdf')
    `)
    for (const file of files) pendingAi.run([file.fullPath])
    pendingAi.free()

    stmt.free()
    database.run('COMMIT')
    if (persistAfter) persist()
  } catch (error) {
    try {
      database.run('ROLLBACK')
    } catch {
      // Ignore rollback errors when the transaction never started.
    }
    throw error
  }
}

export function getIndexedFolders() {
  const database = getDatabase()
  const result = database.exec(`
    SELECT id, path, name, last_indexed_at, file_count, total_size, status
    FROM indexed_folders
    ORDER BY name COLLATE NOCASE
  `)

  if (!result.length) return []

  const { columns, values } = result[0]
  return values.map((row) => {
    const item = {}
    columns.forEach((col, i) => {
      item[col] = row[i]
    })
    return {
      id: item.id,
      path: item.path,
      name: item.name,
      lastIndexedAt: item.last_indexed_at,
      fileCount: item.file_count ?? 0,
      totalSize: item.total_size ?? 0,
      status: item.status,
    }
  })
}

export function getIndexStats() {
  const database = getDatabase()
  const fileCountResult = database.exec(`SELECT COUNT(*) AS count FROM files`)
  const folderCountResult = database.exec(`SELECT COUNT(*) AS count FROM indexed_folders`)

  const totalFiles = fileCountResult.length ? fileCountResult[0].values[0][0] : 0
  const totalFolders = folderCountResult.length ? folderCountResult[0].values[0][0] : 0
  const sizeResult = database.exec('SELECT COALESCE(SUM(size), 0) AS total_size FROM files')
  const totalSize = sizeResult.length ? sizeResult[0].values[0][0] : 0

  return { totalFiles, totalFolders, totalSize }
}

export function getFileCountForFolder(folderPath) {
  const database = getDatabase()
  const stmt = database.prepare(
    `SELECT COUNT(*) AS count FROM files WHERE root_folder = ? COLLATE NOCASE`
  )
  stmt.bind([folderPath])
  let count = 0
  if (stmt.step()) {
    count = stmt.getAsObject().count
  }
  stmt.free()
  return count
}

export function getFileSizeForFolder(folderPath) {
  const database = getDatabase()
  const stmt = database.prepare(
    `SELECT COALESCE(SUM(size), 0) AS total_size FROM files WHERE root_folder = ? COLLATE NOCASE`
  )
  stmt.bind([folderPath])
  let totalSize = 0
  if (stmt.step()) totalSize = stmt.getAsObject().total_size ?? 0
  stmt.free()
  return totalSize
}

export function getSampleFiles(limit = 20) {
  const database = getDatabase()
  const stmt = database.prepare(`
    SELECT folder_id, filename, full_path, extension, file_type, size,
           created_at, modified_at, parent_folder, root_folder
    FROM files
    ORDER BY filename COLLATE NOCASE
    LIMIT ?
  `)
  stmt.bind([limit])
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

export function clearAllIndex() {
  const database = getDatabase()
  database.run('DELETE FROM files')
  database.run('DELETE FROM indexed_folders')
  persist()
}

export function closeDatabase() {
  if (db) {
    persist()
    db.close()
    db = null
  }
}
