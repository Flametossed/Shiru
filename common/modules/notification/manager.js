import { sort, dedupe, upsert, splitLocalAndSystem, markAsRead, getFlags } from '@/modules/notification/util.js'
import { debounce, generateRandomHexCode } from '@/modules/util.js'
import { cache, caches, mediaCache } from '@/modules/cache.js'
import { derived, writable } from 'simple-store-svelte'
import { COMMON, ELECTRON } from '@/modules/bridge.js'
import { settings } from '@/modules/settings.js'

/** @type {import('simple-store-svelte').Writable<any[]>} */
export const localNotifications = writable((cache.getEntry(caches.NOTIFICATIONS, 'notifications') || []).map((n) => ({ ...n, uid: n.uid ?? generateRandomHexCode(8) })))
/** @type {import('simple-store-svelte').Readable<number>} */
export const unreadCount = derived(localNotifications, _notifications => _notifications?.filter?.(notification => notification.read !== true)?.length)

/** Debounced batch processor for queued notifications */
const debounceNotify = debounce(processNotifications, 15_000)
/** Debounced trigger for marking watched notifications as read */
const debounceMarkRead = debounce(markWatchedAsRead, 2_500)
mediaCache.subscribe(debounceMarkRead)
/**
 * Temporary buffer for incoming notifications before processing
 * @type {Array<{ detail: Object, systemNotify: boolean }>}
 */
const incomingNotifications = []
/**
 * Debounced persistence and updates unread count.
 * Writes to cache and updates Electron badge count.
 */
const debounceAsBatch = debounce(() => {
  cache.setEntry(caches.NOTIFICATIONS, 'notifications', localNotifications.value)
  setTimeout(() => ELECTRON.setUnreadCount(unreadCount.value), 50).unref?.()
}, 1_500)
localNotifications.subscribe(debounceAsBatch)

/** Marks watched notifications as read by checking media progress */
async function markWatchedAsRead() {
  const updates = []
  for (const { notification, media } of await Promise.all(localNotifications.value.filter((n) => !n.read).map((notification) => cache.requestMedia(notification.id).then((media) => ({ notification, media }))))) {
    if (getFlags(notification, media).completed) updates.push(`${notification.id}-${notification.episode}`)
  }
  if (updates.length > 0) {
    localNotifications.update((n) =>
      sort(n.map((existing) => {
        if (updates.includes(`${existing.id}-${existing.episode}`)) existing.read = true
        return existing
      })))
  }
}

/**
 * Queue a notification for batched processing
 *
 * @param {Object} detail Notification payload
 * @param {boolean} [systemNotify=false] Whether to forward to system notifications
 */
function queueNotification(detail, systemNotify = false) {
  incomingNotifications.push({ detail, systemNotify })
  debounceNotify()
}

/**
 * Processes queued notifications in a single batch.
 * Deduplicates incoming, applies local updates, and dispatches system notifications.
 */
function processNotifications() {
  if (!incomingNotifications.length) return
  const { localNotifications: local, systemNotifications } = splitLocalAndSystem(dedupe(incomingNotifications))
  for (const notification of local) localNotifications.update((n) => upsert(n, notification))
  systemNotifications.forEach((notification, i) => setTimeout(() => COMMON.notify(notification), 5 * (i + 1)).unref?.())
  incomingNotifications.length = 0
}

window.addEventListener('notification-app', (event) => queueNotification(event.detail, settings.value.systemNotify && (event.detail.button?.length || event.detail.activation)))
window.addEventListener('notification-read', (event) => localNotifications.update((n) => markAsRead(n, event.detail)))
window.addEventListener('notification-reset', () => {
  localNotifications.set([])
  incomingNotifications.length = 0
})

ELECTRON.setUnreadCount(unreadCount.value)