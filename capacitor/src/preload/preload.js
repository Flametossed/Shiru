import { App as Capacitor } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { IntentUri } from 'capacitor-intent-uri'
import { Filesystem } from '@capacitor/filesystem'
import { development, keyboardVisible} from '../main/util.js'
import { FileManager } from '../main/plugin.js'
import { ipcWire } from '../main/ipc.js'
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import { ForegroundService, Importance, ServiceType } from '@capawesome-team/capacitor-android-foreground-service'
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'

if (typeof localStorage === 'undefined') {
  const data = {}
  globalThis.localStorage = {
    setItem: (k, v) => { data[k] = v },
    getItem: (k) => data[k] || null
  }
}

if (typeof indexedDB === 'undefined') {
  globalThis.indexedDB = fakeIndexedDB
}

// cordova screen orientation plugin is also used, and it patches global screen.orientation.lock

// hook into pip request, and use our own pip implementation, then instantly report exit pip
// this is more like DOM PiP, rather than video PiP
HTMLVideoElement.prototype.requestPictureInPicture = function () {
  PictureInPicture.enter(this.videoWidth, this.videoHeight, success => {
    this.dispatchEvent(new Event('leavepictureinpicture'))
    if (success) document.querySelector('.content-wrapper').requestFullscreen()
  }, error => {
    this.dispatchEvent(new Event('leavepictureinpicture'))
    console.debug(error)
  })
  return Promise.resolve({})
}

const STREAMING_FG_ID = 1001
ForegroundService.createNotificationChannel({
  id: 'external-playback',
  name: 'External Playback',
  description: 'Keeps Video Streaming To An External Player Active',
  importance: Importance.Min
})

window.torrent = {
  reload: () => ipcWire.send('torrent:reload'),
  onCrash: (callback) => {}, // Currently not used for Capacitor...
  onRequest: (callback) => ipcWire.on('torrent:onRequest', (event, opts) => callback(opts)),
  portRequest: (settings) => ipcWire.invoke('torrent:portRequest', settings)
}
window.common = {
  getAppVersion: async () => (await Capacitor.getInfo())?.version,
  getPlatformInfo: () => ({
    platform: globalThis.cordova?.platformId,
    arch: navigator.platform?.split(' ')?.[1],
    development
  }),
  getDeviceInfo: async () => ipcWire.invoke('common:getDeviceInfo'),
  exportLog: async () => ipcWire.invoke('common:exportLog'),
  resetLog: async () => ipcWire.invoke('common:resetLog'),
  notify: (opts) => ipcWire.send('common:notify', opts),
  windowReady: () => ipcWire.send('common:windowReady'),
  openURI: async (uri) => Browser.open({ url: uri }),
  pickFile: async (title) => '', // Currently not used for Capacitor...
  pickFolder: async (title) => ipcWire.invoke('common:pickFolder'),
  linkAccount: async (uri) => {
    Browser.open({ url: uri })
    return null // no token
  },
  handleProtocol: (data) => ipcWire.send('common:handleProtocol', data),
  setUpdateChannel: (channel) => ipcWire.send('common:setUpdateChannel', channel),
  checkForUpdates: (channel) => ipcWire.send('common:checkForUpdates', channel),
  onUpdateAvailable: (callback) => ipcWire.on('common:onUpdateAvailable', (event, updateVersion) => callback(updateVersion)),
  onUpdateDownloaded: (callback) => {}, // Currently not used in updating for Capacitor...
  onUpdateProgress: (callback) => ipcWire.on('common:onUpdateProgress', (event, progress) => callback(progress)),
  onUpdateAborted: (callback) => ipcWire.on('common:onUpdateAborted', (event, aborted) => callback(aborted)),
  quitAndInstall: () => ipcWire.send('common:quitAndInstall'),
  onLobbyInvite: (callback) => ipcWire.on('common:onLobbyInvite', (event, link) => callback(link)),
  onRequestPage: (callback) => ipcWire.on('common:onRequestPage', (event, page) => callback(page)),
  onRequestModal: (callback) => ipcWire.on('common:onRequestModal', (event, modal, opts) => callback(modal, opts)),
  onProviderToken: (callback) => ipcWire.on('common:onProviderToken', (event, provider, opts) => callback(provider, opts)),
  onRequestPlay: (callback) => ipcWire.on('common:onRequestPlay', (event, opts) => callback(opts))
}
window.android = {
  /**
   * Sends the app to the background.
   *
   * Any type of force exit of the app causes WebView to crash (e.g. #exitApp), this is a WebView bug!
   * The next time the user tries to open the app, it will forcibly close requiring them to open it again...
   * We prefer to use #minimizeApp instead as it is a safe paused state.
   */
  minimize: () => Capacitor.minimizeApp(),
  /**
   * Listens for system back button presses.
   *
   * @param {(event: any) => void} callback
   */
  onBackButton: (callback) => Capacitor.addListener('backButton', callback),
  /** Hides the status bar if the keyboard is not visible. */
  hideStatusBar: () => {
    if (!keyboardVisible) SystemBars.hide({ bar: SystemBarType.StatusBar })
  },
  /**
   * Sets the system bar icon and text style to light or dark.
   *
   * @param {'LIGHT' | 'DARK'} style The style to apply to the system bars.
   */
  setSystemStyle: (style) => SystemBars.setStyle({ style: style === 'LIGHT' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }),
  /**
   * Requests "All Files" access permission when needed, resolves with granted `true` if access is granted, or `false` if denied.
   *
   * @returns {Promise<{ granted: boolean, error?: string | null }>} Resolves with granted `true` when access is granted, otherwise `false`.
   */
  requestFileAccess: async () => {
    if ((await Filesystem.requestPermissions()).publicStorage !== 'granted') return { granted: false, error: 'You are missing permissions to read and write to the selected download folder. Please enable storage access for this app in your device settings. Dismiss this toast to enable storage access.' }
    else if (await FileManager.hasAllFilesAccess()) return { granted: true }
    FileManager.requestAllFilesAccess()
    return new Promise((resolve) => {
      const listener = Capacitor.addListener('appStateChange', async (state) => {
        if (state.isActive) {
          listener.remove()
          if (await FileManager.hasAllFilesAccess()) resolve({ granted: true })
          else resolve({ granted: false, error: 'To reliably use a different torrent download location, please enable All Files Access for this app in your device settings. Dismiss this toast to enable all file access.' })
        }
      })
    })
  },
  /**
   * Launches an external playback intent and shows a foreground service while playback is active, resolves when the app returns to the foreground.
   *
   * @param {string} url - The intent URL to launch externally.
   * @returns {Promise<void>} Resolves when the app returns and the service stops.
   */
  launchExternal: (url) => {
    ForegroundService.startForegroundService({
      id: STREAMING_FG_ID,
      title: 'External Playback',
      body: 'Delivering Content To Your External Player',
      smallIcon: 'ic_filled',
      notificationChannelId: 'external-playback',
      serviceType: ServiceType.MediaPlayback,
      silent: true
    })
    return new Promise((resolve) => {
      IntentUri.openUri({ url }).then(() => {
        ForegroundService.stopForegroundService()
        resolve()
      })
    })
  }
}