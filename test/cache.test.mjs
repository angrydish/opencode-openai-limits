import { test } from "node:test"
import assert from "node:assert/strict"
import { createSnapshotCache } from "../src/cache.mjs"

test("tab remount reads cached result and reuses in-flight request", async () => {
  let clock = 100_000
  let reads = 0
  const cache = createSnapshotCache(async () => ({ status: "ok", message: "", fetchedAt: ++reads }), () => clock)
  const first = cache.refresh()
  assert.equal(await first, await cache.refresh())
  assert.equal(reads, 1)
  assert.equal(cache.get().status, "ok")
  clock += 59_000
  await cache.refresh()
  assert.equal(reads, 1)
  clock += 1_000
  assert.equal(cache.get().fetchedAt, 1) // keep the last reading while refreshing
  await cache.refresh()
  assert.equal(cache.get().fetchedAt, 2)
})

test("account switch clears old data and rejects a stale in-flight response", async () => {
  let resolveOld
  let calls = 0
  const cache = createSnapshotCache(() => ++calls === 1
    ? new Promise((resolve) => { resolveOld = resolve })
    : Promise.resolve({ status: "ok", message: "new" }))
  const old = cache.refresh()
  await Promise.resolve()
  cache.invalidate()
  assert.equal(cache.get().status, "loading")
  await cache.refresh()
  resolveOld({ status: "ok", message: "old" })
  await old
  assert.equal(cache.get().message, "new")
})

test("failed reads are throttled until TTL expires", async () => {
  let clock = 0
  let reads = 0
  const cache = createSnapshotCache(async () => { reads++; throw new Error("offline") }, () => clock)
  await cache.refresh()
  await cache.refresh()
  assert.equal(reads, 1)
  assert.equal(cache.get().status, "error")
  clock += 60_000
  await cache.refresh()
  assert.equal(reads, 2)
})
