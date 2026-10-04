import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { closeDatabase, getDashboardData, getDatabase, initDatabase } from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-dashboard-'))
const profile = path.join(root, 'profile')
const selectedPath = path.join(root, 'selected')
const ignoredPath = path.join(root, 'ignored')
function write(fullPath) { fs.mkdirSync(path.dirname(fullPath), { recursive: true }); fs.writeFileSync(fullPath, 'dashboard test') }

app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profile)
    fs.mkdirSync(profile, { recursive: true })
    const pdf = path.join(selectedPath, 'report.pdf')
    const image = path.join(selectedPath, 'photo.jpg')
    write(pdf); write(image); write(path.join(ignoredPath, 'hidden.pdf'))
    await initDatabase()
    await indexFolder({ name: 'Selected', path: selectedPath })
    await indexFolder({ name: 'Ignored', path: ignoredPath })
    const db = getDatabase()
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', ['2026-10-02T12:00:00.000Z', pdf])
    db.run('UPDATE files SET modified_at = ? WHERE full_path = ?', ['2026-10-03T12:00:00.000Z', image])
    const empty = getDashboardData([])
    const data = getDashboardData([{ path: selectedPath }])
    const checks = [empty.stats.totalFiles === 0 && empty.stats.totalFolders === 0 && empty.recentFiles.length === 0,
      data.stats.totalFiles === 2, data.stats.images === 1, data.stats.pdfs === 1,
      data.stats.totalFolders === 1, data.recentFiles.length === 2 && data.recentFiles[0].fullPath === image,
      !data.recentFiles.some((file) => file.fullPath.includes('hidden.pdf'))]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, checks: checks.length, failedChecks: checks.flatMap((ok, index) => ok ? [] : [index + 1]) }, null, 2))
  } catch (error) { console.error('FAIL:', error) }
  finally { closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); app.exit(passed ? 0 : 1) }
})
