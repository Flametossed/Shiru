import Metadata from 'matroska-metadata'
import { arr2hex, hex2bin } from 'uint8-util'
import { fontRx } from '@/modules/util.js'
import { settings } from '@/modules/settings.js'
import Debug from 'debug'
const debug = Debug('ui:debrid:metadata')

/**
 * Builds a lazy Blob-like object backed by HTTP range requests to a direct URL.
 * matroska-metadata reads via `file.slice(start).stream()[Symbol.asyncIterator]()`,
 * so metadata (tracks/fonts/chapters) only fetches the byte ranges it needs.
 *
 * @param {string} url - Direct (debrid) HTTPS URL.
 * @param {number} size - Total file size in bytes.
 * @param {string} name - File name (used only for the `.mkv`/`.webm` gate).
 * @returns {{ name: string, size: number, slice: Function, stream: Function, [Symbol.asyncIterator]: Function }}
 */
function rangeFile(url, size, name) {
  // Returns a self-iterable async iterator (both `next` and `[Symbol.asyncIterator]`),
  // because ebml-iterator consumes it with `for await (…of stream)`.
  const makeStream = (start, end) => {
    let reader = null
    let finished = false
    const it = {
      async next() {
        if (finished) return { done: true, value: undefined }
        if (!reader) {
          const headers = {}
          if (start != null || end != null) headers.Range = `bytes=${start ?? 0}-${end != null ? end - 1 : ''}`
          const res = await fetch(url, { headers })
          if (!res.ok && res.status !== 206) throw new Error(`Range fetch failed: HTTP ${res.status}`)
          reader = res.body.getReader()
        }
        const { done, value } = await reader.read()
        if (done) {
          finished = true
          return { done: true, value: undefined }
        }
        return { done: false, value }
      },
      async return() {
        finished = true
        try { await reader?.cancel() } catch { /* ignore */ }
        return { done: true, value: undefined }
      },
      [Symbol.asyncIterator]() { return it }
    }
    return it
  }
  const slice = (start = 0, end = size) => ({ stream: () => makeStream(start, end) })
  return {
    name,
    size,
    slice,
    stream: () => makeStream(0, size),
    [Symbol.asyncIterator]({ start = 0 } = {}) { return makeStream(start, size) }
  }
}

/**
 * Renderer-side Matroska parser for debrid streams. Mirrors the WebTorrent worker's
 * `Metadata` class but reads the file over HTTP range requests and delivers results
 * through direct callbacks (into the existing `Subtitles` instance) instead of IPC.
 *
 * Tracks, fonts and chapters are cheap (range reads via the SeekHead). Subtitle cues
 * are scattered across clusters, so extracting them streams the whole file once — this
 * is gated behind the `debridSubtitles` setting.
 */
export default class DebridMetadata {
  destroyed = false

  /**
   * @param {{ name: string, size: number, url: string }} file - Debrid video file.
   * @param {{ onTracks?: Function, onSubtitle?: Function, onFile?: Function, onChapters?: Function }} callbacks
   */
  constructor(file, { onTracks, onSubtitle, onFile, onChapters } = {}) {
    this.file = file
    if (!/\.(mkv|webm)$/i.test(file.name || '')) {
      debug('Unsupported container for embedded metadata:', file.name)
      return
    }
    if (!file.size || !file.url) {
      debug('Missing size/url; cannot parse metadata for', file.name)
      return
    }
    debug('Initializing debrid parser for:', file.name)
    this.blob = rangeFile(file.url, file.size, file.name)
    this.metadata = new Metadata(this.blob)

    this.metadata.on('subtitle', (subtitle, trackNumber) => {
      if (this.destroyed) return
      onSubtitle?.({ subtitle, trackNumber })
    })

    this.metadata.getTracks().then(tracks => {
      if (this.destroyed || !tracks?.length) return
      debug(`Found ${tracks.length} subtitle track(s)`)
      onTracks?.(tracks)
      if (settings.value.debridSubtitles !== false) this._extractSubtitles()
    }).catch(e => debug('getTracks failed:', e?.message || e))

    this.metadata.getChapters().then(chapters => {
      if (this.destroyed || !chapters?.length) return
      debug(`Found ${chapters.length} chapters`)
      onChapters?.(chapters)
    }).catch(e => debug('getChapters failed:', e?.message || e))

    this.metadata.getAttachments().then(files => {
      if (this.destroyed) return
      debug(`Found ${files?.length} attachments`)
      for (const attachment of files || []) {
        if (fontRx.test(attachment.filename) || attachment.mimetype?.toLowerCase().includes('font')) {
          onFile?.(hex2bin(arr2hex(attachment.data)))
        }
      }
    }).catch(e => debug('getAttachments failed:', e?.message || e))
  }

  /** Streams the whole file once to emit every subtitle cue (bandwidth-heavy; setting-gated). */
  async _extractSubtitles() {
    try {
      debug('Extracting embedded subtitles (full-file scan)…')
      await this.metadata.parseFile()
      debug('Subtitle extraction complete for', this.file?.name)
    } catch (e) {
      if (!this.destroyed) debug('Subtitle extraction failed:', e?.message || e)
    }
  }

  destroy() {
    if (this.destroyed) return
    debug('Destroying debrid parser')
    this.destroyed = true
    this.metadata?.removeAllListeners?.()
    this.metadata?.destroy?.()
    this.metadata = null
    this.blob = null
    this.file = null
  }
}
