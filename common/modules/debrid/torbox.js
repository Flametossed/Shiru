import Debug from 'debug'
const debug = Debug('ui:debrid:torbox')

const BASE = 'https://api.torbox.app'
const VERSION = 'v1'

/**
 * Minimal TorBox REST client (renderer-side).
 * Docs: https://api-docs.torbox.app  (base https://api.torbox.app, version v1)
 *
 * Every endpoint returns the standard envelope:
 *   { success: boolean, error: string|null, detail: string, data: any }
 * `_unwrap` throws on failure and returns `data`.
 */
export default class TorBox {
  /** @param {string} apiKey - TorBox API key. */
  constructor(apiKey) {
    this.apiKey = (apiKey || '').trim()
  }

  get headers() {
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  /**
   * @param {Response} res
   * @returns {Promise<any>} the `data` field of the response envelope.
   */
  async _unwrap(res) {
    if (res.status === 403) throw new Error('Authentication failed. Check your TorBox API key.')
    let body
    try {
      body = await res.json()
    } catch {
      throw new Error(`TorBox returned an invalid response (HTTP ${res.status}).`)
    }
    if (body?.success === false || (!res.ok && body?.data == null)) {
      throw new Error(body?.detail || body?.error || `TorBox request failed (HTTP ${res.status}).`)
    }
    return body?.data
  }

  /**
   * Validates the API key by fetching the current user.
   * @returns {Promise<any>}
   */
  async checkUser() {
    const res = await fetch(`${BASE}/${VERSION}/api/user/me?settings=false`, { headers: this.headers })
    return this._unwrap(res)
  }

  /**
   * Checks whether one or more info hashes are already cached on TorBox.
   * @param {string|string[]} hashes - Info hash(es).
   * @returns {Promise<any[]>} List of cached entries (may be empty).
   */
  async checkCached(hashes) {
    const list = Array.isArray(hashes) ? hashes.join(',') : hashes
    const params = new URLSearchParams({ hash: list, format: 'list', list_files: 'false' })
    const res = await fetch(`${BASE}/${VERSION}/api/torrents/checkcached?${params}`, { headers: this.headers })
    const data = await this._unwrap(res)
    return Array.isArray(data) ? data : (data ? Object.values(data) : [])
  }

  /**
   * Adds a magnet to the account. Instant when the torrent is cached, otherwise queued for download.
   * @param {string} magnet - Magnet URI or info hash.
   * @returns {Promise<any>} `{ torrent_id, hash, queued_id, ... }`
   */
  async createTorrent(magnet) {
    const form = new FormData()
    form.append('magnet', magnet)
    form.append('seed', '3') // 1=auto, 2=always seed, 3=never seed — we only stream.
    form.append('allow_zip', 'false')
    const res = await fetch(`${BASE}/${VERSION}/api/torrents/createtorrent`, { method: 'POST', headers: this.headers, body: form })
    const data = await this._unwrap(res)
    debug('createTorrent:', JSON.stringify(data))
    return data
  }

  /**
   * Fetches a single torrent (with its files) by id, or the full list when no id is given.
   * @param {number|string} [id] - TorBox torrent id.
   * @returns {Promise<any>} Torrent object, or array of torrents when no id.
   */
  async getTorrent(id) {
    const params = new URLSearchParams({ bypass_cache: 'true' })
    if (id != null) params.set('id', String(id))
    const res = await fetch(`${BASE}/${VERSION}/api/torrents/mylist?${params}`, { headers: this.headers })
    return this._unwrap(res)
  }

  /**
   * Requests a time-limited (~3h) direct download URL for a single file.
   * @param {number|string} torrentId - TorBox torrent id.
   * @param {number|string} fileId - File id within the torrent.
   * @returns {Promise<string>} Direct HTTPS URL.
   */
  async requestDownload(torrentId, fileId) {
    const params = new URLSearchParams({ token: this.apiKey, torrent_id: String(torrentId), file_id: String(fileId), redirect: 'false' })
    const res = await fetch(`${BASE}/${VERSION}/api/torrents/requestdl?${params}`, { headers: this.headers })
    const data = await this._unwrap(res)
    // `data` is the URL string, or an object wrapping it depending on API version.
    return typeof data === 'string' ? data : (data?.url || data?.download || data)
  }
}
