// The ChatGPT/Codex usage response is not a stable public OpenAI API.
export function parseUsage(payload) {
  const limits = payload?.rate_limit
  const windows = {}
  for (const value of [limits?.primary_window, limits?.secondary_window]) {
    // Primary/secondary describe position, not duration: Pro can have a weekly primary.
    const key = value?.limit_window_seconds === 18_000 ? "fiveHour"
      : value?.limit_window_seconds === 604_800 ? "weekly" : undefined
    if (!key) continue
    const used = value?.used_percent
    const reset = value?.reset_at
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100 ||
        typeof reset !== "number" || !Number.isFinite(reset) || reset <= 0) continue
    windows[key] = { used, resetsAt: reset * 1000 }
  }
  if (Object.keys(windows).length === 0) throw new Error("OpenAI did not return recognizable rate limits")
  return windows
}

export function parseResetCredits(payload) {
  const available = payload?.available_count
  if (!Number.isSafeInteger(available) || available < 0) throw new Error("Invalid reset count")
  if (!Array.isArray(payload.credits)) throw new Error("Missing reset details")
  const credits = payload.credits.filter((credit) =>
    credit?.status === "available" && credit.reset_type === "codex_rate_limits" &&
    credit.is_supported_by_plan !== false)
  const expiries = []
  let noExpiry = 0
  let unknown = Math.max(0, available - credits.length)
  for (const credit of credits.slice(0, available)) {
    if (credit.expires_at === null) {
      noExpiry++
    } else if (typeof credit.expires_at === "string" && Number.isFinite(Date.parse(credit.expires_at))) {
      expiries.push(Date.parse(credit.expires_at))
    } else {
      unknown++
    }
  }
  expiries.sort((a, b) => a - b)
  return { available, expiries, noExpiry, unknown }
}

export function resetCountOnly(usage) {
  const available = usage?.rate_limit_reset_credits?.available_count
  if (!Number.isSafeInteger(available) || available < 0) return undefined
  return { available, expiries: [], noExpiry: 0, unknown: available }
}

export function accountID(metadata, access) {
  const fromMetadata = metadata?.account_id ?? metadata?.accountId
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata
  try {
    const claims = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8"))
    const id = claims?.["https://api.openai.com/auth"]?.chatgpt_account_id
    return typeof id === "string" && id ? id : undefined
  } catch {
    return undefined
  }
}
