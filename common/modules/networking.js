import { toast } from 'svelte-sonner'
import { writable } from 'simple-store-svelte'
import { settings } from '@/modules/settings.js'
import { codes, throttle, getRandomInt } from '@/modules/util.js'
import Debug from 'debug'
const trace = Debug('net:networking')

export const status = writable(navigator.onLine ? 'online' : 'offline')
export async function printError(title, description, error) {
  if (await isOffline(error) || await isAnilistDown(error)) return
  trace(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
    toast.error(title, {
      description: `${description}\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
      duration: 10_000
    })
  }
}

// Intercepts all AniList fetch requests and returns a 403 outage response.
// Uncomment the block below to simulate an AniList outage locally.
// const aniFetchTest = window.fetch
// window.fetch = async (url, ...args) => {
//   if (typeof url === 'string' && url.includes('anilist')) return new Response(
//     JSON.stringify({
//       errors: [{ message: 'The AniList API has been temporarily disabled due to severe stability issues. Please check the announcements channel in the official AniList Discord for more information.', status: 403 }] }),
//     { status: 403, headers: { 'Content-Type': 'application/json' }
//     }
//   )
//   return aniFetchTest(url, ...args)
// }

const fetch = window.fetch
window.fetch = async (...args) => {
  try {
    const res = await fetch(...args)
    if (!res.ok) window.dispatchEvent(new CustomEvent('fetch-error', { detail: { error: { response: res?.response, status: res?.status, message: res?.message }, url: args[0]?.url || args[0], config: args[1] } }))
    return res
  } catch (error) {
    window.dispatchEvent(new CustomEvent('fetch-error', { detail: { error, url: args[0]?.url || args[0], config: args[1] } }))
    throw error
  }
}

function isNetworkError(error) {
  if (!error || error.response || (error.status && error.status >= 400)) return false
  return (/request failed|failed to fetch|resolve host|network\s?error/i).test(error.message || '')
}

function isAnilistError(error) {
  if (!error || error.response || (error.status && error.status !== 403)) return false
  return (/anilist/i).test(error.message || '') && (/temporarily disabled/i).test(error.message || '')
}

export const isOffline = newOutageChecker({
  key: 'Network',
  ping: (timeout = 2_000) => pingWith({
    url: 'https://cp.cloudflare.com/generate_204?cacheBust=' + Date.now(),
    options: {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: { 'Pragma': 'no-cache' }
    },
    timeout
  }),
  detect: isNetworkError,
  offlineEvent: 'offline',
  onlineEvent: 'online',
  retryRange: [3, 5]
})

export const isAnilistDown = newOutageChecker({
  key: 'Anilist API',
  ping: (timeout = 2_000) => pingWith({
    url: 'https://graphql.anilist.co',
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query: `query { Page(page: 1, perPage: 1) { media { id } }}` })
    },
    timeout,
    validate: async (res) => {
      try {
        const json = await res.json()
        for (const error of json?.errors || []) {
          if (isAnilistError(error)) return false
        }
      } catch (err) {
        return !isAnilistError(err)
      }
      return true
    }
  }),
  detect: isAnilistError,
  offlineEvent: 'offline_anilist',
  onlineEvent: 'online',
  retryRange: [15, 25],
  outageToast: {
    title: 'AniList Outage',
    duration: 45_000
  }
})

async function pingWith({ url, options, timeout = 2_000, validate }) {
  if (!navigator.onLine) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) return false
    if (validate) return await validate(res)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function newOutageChecker({ key, ping, detect, offlineEvent, onlineEvent, retryRange = [3, 5], outageToast }) {
  let monitor
  let promise
  let resolvePromise

  const throttledCheck = throttle(async (error) => {
    if (status.value === offlineEvent) {
      resolvePromise?.(true)
      return
    }
    trace(`Detected error during fetch(), checking for ${key} outage...`)
    if (!detect(error)) {
      resolvePromise?.(false)
      return
    }
    trace(`Verified suspicious error, navigator.onLine=${navigator.onLine}, verifying with ${key} ping...`)
    const result = await ping()
    if (!result) {
      trace(`${key} confirmed offline, starting up periodic checks...`)
      status.value = offlineEvent
      window.dispatchEvent(new CustomEvent(offlineEvent))
      if (outageToast) {
        toast.error(outageToast.title, {
          description: `${outageToast.description ? outageToast.description + '\n' : ''}${error.status || 429} - ${error.message || codes[error.status || 429]}`,
          duration: outageToast.duration ?? 45_000
        })
      }
      if (!monitor) {
        monitor = (() => {
          let stop = false
          async function checkLoop() {
            if (stop) return
            const result = await ping(status.value === offlineEvent ? 500 : 2_000)
            if (result && status.value === offlineEvent) {
              status.value = 'online'
              window.dispatchEvent(new CustomEvent(onlineEvent))
              trace(`Detected that the ${key} connection restored!`)
              stop = true
              monitor = null
            } else if (!result) {
              trace(`${key} still offline...`)
            }
            if (!stop) {
              const [min, max] = retryRange
              setTimeout(checkLoop, getRandomInt(min, max) * 1_000)
            }
          }
          checkLoop()
          return () => (stop = true)
        })()
      }
      resolvePromise?.(true)
    } else {
      if (status.value === offlineEvent) {
        status.value = 'online'
        window.dispatchEvent(new CustomEvent(onlineEvent))
      }
      trace(`${key} ping succeeded, online.`)
      resolvePromise?.(false)
    }
  }, 5_000)

  return async function check(error) {
    if (status.value === offlineEvent) return true
    if (!promise) {
      promise = new Promise(resolve => { resolvePromise = resolve })
      promise.finally(() => {
        promise = null
        resolvePromise = null
      })
    }
    const wasThrottled = !throttledCheck(error)
    if (wasThrottled) resolvePromise(false)
    return (await promise) || (status.value === offlineEvent)
  }
}