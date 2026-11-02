// Kept at TUI-plugin scope, not sidebar scope: switching tabs remounts the sidebar.
export function createSnapshotCache(read, now = Date.now, ttl = 60_000) {
  const loading = { status: "loading", message: "Загрузка…" }
  let snapshot = loading
  let lastAttempt = -Infinity
  let generation = 0
  let pending
  const listeners = new Set()
  const notify = () => { for (const listener of listeners) listener(snapshot) }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    invalidate() {
      generation++
      pending = undefined
      lastAttempt = -Infinity
      snapshot = loading
      notify()
    },
    refresh() {
      if (pending) return pending
      if (now() - lastAttempt < ttl) return Promise.resolve(snapshot)
      const current = generation
      lastAttempt = now()
      pending = Promise.resolve().then(read).catch(() => ({
        status: "error", message: "Не удалось прочитать данные панели. Проверь /reload или состояние плагина.",
      })).then((value) => {
        if (current === generation) {
          snapshot = value
          notify()
          pending = undefined
        }
        return value
      })
      return pending
    },
  }
}
