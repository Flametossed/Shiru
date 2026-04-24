import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { app, ipcMain } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'

log.initialize({ spyRendererConsole: true })
log.transports.file.level = 'debug'
log.transports.file.maxSize = 10_000_000 // 10MB
autoUpdater.logger = log

export default class Debug {
  constructor () {
    ipcMain.handle('common:resetLog', async () => ({ success: await log.transports.file.getFile().clear() }))
    ipcMain.handle('common:getDeviceInfo', async () => {
      const { model, speed } = os.cpus()[0]
      return {
        features: app.getGPUFeatureStatus(),
        info: await app.getGPUInfo('complete'),
        cpu: { model, speed },
        ram: os.totalmem()
      }
    })
  }

  async getLogContents() {
    return await readFile(log.transports.file.getFile().path, 'utf8')
  }
}