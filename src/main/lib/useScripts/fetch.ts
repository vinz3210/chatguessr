import { net } from 'electron'

// Downloads for install/update time. Uses Electron's `net` module so requests
// go through Chromium's stack (proxies, redirects, TLS) rather than Node's.

export type FetchedAsset = {
  data: Buffer
  mimeType: string
  finalUrl: string
}

const DEFAULT_MIME = 'application/octet-stream'

export async function fetchAsset(url: string): Promise<FetchedAsset> {
  const response = await net.fetch(url, { credentials: 'omit', redirect: 'follow' })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }

  const contentType = response.headers.get('content-type') ?? DEFAULT_MIME

  return {
    data: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType.split(';')[0].trim() || DEFAULT_MIME,
    finalUrl: response.url || url
  }
}

export async function fetchText(url: string): Promise<string> {
  const { data } = await fetchAsset(url)
  return data.toString('utf8')
}
