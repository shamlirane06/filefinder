import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createFilePreviewService } from '../services/filePreview.js'
import { handlePreviewKeyDown } from '../../src/components/previewKeyboard.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filefinder-preview-'))

app.whenReady().then(async () => {
  let passed = false
  try {
    const calls = []
    const pngBytes = Buffer.from('mock-png-preview')
    const service = createFilePreviewService({
      cacheDirectory: path.join(tempRoot, 'cache'),
      async thumbnailFromPath(filePath, dimensions) {
        calls.push({ filePath, dimensions })
        return {
          isEmpty: () => false,
          getSize: () => ({ width: 1600, height: 1200 }),
          resize: (size) => {
            if (size.width > dimensions.width || size.height > dimensions.height) throw new Error('Preview exceeded size bound')
            return { toPNG: () => pngBytes }
          },
          toPNG: () => pngBytes,
        }
      },
    })

    const samples = {}
    for (const extension of ['jpg', 'png', 'webp', 'pdf']) {
      const filePath = path.join(tempRoot, `sample.${extension}`)
      fs.writeFileSync(filePath, 'fixture')
      samples[extension] = filePath
    }
    const jpg = await service.getPreview({ filePath: samples.jpg })
    const png = await service.getPreview({ filePath: samples.png })
    const webp = await service.getPreview({ filePath: samples.webp })
    const pdf = await service.getPreview({ filePath: samples.pdf })

    const callsAfterSupported = calls.length
    const unsupportedPath = path.join(tempRoot, 'sample.docx')
    fs.writeFileSync(unsupportedPath, 'fixture')
    const unsupported = await service.getPreview({ filePath: unsupportedPath })
    const missing = await service.getPreview({ filePath: path.join(tempRoot, 'missing.jpg') })
    const callsAfterMissingAndUnsupported = calls.length

    const cachedFirst = await service.getPreview({ filePath: samples.jpg })
    const cacheCallsBeforeRepeat = calls.length
    const cachedSecond = await service.getPreview({ filePath: samples.jpg })
    const cacheHit = calls.length === cacheCallsBeforeRepeat
    await new Promise((resolve) => setTimeout(resolve, 20))
    const changedTime = Date.now() + 10000
    fs.utimesSync(samples.jpg, changedTime / 1000, changedTime / 1000)
    const changed = await service.getPreview({ filePath: samples.jpg })

    const modalSource = fs.readFileSync(new URL('../../src/components/PreviewModal.jsx', import.meta.url), 'utf8')
    let escapeClosed = false
    let prevented = false
    handlePreviewKeyDown({ key: 'Escape', preventDefault: () => { prevented = true } }, () => { escapeClosed = true })

    const checks = [
      jpg.status === 'ready' && jpg.dataUrl.startsWith('data:image/png;base64,'),
      png.status === 'ready' && png.dataUrl.startsWith('data:image/png;base64,'),
      webp.status === 'ready' && webp.dataUrl.startsWith('data:image/png;base64,'),
      pdf.status === 'ready' && pdf.dataUrl.startsWith('data:image/png;base64,'),
      unsupported.status === 'unsupported' && callsAfterSupported === 4,
      missing.status === 'unavailable' && callsAfterMissingAndUnsupported === callsAfterSupported,
      cachedFirst.status === 'ready' && cachedSecond.status === 'ready' && cacheHit,
      changed.status === 'ready' && calls.length === cacheCallsBeforeRepeat + 1,
      modalSource.includes('role="dialog"') && modalSource.includes('aria-modal="true"') && modalSource.includes('aria-label="Close preview"'),
      escapeClosed && prevented,
    ]
    passed = checks.every(Boolean)
    console.log(JSON.stringify({ passed, checks: checks.length, results: checks }, null, 2))
  } catch (error) {
    console.error('FAIL:', error)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    app.exit(passed ? 0 : 1)
  }
})
