import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('torrent', {
  reload: () => ipcRenderer.send('torrent:reload'),
  onCrash: (callback) => ipcRenderer.on('torrent:onCrash', callback),
  onRequest: (callback) => ipcRenderer.on('torrent:onRequest', (event, updateVersion) => callback(updateVersion)),
  portRequest: async (settings) => {
    const port = new Promise(resolve => {
      ipcRenderer.once('electron:torrentPort', ({ ports }) => resolve({
        onmessage: cb => { ports[0].onmessage = ({ type, data }) => cb({ type, data }) },
        postMessage: (a, b) => ports[0].postMessage(a, b)
      }))
    })
    await ipcRenderer.invoke('torrent:portRequest', settings)
    return port
  }
})
contextBridge.exposeInMainWorld('common', {
  getAppVersion: () => ipcRenderer.invoke('common:getAppVersion'),
  getPlatformInfo: () => ({
    platform: process.platform,
    arch: process.arch,
    session: process.env.XDG_SESSION_TYPE || '',
    development: process.env.NODE_ENV?.trim() === 'development'
  }),
  getDeviceInfo: () => ipcRenderer.invoke('common:getDeviceInfo'),
  exportLog: () => ipcRenderer.invoke('common:exportLog'),
  resetLog: () => ipcRenderer.invoke('common:resetLog'),
  notify: (opts) => ipcRenderer.send('common:notify', opts),
  windowReady: () => ipcRenderer.send('common:windowReady'),
  openURI: (uri) => ipcRenderer.invoke('common:openURI', uri),
  pickFile: (title) => ipcRenderer.invoke('common:pickFile', title),
  pickFolder: (title) => ipcRenderer.invoke('common:pickFolder', title),
  linkAccount: (uri) => ipcRenderer.invoke('common:linkAccount', uri),
  handleProtocol: (data) => ipcRenderer.send('common:handleProtocol', data),
  setUpdateChannel: (channel) => ipcRenderer.send('common:setUpdateChannel', channel),
  checkForUpdates: (channel) => ipcRenderer.send('common:checkForUpdates', channel),
  onUpdateAvailable: (callback) => ipcRenderer.on('common:onUpdateAvailable', (event, updateVersion) => callback(updateVersion)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('common:onUpdateDownloaded', (event, updateVersion) => callback(updateVersion)),
  onUpdateProgress: (callback) => {}, // Currently not used in updating for Electron...
  onUpdateAborted: (callback) => ipcRenderer.on('common:onUpdateAborted', (event, aborted) => callback(aborted)),
  quitAndInstall: () => ipcRenderer.send('common:quitAndInstall'),
  onLobbyInvite: (callback) => ipcRenderer.on('common:onLobbyInvite', (event, link) => callback(link)),
  onRequestPage: (callback) => ipcRenderer.on('common:onRequestPage', (event, page) => callback(page)),
  onRequestModal: (callback) => ipcRenderer.on('common:onRequestModal',  (event, modal, opts) => callback(modal, opts)),
  onProviderToken: (callback) => ipcRenderer.on('common:onProviderToken', (event, provider, opts) => callback(provider, opts)),
  onRequestPlay: (callback) => ipcRenderer.on('common:onRequestPlay', (event, opts) => callback(opts))
})
contextBridge.exposeInMainWorld('electron', {
  exit: () => ipcRenderer.send('electron:Exit'),
  setDoH: (url) => ipcRenderer.send('electron:setDoH', url),
  getAngle: () => ipcRenderer.invoke('electron:getAngle'),
  setAngle: (angle) => ipcRenderer.send('electron:setAngle', angle),
  isMinimized: () => ipcRenderer.invoke('electron:isMinimized'),
  isFullScreen: () => ipcRenderer.invoke('electron:isFullScreen'),
  onMinimize: (callback) => ipcRenderer.on('electron:onMinimize', (event, isMinimized) => callback(isMinimized)),
  onFullScreen: (callback) => ipcRenderer.on('electron:onFullScreen', (event, isFullScreen) => callback(isFullScreen)),
  hideWindow: () => ipcRenderer.send('electron:hideWindow'),
  showAndFocus: () => ipcRenderer.send('electron:showAndFocus'),
  onExitIntent: (callback) => ipcRenderer.on('electron:onExitIntent', callback),
  openTorrentDevTools: () => ipcRenderer.send('electron:openTorrentDevTools'),
  openDevTools: () => ipcRenderer.send('electron:openDevTools'),
  setUnreadCount: (notificationCount) => ipcRenderer.send('electron:setUnreadCount', notificationCount),
  setDiscordRPC: (state) => ipcRenderer.send('electron:setDiscordRPC', state),
  setPresence: (activity) => ipcRenderer.send('electron:setPresence', activity),
  clearPresence: () => ipcRenderer.send('electron:clearPresence'),
  getYouTube: () => ipcRenderer.invoke('electron:getYouTube')
})