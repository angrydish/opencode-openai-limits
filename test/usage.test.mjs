import { test } from "node:test"
import assert from "node:assert/strict"
import { accountID, parseUsage, parseResetCredits, resetCountOnly } from "../src/usage.mjs"

test("parses rolling and weekly limits in epoch seconds", () => {
  assert.deepEqual(parseUsage({ rate_limit: {
    primary_window: { used_percent: 35, reset_at: 1700000000, limit_window_seconds: 18000 },
    secondary_window: { used_percent: 80, reset_at: 1701000000, limit_window_seconds: 604800 },
  } }), {
    fiveHour: { used: 35, resetsAt: 1700000000000 },
    weekly: { used: 80, resetsAt: 1701000000000 },
  })
})

test("missing weekly limit stays unknown; invalid response is rejected", () => {
  assert.deepEqual(parseUsage({ rate_limit: { primary_window: { used_percent: 0, reset_at: 1700000000, limit_window_seconds: 18000 }, secondary_window: null } }),
    { fiveHour: { used: 0, resetsAt: 1700000000000 } })
  assert.deepEqual(parseUsage({ rate_limit: { primary_window: null, secondary_window: { used_percent: 22, reset_at: 1700000000, limit_window_seconds: 604800 } } }),
    { weekly: { used: 22, resetsAt: 1700000000000 } })
  assert.throws(() => parseUsage({ rate_limit: { primary_window: { used_percent: 120, limit_window_seconds: 18000 } } }))
})

test("Pro weekly-only primary window is never mislabeled as 5 hours", () => {
  assert.deepEqual(parseUsage({ rate_limit: {
    primary_window: { used_percent: 9, reset_at: 1794224413, limit_window_seconds: 604800 },
    secondary_window: null,
  } }), { weekly: { used: 9, resetsAt: 1794224413000 } })
})

test("duration takes precedence over primary/secondary order; unknown duration is not guessed", () => {
  assert.deepEqual(parseUsage({ rate_limit: {
    primary_window: { used_percent: 22, reset_at: 1700000000, limit_window_seconds: 604800 },
    secondary_window: { used_percent: 35, reset_at: 1701000000, limit_window_seconds: 18000 },
  } }), {
    weekly: { used: 22, resetsAt: 1700000000000 },
    fiveHour: { used: 35, resetsAt: 1701000000000 },
  })
  assert.throws(() => parseUsage({ rate_limit: {
    primary_window: { used_percent: 15, reset_at: 1700000000, limit_window_seconds: 86400 },
  } }))
})

test("uses account metadata, then JWT claim, never accepts malformed tokens", () => {
  const jwt = `a.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } })).toString("base64url")}.b`
  assert.equal(accountID({ account_id: "acct-2" }, jwt), "acct-2")
  assert.equal(accountID({}, jwt), "acct-1")
  assert.equal(accountID({}, "bad"), undefined)
})

test("parses only available full resets and sorts expiry without exposing IDs", () => {
  assert.deepEqual(parseResetCredits({ available_count: 3, credits: [
    { id: "secret1", status: "available", reset_type: "codex_rate_limits", expires_at: "2026-12-02T05:12:00+07:00" },
    { id: "secret2", status: "available", reset_type: "codex_rate_limits", expires_at: "2026-11-07T06:07:00+07:00" },
    { id: "secret3", status: "available", reset_type: "codex_rate_limits", expires_at: null },
    { id: "secret4", status: "redeemed", reset_type: "codex_rate_limits", expires_at: null },
  ] }), {
    available: 3,
    expiries: [Date.parse("2026-11-07T06:07:00+07:00"), Date.parse("2026-12-02T05:12:00+07:00")],
    noExpiry: 1, unknown: 0,
  })
})

test("partial details and summary count do not invent expiry", () => {
  assert.deepEqual(parseResetCredits({ available_count: 3, credits: [
    { status: "available", reset_type: "codex_rate_limits", expires_at: "2026-11-07T00:00:00Z" },
  ] }), { available: 3, expiries: [Date.parse("2026-11-07T00:00:00Z")], noExpiry: 0, unknown: 2 })
  assert.deepEqual(resetCountOnly({ rate_limit_reset_credits: { available_count: 3 } }),
    { available: 3, expiries: [], noExpiry: 0, unknown: 3 })
  assert.equal(resetCountOnly({}), undefined)
  assert.throws(() => parseResetCredits({ available_count: -1, credits: [] }))
})
