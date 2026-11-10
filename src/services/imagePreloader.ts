type ImageCacheEntry = {
  image: HTMLImageElement
  promise: Promise<boolean>
}

const imageCache = new Map<string, ImageCacheEntry>()

export function preloadImage(url: string) {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) return Promise.resolve(false)

  const cached = imageCache.get(normalizedUrl)
  if (cached) return cached.promise

  const image = new Image()
  image.decoding = 'async'

  const promise = new Promise<boolean>((resolve) => {
    image.onload = () => {
      void image.decode().catch(() => undefined).finally(() => resolve(true))
    }
    image.onerror = () => {
      imageCache.delete(normalizedUrl)
      resolve(false)
    }
  })

  imageCache.set(normalizedUrl, { image, promise })
  image.src = normalizedUrl

  return promise
}

export async function preloadImages(
  urls: readonly string[],
  onProgress?: (loaded: number, total: number, failed: number) => void,
) {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)))
  let loaded = 0
  let failed = 0
  onProgress?.(loaded, uniqueUrls.length, failed)

  await Promise.all(uniqueUrls.map(async (url) => {
    const succeeded = await preloadImage(url)
    if (succeeded) loaded += 1
    else failed += 1
    onProgress?.(loaded, uniqueUrls.length, failed)
  }))

  return { loaded, total: uniqueUrls.length, failed }
}
