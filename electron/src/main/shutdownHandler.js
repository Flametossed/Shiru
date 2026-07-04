// Optional native shutdown blocker (@paymoapp/electron-shutdown-handler).
// Its prebuilt `.node` binary may be missing in a dev environment installed
// without native build scripts. In that case fall back to a no-op so the app
// still starts instead of crashing during window creation. In production
// builds the real native module is present and used unchanged.
let handler
try {
  // eslint-disable-next-line
  const mod = require('@paymoapp/electron-shutdown-handler')
  handler = mod?.default || mod
  if (!handler || typeof handler.setWindowHandle !== 'function') throw new Error('invalid shutdown handler')
} catch (e) {
  handler = {
    setWindowHandle () {},
    blockShutdown () {},
    releaseShutdown () {},
    on () {}
  }
}

module.exports = handler
