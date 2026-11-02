import { Plugin } from "@opencode/plugin"
import { OpenAILimits } from "./rpc"
import { accountID, parseUsage, parseResetCredits, resetCountOnly } from "./usage.mjs"

const URL = "https://chatgpt.com/backend-api/wham/usage"
const CREDIT_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"

export default Plugin.define({
  id: "openai-limits-local",
  async setup(ctx) {
    await ctx.rpc.register(OpenAILimits, {
      read: async (_input, request) => {
        const connection = await ctx.integration.connection.active("openai")
        if (!connection) return { status: "unavailable", message: "Подключи OpenAI через ChatGPT/Codex OAuth" }
        const credential = await ctx.integration.connection.resolve(connection)
        if (!credential || credential.type !== "oauth" || !credential.access) {
          return { status: "unavailable", message: "Нужен вход OpenAI через ChatGPT, не API-ключ" }
        }

        try {
          const id = accountID(credential.metadata, credential.access)
          const headers = {
            Authorization: `Bearer ${credential.access}`,
            ...(id ? { "ChatGPT-Account-ID": id } : {}),
            Accept: "application/json",
          }
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
          const options = { headers, signal, redirect: "error" as const }
          const response = await fetch(URL, options)
          if (!response.ok) {
            // Never surface the response body: upstream errors may contain account details.
            if (response.status === 401 && credential.methodID === "chatgpt-token-sharing") {
              return { status: "error", message: "OpenAI 401: токен token-sharing не даёт доступ к квотам. Войди через ChatGPT в OpenCode." }
            }
            if (response.status === 401) {
              return { status: "error", message: "OpenAI 401: проверь вход в аккаунт OpenAI" }
            }
            return { status: "error", message: `OpenAI: HTTP ${response.status}` }
          }
          const usage = await response.json()
          const limits = parseUsage(usage)
          let resets: { available: number; expiries: number[]; noExpiry: number; unknown: number } | undefined = resetCountOnly(usage)
          try {
            const details = await fetch(CREDIT_URL, options)
            if (details.ok) resets = parseResetCredits(await details.json())
          } catch {
            // The summary count still works if the detail endpoint is unavailable.
          }
          return { status: "ok", message: "", ...limits, ...(resets ? { resets } : {}), fetchedAt: Date.now() }
        } catch {
          return { status: "error", message: "Не удалось получить лимиты OpenAI" }
        }
      },
    })
  },
})
