const noopVoid = () => {}
const noopAsyncVoid = async () => {}
const noopAsyncBool = async () => false
const noopAsyncString = async () => ''
const torrentDefaults = {
  reload: noopVoid,
  onCrash: noopVoid,
  onRequest: noopVoid,
  portRequest: noopAsyncVoid
}
const commonDefaults = {
  getAppVersion: noopAsyncString,
  getPlatformInfo: () => ({ platform: '', arch: '', session: '', development: false }),
  getDeviceInfo: noopAsyncVoid,
  exportLog: noopAsyncVoid,
  resetLog: noopAsyncVoid,
  notify: noopVoid,
  windowReady: noopVoid,
  openURI: noopAsyncVoid,
  pickFile: noopAsyncString,
  pickFolder: noopAsyncString,
  linkAccount: noopAsyncVoid,
  handleProtocol: noopVoid,
  /** @param {'stable' | 'nightly'} channel */
  setUpdateChannel: (channel = 'stable') => {},
  /** @param {'stable' | 'nightly'} channel */
  checkForUpdates: (channel = 'stable') => {},
  quitAndInstall: noopVoid,
  onUpdateAvailable: noopVoid,
  onUpdateDownloaded: noopVoid,
  onUpdateProgress: noopVoid,
  onUpdateAborted: noopVoid,
  onLobbyInvite: noopVoid,
  onRequestPage: noopVoid,
  onRequestModal: noopVoid,
  onProviderToken: noopVoid,
  onRequestPlay: noopVoid
}
const androidDefaults = {
  minimize: noopVoid,
  onBackButton: noopVoid,
  hideStatusBar: noopVoid,
  /** @param {'LIGHT' | 'DARK'} style */
  setSystemStyle: (style = 'LIGHT') => {},
  requestFileAccess: async () => ({ granted: true }),
  launchExternal: noopAsyncVoid
}
const electronDefaults = {
  exit: noopVoid,
  setDoH: noopVoid,
  getAngle: async () => 'default',
  setAngle: noopVoid,
  isMinimized: noopAsyncBool,
  isFullScreen: noopAsyncBool,
  onMinimize: noopVoid,
  onFullScreen: noopVoid,
  hideWindow: noopVoid,
  showAndFocus: noopVoid,
  onExitIntent: noopVoid,
  openTorrentDevTools: noopVoid,
  openDevTools: noopVoid,
  setUnreadCount: noopVoid,
  setDiscordRPC: noopVoid,
  setPresence: noopVoid,
  clearPresence: noopVoid,
  getYouTube: async () => 'https://www.youtube-nocookie.com'
}

export const TORRENT = window.torrent || torrentDefaults
export const COMMON = window.common || commonDefaults
export const ANDROID = window.android || androidDefaults
export const ELECTRON = window.electron || electronDefaults