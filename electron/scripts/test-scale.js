import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { closeDatabase, getDashboardData, initDatabase } from '../services/database.js'
import { indexFolder } from '../services/fileIndexer.js'
import { searchFiles } from '../services/fileSearch.js'
import { createFileAssistantService } from '../services/fileAssistant.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-scale-'))
const profile = path.join(root, 'profile')
const selectedRoot = path.join(root, 'selected')
app.whenReady().then(async () => {
  let passed = false
  try {
    app.setPath('userData', profile)
    fs.mkdirSync(profile, { recursive: true })
    fs.mkdirSync(selectedRoot, { recursive: true })
    for (let index = 0; index < 1200; index += 1) {
      fs.writeFileSync(path.join(selectedRoot, `report-${String(index).padStart(4, '0')}.pdf`), 'fixture')
    }
    await initDatabase()
    const started = Date.now()
    await indexFolder({ name: 'Scale fixture', path: selectedRoot })
    const indexingMs = Date.now() - started
    const selected = [{ name: 'Scale fixture', path: selectedRoot }]
    const search = searchFiles({ query: 'report-1199.pdf' }, selected)
    const dashboard = getDashboardData(selected)
    let assistantCandidateCount = 0
    const assistant = createFileAssistantService({
      provider: {
        config: { configured: true },
        interpretQuery: async () => ({ intent: { keywords: [], fileTypes: ['PDF'], dateModified: 'any' } }),
        answerFileQuestion: async ({ candidates }) => {
          assistantCandidateCount = candidates.length
          return { answer: 'The indexed records contain matching PDFs.', sourceIds: [1] }
        },
      },
    })
    const response = await assistant.answerQuestion({ question: 'Show PDFs', selectedFolders: selected })
    const checks = [search.total === 1 && search.results[0]?.filename === 'report-1199.pdf',
      dashboard.stats.totalFiles === 1200 && dashboard.recentFiles.length === 6,
      response.files.length === 1 && assistantCandidateCount <= 8]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, records: 1200, checks: checks.length, failedChecks: checks.flatMap((ok, index) => ok ? [] : [index + 1]), indexingMs, searchCount: search.total, dashboardRows: dashboard.recentFiles.length, assistantCandidates: assistantCandidateCount }, null, 2))
  } catch (error) { console.error('FAIL:', error) }
  finally { closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); app.exit(passed ? 0 : 1) }
})
