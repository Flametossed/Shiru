import { channel } from 'bridge'
import { statfs } from 'fs/promises'
import { env, stdout, stderr } from 'node:process'

async function storageQuota (directory) {
  const { bsize, bavail } = await statfs(directory)
  return bsize * bavail
}

let client
let heartbeatId
function setHeartBeat() {
  heartbeatId = setInterval(() => channel.send('webtorrent-heartbeat'), 500)
}

// Intercept stream writes in webtorrent.js and forward them over IPC for logging.
const originalStderrWrite = stderr.write.bind(stderr)
stderr.write = (data, ...args) => {
  originalStderrWrite(data, ...args)
  channel.send('torrent:log', { level: 'error', message: typeof data === 'string' ? data.trim() : data.toString().trim() })
}
const originalStdoutWrite = stdout.write.bind(stdout)
stdout.write = (data, ...args) => {
  originalStdoutWrite(data, ...args)
  channel.send('torrent:log', { level: 'debug', message: typeof data === 'string' ? data.trim() : data.toString().trim() })
}

channel.on('port-init', async() => {
  clearInterval(heartbeatId)
  channel.removeAllListeners('ipc')
  channel.removeAllListeners('torrentPort')
  channel.removeAllListeners('torrent:reload')
  channel.removeAllListeners('main-heartbeat')
  await destroy()

  const port = {
    onmessage: _ => {},
    postMessage: data => {
      channel.send('ipc', { data })
    }
  }
  channel.on('ipc', a => port.onmessage(a))
  if (!client) {
    setHeartBeat()
    channel.on('torrentPort', () => {
      channel.emit('torrent:port', {
        ports: [port]
      })
    })
  }
  channel.on('torrent:reload', async () => await destroy(true))
  channel.on('main-heartbeat', async settings => {
    clearInterval(heartbeatId)
    await destroy()
    const { default: TorrentClient } = await import('webtorrent-client')
    client = new TorrentClient(channel, storageQuota, 'node', { ...settings, torrentPathNew: (settings.torrentPathNew || env.TMPDIR), TMPDIR: env.TMPDIR })
  })
})

async function destroy(heartbeat = false) {
  if (client) {
    client.destroy()
    await new Promise(resolve => {
      channel.once('destroyed', resolve)
      setTimeout(resolve, 5_000).unref?.()
    })
    client = null
    if (heartbeat) setHeartBeat()
  }
}