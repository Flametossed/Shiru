import { settings } from '@/modules/settings.js'
import { videoRx, subRx, sleep } from '@/modules/util.js'
import { hash as u8hash, text2arr } from 'uint8-util'
import TorBox from './torbox.js'
import Debug from 'debug'
const debug = Debug('ui:debrid')

/**
 * Whether debrid streaming is currently active (enabled, provider supported, key set).
 * @returns {boolean}
 */
export function debridEnabled() {
  return !!(settings.value.debridEnabled && settings.value.debridProvider === 'torbox' && settings.value.debridApiKey?.trim())
}

/**
 * Extracts a 40-char hex info hash from a magnet URI, if present.
 * @param {string} input
 * @returns {string} Lowercase hex hash, or ''.
 */
function extractHash(input) {
  const match = /urn:btih:([a-fA-F0-9]{40})/.exec(input || '')
  return match ? match[1].toLowerCase() : ''
}

/**
 * Normalizes a torrent id (magnet, hex hash, or magnet string) into a magnet URI TorBox accepts.
 * @param {string} torrentID
 * @param {string} [hash]
 * @returns {string}
 */
function toMagnet(torrentID, hash) {
  const id = String(torrentID || '')
  if (id.startsWith('magnet:')) return id
  const hex = /^[a-fA-F0-9]{40}$/.test(id) ? id : (hash && /^[a-fA-F0-9]{40}$/.test(hash) ? hash : '')
  if (hex) return `magnet:?xt=urn:btih:${hex.toLowerCase()}`
  return id
}

/** @param {any} file @returns {string} basename of a TorBox file entry. */
function basename(file) {
  return file.short_name || String(file.name || '').split(/[\\/]/).pop() || String(file.name || '')
}

const MIME = { mkv: 'video/x-matroska', mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime', ogv: 'video/ogg', ts: 'video/mp2t', m4v: 'video/x-m4v' }
/** @param {string} name @returns {string} best-guess MIME type from extension. */
function guessType(name) {
  return MIME[String(name).split('.').pop()?.toLowerCase()] || 'video/x-matroska'
}

/**
 * Deterministic file hash. Matches worker `makeHash` (sha1 hex) when Web Crypto is available,
 * otherwise falls back to a non-crypto hash so this never throws in an insecure context.
 * @param {string} str
 * @returns {Promise<string>}
 */
async function makeFileHash(str) {
  try {
    return await u8hash(text2arr(str), 'hex', 'sha-1')
  } catch {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i)
      h1 = Math.imul(h1 ^ ch, 2654435761)
      h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  }
}

/**
 * Polls TorBox until the torrent's files are present on their servers (instant when cached).
 * @param {TorBox} client
 * @param {string} infoHash
 * @param {number|string|null} torrentId
 * @param {number} timeoutMs
 * @param {(torrent: any) => void} [onProgress]
 * @returns {Promise<any>} The ready torrent object (with `files`).
 */
async function waitForFiles(client, infoHash, torrentId, timeoutMs, onProgress) {
  const start = Date.now()
  let id = torrentId
  while (Date.now() - start < timeoutMs) {
    let torrent = null
    try {
      if (id != null) {
        const data = await client.getTorrent(id)
        torrent = Array.isArray(data) ? data.find(t => String(t.id) === String(id)) : data
      }
      if (!torrent && infoHash) {
        const data = await client.getTorrent()
        const list = Array.isArray(data) ? data : (data ? [data] : [])
        torrent = list.find(t => String(t.hash || '').toLowerCase() === infoHash)
        if (torrent) id = torrent.id
      }
    } catch (e) {
      debug('poll error:', e?.message || e)
    }
    if (torrent && (torrent.download_present || torrent.download_finished) && torrent.files?.length) return torrent
    if (torrent) onProgress?.(torrent)
    await sleep(2000)
  }
  throw new Error('Timed out waiting for TorBox to prepare this torrent.')
}

