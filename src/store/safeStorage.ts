import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage that falls back to memory when it is unavailable or throws
 * (private browsing, blocked site data, quota), so settings never break the app.
 */
export function safeStorage(): StateStorage {
  const memory = new Map<string, string>()
  const local = (() => {
    try {
      return globalThis.localStorage ?? null
    } catch {
      return null
    }
  })()

  return {
    getItem: (name) => {
      try {
        return local ? local.getItem(name) : (memory.get(name) ?? null)
      } catch {
        return memory.get(name) ?? null
      }
    },
    setItem: (name, value) => {
      memory.set(name, value)
      try {
        local?.setItem(name, value)
      } catch {
        // Keep the in-memory copy.
      }
    },
    removeItem: (name) => {
      memory.delete(name)
      try {
        local?.removeItem(name)
      } catch {
        // Nothing else to clean up.
      }
    },
  }
}
