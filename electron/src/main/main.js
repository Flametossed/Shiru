import { app, protocol } from 'electron'
import App from './app.js'

let main // Keep a global reference of the window object, if you don't, the window will, be closed automatically when the JavaScript object is garbage collected.

function createWindow () {
  main = new App()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // register extension:// for loading and testing local extensions
  protocol.registerSchemesAsPrivileged([
    { scheme: 'extension', privileges: { secure: true, standard: true, corsEnabled: true } }
  ])

  app.on('ready', createWindow)

  app.on('activate', () => {
    if (main == null) createWindow()
    else main.showAndFocus()
  })
}