/**
 * Resolves a torrent through TorBox into player-ready file objects with direct stream URLs.
 * The returned shape mirrors the WebTorrent worker's file objects so the player/MediaHandler
 * need no changes. Throws on any failure so the caller can fall back to WebTorrent.
 *
 * @param {string} torrentID - Magnet URI, hex info hash, or magnet string.
 * @param {string} [hash] - Known info hash (from the search result), if any.
 * @param {{ onStatus?: (msg: string) => void }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function resolveFiles(torrentID, hash, { onStatus } = {}) {
  const key = settings.value.debridApiKey?.trim()
  if (!key) throw new Error('No TorBox API key set.')
  const client = new TorBox(key)
  const magnet = toMagnet(torrentID, hash)
  if (!magnet.startsWith('magnet:')) throw new Error('Debrid only supports magnet links and info hashes.')
  const infoHash = (hash && /^[a-fA-F0-9]{40}$/.test(hash) ? hash.toLowerCase() : extractHash(magnet))
  const timeoutMs = Math.max(10, Number(settings.value.debridTimeout) || 60) * 1000

  onStatus?.('Adding to TorBox…')
  const created = await client.createTorrent(magnet)
  const torrentId = created?.torrent_id ?? created?.id ?? created?.queued_id ?? null
  debug(`created torrent id=${torrentId} hash=${infoHash}`)

  onStatus?.('TorBox is preparing this torrent…')
  const torrent = await waitForFiles(client, infoHash, torrentId, timeoutMs, t => {
    const pct = Math.round((t.progress || 0) * 100)
    onStatus?.(pct ? `TorBox downloading… ${pct}%` : 'TorBox is preparing this torrent…')
  })

  const hashOut = String(torrent.hash || infoHash || '').toLowerCase()
  const videoFiles = (torrent.files || []).filter(f => videoRx.test(basename(f)))
  if (!videoFiles.length) throw new Error('No playable video files found in this torrent.')

  onStatus?.('Fetching stream links…')
  const files = []
  for (const f of videoFiles) {
    const name = basename(f)
    let url
    try {
      url = await client.requestDownload(torrent.id, f.id)
    } catch (e) {
      debug('requestDownload failed for', name, e?.message || e)
      continue
    }
    if (!url) continue
    files.push({
      infoHash: hashOut,
      fileHash: await makeFileHash(`${hashOut}:${name}:${f.size}`),
      torrent_name: torrent.name,
      name,
      type: f.mimetype || guessType(name),
      size: f.size,
      path: f.name || name,
      url,
      debrid: true,
      fileId: f.id
    })
  }
  if (!files.length) throw new Error('TorBox did not return any stream links.')

  // Resolve sidecar subtitle files (external .ass/.srt/… shipped alongside the video) and
  // attach each to the video file(s) it belongs to, mirroring the worker's findSubtitleFiles:
  // when there's a single video, every subtitle matches; otherwise match by video name.
  const subEntries = (torrent.files || []).filter(f => subRx.test(basename(f)))
  if (subEntries.length) {
    const singleVideo = files.length === 1
    const resolvedSubs = []
    for (const f of subEntries) {
      const name = basename(f)
      try {
        const url = await client.requestDownload(torrent.id, f.id)
        if (url) resolvedSubs.push({ name, url })
      } catch (e) {
        debug('sub requestDownload failed for', name, e?.message || e)
      }
    }
    for (const file of files) {
      const videoBase = file.name.slice(0, file.name.lastIndexOf('.')) || file.name
      file.subFiles = resolvedSubs.filter(sub => singleVideo || sub.name.includes(videoBase))
    }
    debug(`resolved ${resolvedSubs.length} sidecar subtitle file(s)`)
  }

  debug(`resolved ${files.length} debrid files for ${hashOut}`)
  return files
}

/**
 * Validates a TorBox API key.
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, error?: string, plan?: any }>}
 */
export async function testKey(apiKey) {
  try {
    const user = await new TorBox(apiKey).checkUser()
    return { ok: true, plan: user?.plan }
  } catch (e) {
    return { ok: false, error: e?.message || 'Connection failed.' }
  }
}
