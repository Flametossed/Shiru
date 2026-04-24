/**
 * Stores listeners for ipcWire channels.
 *
 * @type {Map<string, Set<Function>>}
 */
const wireHandles = new Map()

/**
 * Stores handlers registered via ipcWire.handle().
 *
 * @type {Map<string, Function>}
 */
const wireHandlers = new Map()

/** In-process event bus (Electron-like API). */
export const ipcWire = {
  /**
   * Emit an event to all listeners on a channel.
   *
   * @param {string} channel
   * @param {...any} args
   */
  emit(channel, ...args) {
    const replyChannel = `${channel}:reply`
    const event = {
      channel,
      reply: (...replyArgs) => this.emit(replyChannel, ...replyArgs),
      sender: {
        send: (...replyArgs) => this.emit(replyChannel, ...replyArgs)
      }
    }
    wireHandles.get(channel)?.forEach(listener => {
      try {
        listener(event, ...args)
      } catch (error) {
        console.error(`ipcWire error on channel "${channel}":`, error)
      }
    })
  },

  /**
   * Alias for emit, sends an event to all listeners on a channel.
   *
   * @param {string} channel
   * @param {...any} args
   */
  send(channel, ...args) {
    return this.emit(channel, ...args)
  },

  /**
   * Register a persistent listener.
   *
   * @param {string} channel
   * @param {Function} listener
   * @returns {this}
   */
  on(channel, listener) {
    if (!wireHandles.has(channel)) wireHandles.set(channel, new Set())
    wireHandles.get(channel).add(listener)
    return this
  },

  /**
   * Register a one-time listener, auto-removed after first call.
   *
   * @param {string} channel
   * @param {Function} listener
   * @returns {this}
   */
  once(channel, listener) {
    const wrapper = (event, ...args) => {
      listener(event, ...args)
      this.off(channel, wrapper)
    }
    return this.on(channel, wrapper)
  },

  /**
   * Remove a specific listener.
   *
   * @param {string} channel
   * @param {Function} listener
   * @returns {this}
   */
  off(channel, listener) {
    wireHandles.get(channel)?.delete(listener)
    return this
  },

  /**
   * Call a registered handler and return its result.
   *
   * @param {string} channel
   * @param {*} data
   * @returns {Promise<any>}
   */
  invoke(channel, data) {
    const handler = wireHandlers.get(channel)
    if (!handler) return Promise.reject(new Error(`ipcWire.invoke() called for channel "${channel}" but no handler is registered.`))
    const event = Object.freeze({ channel })
    return Promise.resolve().then(() => handler(event, data)).catch(error => {
      console.error(error)
      throw error
    })
  },

  /**
   * Register a handler that can be invoked.
   *
   * @param {string} channel
   * @param {(data: any) => any | Promise<any>} handler
   * @returns {this}
   */
  handle(channel, handler) {
    if (wireHandlers.has(channel)) console.warn(`ipcWire.handle() called for channel "${channel}" which already has a handler. Overwriting.`)
    wireHandlers.set(channel, handler)
    return this
  },

  /**
   * Register a one-time handler that can be invoked.
   * The handler is removed after the first invocation.
   *
   * @param {string} channel
   * @param {(event: any, data: any) => any | Promise<any>} handler
   * @returns {this}
   */
  handleOnce(channel, handler) {
    const wrapper = async (event, data) => {
      this.removeHandler(channel)
      return handler(event, data)
    }
    return this.handle(channel, wrapper)
  },

  /**
   * Remove an invoke handler.
   *
   * @param {string} channel
   * @returns {this}
   */
  removeHandler(channel) {
    wireHandlers.delete(channel)
    return this
  },

  /**
   * Remove all listeners, optionally scoped to a channel.
   *
   * @param {string} [channel]
   * @returns {this}
   */
  removeAllListeners(channel) {
    if (channel) wireHandles.delete(channel)
    else wireHandles.clear()
    return this
  }
}