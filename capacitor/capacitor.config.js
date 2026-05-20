const mode = process.env.NODE_ENV?.trim() || 'development'
const isDev = mode === 'development'

const config = {
  appId: isDev ? 'watch.shiru.dev' : 'watch.shiru',
  appName: isDev ? 'Shiru (Debug)' : 'Shiru',
  webDir: 'build',
  android: {
    buildOptions: {
      keystorePath: './watch.shiru',
      keystorePassword: '',
      keystoreAlias: 'watch.shiru'
    },
    webContentsDebuggingEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 10_000
    },
    CapacitorHttp: {
      enabled: true
    },
    CapacitorNodeJS: {
      nodeDir: 'nodejs'
    },
    LocalNotifications: {
      sound: 'ic_notification.wav'
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK'
    }
  },
  server: {
    cleartext: true
  }
}

if (isDev) config.server.url = 'http://localhost:5001/index.html'

module.exports = config