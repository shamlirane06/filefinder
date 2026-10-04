import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf'])
const PREVIEW_SIZES = {
  thumbnail: { width: 320, height: 240 },
  large: { width: 900, height: 700 },
}

export function createFilePreviewService({ thumbnailFromPath, cacheDirectory }) {
  const inFlight = new Map()

  async function getPreview({ filePath, size = 'thumbnail' }) {
    const extension = path.extname(String(filePath || '')).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) return { status: 'unsupported' }
    const dimensions = PREVIEW_SIZES[size] || PREVIEW_SIZES.thumbnail
    let stat
    try {
      stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return { status: 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }

    const version = `${path.resolve(filePath).toLowerCase()}\n${stat.size}\n${stat.mtimeMs}\n${dimensions.width}x${dimensions.height}`
    const cacheName = `${createHash('sha256').update(version).digest('hex')}.png`
    const cachePath = path.join(cacheDirectory, cacheName)
    try {
      const cached = await fs.promises.readFile(cachePath)
      return { status: 'ready', dataUrl: `data:image/png;base64,${cached.toString('base64')}` }
    } catch {
      // Cache miss; generate the preview below.
    }

    if (inFlight.has(cachePath)) return inFlight.get(cachePath)
    const generation = (async () => {
      try {
        const image = await thumbnailFromPath(filePath, dimensions)
        if (!image || image.isEmpty?.()) return { status: 'unavailable' }
        const sourceSize = image.getSize()
        const scale = Math.min(1, dimensions.width / sourceSize.width, dimensions.height / sourceSize.height)
        const boundedImage = scale < 1
          ? image.resize({
            width: Math.max(1, Math.round(sourceSize.width * scale)),
            height: Math.max(1, Math.round(sourceSize.height * scale)),
            quality: 'good',
          })
          : image
        const png = boundedImage.toPNG()
        await fs.promises.mkdir(cacheDirectory, { recursive: true })
        await fs.promises.writeFile(cachePath, png)
        return { status: 'ready', dataUrl: `data:image/png;base64,${png.toString('base64')}` }
      } catch {
        return { status: 'unavailable' }
      } finally {
        inFlight.delete(cachePath)
      }
    })()
    inFlight.set(cachePath, generation)
    return generation
  }

  return { getPreview }
}

export { PREVIEW_SIZES, SUPPORTED_EXTENSIONS }
