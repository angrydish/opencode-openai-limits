import { test } from "node:test"
import assert from "node:assert/strict"
import { timeUntil } from "../src/time.mjs"

test("formats remaining time in days, hours and minutes", () => {
  const now = Date.parse("2026-11-02T00:00:00Z")
  assert.equal(timeUntil(now + 61_000, now), "2 мин")
  assert.equal(timeUntil(now + 3_660_000, now), "1 ч 1 мин")
  assert.equal(timeUntil(now + 90_000_000, now), "1 д 1 ч")
  assert.equal(timeUntil(now + 30_000, now), "1 мин")
  assert.equal(timeUntil(now, now), "ожидается обновление")
})
