import type { SvelteComponentTyped } from 'svelte'

export {}

type Track = {
  selected: boolean
  enabled: boolean
  id: string
  kind: string
  label: string
  language: string
}

declare global {
  interface Window {
    torrent: {
      reload: () => void
      onCrash: (callback: () => void) => void
      onRequest: (callback: (updateVersion: any) => void) => void
      portRequest: (settings: any) => Promise<{
        onmessage: (cb: (data: { type: string; data: any }) => void) => void
        postMessage: (a: any, b: any) => void
      }>
    }
    common: {
      getAppVersion: () => Promise<string>
      getPlatformInfo: () => { platform: string; arch: string; session: string; development: boolean }
      getDeviceInfo: () => Promise<any>
      exportLog: () => Promise<any>
      resetLog: () => Promise<any>
      notify: (opts: any) => void
      windowReady: () => void
      openURI: (uri: string) => Promise<any>
      pickFile: (title: string) => Promise<string>
      pickFolder: (title: string) => Promise<string>
      linkAccount: (uri: string) => Promise<any>
      handleProtocol: (data: any) => void
      setUpdateChannel: (channel: 'stable' | 'nightly') => void
      checkForUpdates: (channel: 'stable' | 'nightly') => void
      onUpdateAvailable: (callback: (updateVersion: any) => void) => void
      onUpdateDownloaded: (callback: (updateVersion: any) => void) => void
      onUpdateProgress: (callback: (progress: number) => void) => void
      onUpdateAborted: (callback: (aborted: boolean) => void) => void
      quitAndInstall: () => void
      onLobbyInvite: (callback: (link: string) => void) => void
      onRequestPage: (callback: (page: any) => void) => void
      onRequestModal: (callback: (modal: any, opts: any) => void) => void
      onProviderToken: (callback: (provider: any, opts: any) => void) => void
      onRequestPlay: (callback: (opts: any) => void) => void
    }
    android?: {
      minimize: () => void
      onBackButton: (callback: (event: any) => void) => void
      hideStatusBar: () => void
      setSystemStyle: (style: 'LIGHT' | 'DARK') => void
      requestFileAccess: () => Promise<{ granted: boolean; error?: string | null }>
      launchExternal: (url: string) => Promise<void>
    }
    electron?: {
      exit: () => void
      setDoH: (url: string) => void
      getAngle: () => Promise<string>
      setAngle: (angle: any) => void
      isMinimized: () => Promise<boolean>
      isFullScreen: () => Promise<boolean>
      onMinimize: (callback: (isMinimized: boolean) => void) => void
      onFullScreen: (callback: (isFullScreen: boolean) => void) => void
      hideWindow: () => void
      showAndFocus: () => void
      onExitIntent: (callback: () => void) => void
      openTorrentDevTools: () => void
      openDevTools: () => void
      setUnreadCount: (notificationCount: number) => void
      setDiscordRPC: (state: any) => void
      setPresence: (activity: any) => void
      clearPresence: () => void
      getYouTube: () => Promise<string>
    }
  }
  interface HTMLMediaElement {
    videoTracks: Track[]
    audioTracks: Track[]
  }

  interface ScreenOrientation {
    lock: Function
  }

  namespace svelteHTML {
    interface HTMLAttributes {
      'on:leavepictureinpicture'?: (
        event: Event<{
          target: EventTarget;
        }>
      ) => void;
    }
  }
}

declare module '*.svelte' {
  export default SvelteComponentTyped
}
