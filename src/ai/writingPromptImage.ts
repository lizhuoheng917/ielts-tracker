import {
  MAX_WRITING_PROMPT_IMAGE_BYTES,
  type WritingPromptImageMediaType,
} from './writingFeedback'

const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_EDGE = 1_600
const ACCEPTED_IMAGE_TYPES = new Set<WritingPromptImageMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export interface PreparedWritingPromptImage {
  mediaType: WritingPromptImageMediaType
  dataUrl: string
  byteLength: number
  width: number
  height: number
  fileName: string
}

export class WritingPromptImageError extends Error {
  readonly code: 'UNSUPPORTED_TYPE' | 'SOURCE_TOO_LARGE' | 'DECODE_FAILED' | 'COMPRESS_FAILED'

  constructor(code: WritingPromptImageError['code'], message: string) {
    super(message)
    this.name = 'WritingPromptImageError'
    this.code = code
  }
}

function boundedFileName(value: string): string {
  const normalized = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && codePoint !== 127
    })
    .join('')
    .trim()
  return (normalized || 'writing-prompt').slice(0, 120)
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new WritingPromptImageError('DECODE_FAILED', '无法读取这张图片。'))
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new WritingPromptImageError('DECODE_FAILED', '无法读取这张图片。'))
    reader.readAsDataURL(blob)
  })
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Safari versions without the orientation option use the fallback below.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new WritingPromptImageError('DECODE_FAILED', '无法识别这张图片。'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new WritingPromptImageError('COMPRESS_FAILED', '无法压缩这张图片。')),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Produces a bounded, request-only image. The caller keeps it in component
 * memory; drafts and generated report records never receive the data URL.
 */
export async function prepareWritingPromptImage(file: File): Promise<PreparedWritingPromptImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type as WritingPromptImageMediaType)) {
    throw new WritingPromptImageError('UNSUPPORTED_TYPE', '请选择 JPG、PNG 或 WebP 图片。')
  }
  if (file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new WritingPromptImageError('SOURCE_TOO_LARGE', '原图不能超过 10 MB。')
  }
  const decoded = await decodeImage(file)
  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new WritingPromptImageError('DECODE_FAILED', '图片尺寸无效。')
    }
    if (
      file.size <= MAX_WRITING_PROMPT_IMAGE_BYTES
      && ACCEPTED_IMAGE_TYPES.has(file.type as WritingPromptImageMediaType)
    ) {
      return {
        mediaType: file.type as WritingPromptImageMediaType,
        dataUrl: await readAsDataUrl(file),
        byteLength: file.size,
        width: decoded.width,
        height: decoded.height,
        fileName: boundedFileName(file.name),
      }
    }

    const initialScale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height))
    let width = Math.max(1, Math.round(decoded.width * initialScale))
    let height = Math.max(1, Math.round(decoded.height * initialScale))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new WritingPromptImageError('COMPRESS_FAILED', '当前浏览器无法压缩图片。')

    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = width
      canvas.height = height
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(decoded.source, 0, 0, width, height)
      const quality = Math.max(0.48, 0.82 - attempt * 0.06)
      const blob = await canvasBlob(canvas, quality)
      if (blob.size <= MAX_WRITING_PROMPT_IMAGE_BYTES) {
        return {
          mediaType: 'image/jpeg',
          dataUrl: await readAsDataUrl(blob),
          byteLength: blob.size,
          width,
          height,
          fileName: boundedFileName(file.name),
        }
      }
      width = Math.max(640, Math.round(width * 0.84))
      height = Math.max(480, Math.round(height * 0.84))
    }
    throw new WritingPromptImageError('COMPRESS_FAILED', '图片压缩后仍然过大，请裁剪题目区域后重试。')
  } finally {
    decoded.close()
  }
}
