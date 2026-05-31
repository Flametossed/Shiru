import { app, ipcMain, shell, screen } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

import Store from './store.js'

export const store = new Store(app.getPath('userData'), 'persist.json', { angle: 'default' })
export const development = process.env.NODE_ENV?.trim() === 'development'

const flags = [
  // Wayland GPU workaround that targeted Intel Iris.
  // Older Electron had weaker Wayland GPU support, newer versions handle it better. Using this now cause issues with hardware-accelerated decoding and shutdown hangs.
  // ...(process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ? [['in-process-gpu']] : []),

  // GPU / rendering pipeline overrides (behavior varies across hardware and driver versions)
  ['disable-gpu-sandbox'], ['disable-direct-composition-video-overlays'], ['double-buffer-compositing'], ['enable-zero-copy'], ['ignore-gpu-blocklist'], ['force_high_performance_gpu'],
  // Overlay behavior (generally safe, affects fullscreen layering behavior)
  ['enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay'],
  // Safe performance-related features
  ['enable-features', 'PlatformEncryptedDolbyVision,CanvasOopRasterization,ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes,UseSkiaRenderer,WebAssemblyLazyCompilation,AutoPictureInPictureForVideoPlayback'],
  // Note: FluentOverlayScrollbars and WindowsScrollingPersonality were used for smoother scrolling, but both have been deprecated and disabled by Chromium (see: https://issues.chromium.org/issues/359747082)

  // Disables Chromium UI layering behavior (WidgetLayering)
  ['disable-features', 'WidgetLayering'],
  // Legacy Chromium media engagement: ['disable-features', 'MediaEngagementBypassAutoplayPolicies,PreloadMediaEngagementData,RecordMediaEngagementScores']

  // Chromium behavior overrides (permissions, process model, throttling, media policy)
  ['autoplay-policy', 'no-user-gesture-required'], ['disable-notifications'], ['disable-logging'], ['disable-permissions-api'], ['no-zygote'], ['disable-renderer-backgrounding'],
  // Network throttling override (prevents Chromium from downscaling behavior on slow networks)
  ['force-effective-connection-type', '4G'],
  // Cache sizing (can improve media/image responsiveness, tradeoff is disk usage)
  ['disk-cache-size', '500000000']
]
for (const [flag, value] of flags) app.commandLine.appendSwitch(flag, value)
app.commandLine.appendSwitch('use-angle', store.get('angle') || 'default')

ipcMain.handle('common:getAppVersion', () => getAppVersion())
ipcMain.handle('common:openURI', (event, uri) => shell.openExternal(uri))
ipcMain.handle('electron:getAngle', () => store.get('angle') || 'default')
ipcMain.on('electron:setAngle', (event, angle) => store.set('angle', angle))
ipcMain.on('electron:setDoH', (event, dns) => {
  try {
    app.configureHostResolver({
      secureDnsMode: 'secure',
      secureDnsServers: ['' + new URL(dns)]
    })
  } catch (e) {}
})

app.setJumpList?.([
  {
    name: 'Frequent',
    items: [
      {
        type: 'task',
        program: 'shiru://w2g/',
        title: 'Watch Together',
        description: 'Create a New Watch Together Lobby'
      },
      {
        type: 'task',
        program: 'shiru://donate/',
        title: 'Donate',
        description: 'Support This App'
      }
    ]
  }
])

let defaultBounds
export function getWindowState() {
  const state = store.get('windowState') || {}
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  defaultBounds = { width: Math.floor(screenWidth * 0.75), height: Math.floor(screenHeight * 0.75), x: undefined, y: undefined }
  let bounds = state.bounds || defaultBounds
  if (bounds.width > screenWidth || bounds.height > screenHeight) bounds = { ...defaultBounds }
  if (!isNaN(bounds.x) && !isNaN(bounds.y)) {
    const { width, height, x, y } = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).bounds
    if (bounds.x < x || bounds.y < y || bounds.x > x + width || bounds.y > y + height) {
      bounds.x = undefined
      bounds.y = undefined
    }
  }
  if (isNaN(bounds.x) || isNaN(bounds.y)) {
    bounds.x = Math.floor((screenWidth - bounds.width) / 2)
    bounds.y = Math.floor((screenHeight - bounds.height) / 2)
  }
  return { bounds, isMaximized: (state.isMaximized || false), isFullScreen: (state.isFullScreen || false) }
}

export function saveWindowState(window) {
  if (!window || window.isDestroyed()) return
  let bounds
  if (!window.isMaximized() && !window.isFullScreen()) bounds = window.getBounds()
  else bounds = store.get('windowState')?.bounds || defaultBounds
  store.set('windowState', { bounds,  isMaximized: window.isMaximized(), isFullScreen: window.isFullScreen() })
}

export function getDefaultBounds() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  return {
    width: defaultBounds.width,
    height: defaultBounds.height,
    x: Math.floor((screenWidth - defaultBounds.width) / 2),
    y: Math.floor((screenHeight - defaultBounds.height) / 2)
  }
}

function getAppVersion() {
  if (app.isPackaged) return app.getVersion()
  try {
    return JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')).version
  } catch (error) {
    console.debug('Failed to read version from package.json', error)
    return app.getVersion()
  }
}