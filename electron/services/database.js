import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
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

  db.run(`
    CREATE TABLE IF NOT EXISTS indexed_folders (
      path TEXT PRIMARY KEY COLLATE NOCASE,
      name TEXT NOT NULL,
      last_indexed_at TEXT,
      file_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
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

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_root ON files(root_folder)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)
  `)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension)
  `)

  // A crash mid-scan can leave folders stuck in "indexing".
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
    SELECT path, name, last_indexed_at, file_count, status
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
    path: row.path,
    name: row.name,
    lastIndexedAt: row.last_indexed_at,
    fileCount: row.file_count ?? 0,
    status: row.status,
  }
}

export function upsertIndexedFolder({ path: folderPath, name, lastIndexedAt, fileCount, status }) {
  const database = getDatabase()
  database.run(
    `
    INSERT INTO indexed_folders (path, name, last_indexed_at, file_count, status)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      last_indexed_at = excluded.last_indexed_at,
      file_count = excluded.file_count,
      status = excluded.status
    `,
    [folderPath, name, lastIndexedAt ?? null, fileCount ?? 0, status ?? 'pending']
  )
  persist()
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
        filename, full_path, extension, file_type, size,
        created_at, modified_at, parent_folder, root_folder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(full_path) DO UPDATE SET
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
    SELECT path, name, last_indexed_at, file_count, status
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
      path: item.path,
      name: item.name,
      lastIndexedAt: item.last_indexed_at,
      fileCount: item.file_count ?? 0,
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

  return { totalFiles, totalFolders }
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

export function getSampleFiles(limit = 20) {
  const database = getDatabase()
  const stmt = database.prepare(`
    SELECT filename, full_path, extension, file_type, size,
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
