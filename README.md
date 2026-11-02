# OpenAI limits for OpenCode V2

Shows the **ChatGPT/Codex** five-hour and weekly usage windows and banked **full reset credits** in OpenCode TUI's right sidebar. Shows remaining %, used %, reset time **and time remaining until reset**, count of available full resets, and each known credit expiry in local time. Usage is cached across tab switches for 60 seconds; a stale reading remains visible while refreshing, and account switches clear it immediately. Countdowns update locally every 30 seconds. Never spends a reset. Never stores credentials or sends them to the TUI: the server plugin uses OpenCode's active OpenAI OAuth connection to query the read-only `https://chatgpt.com/backend-api/wham/usage` and `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits` endpoints. It returns only percentages, counts and timestamps, not credit IDs or personal data.

Install globally: clone this repository and add the absolute path to your checkout to `plugins` in `~/.config/opencode/opencode.jsonc`, e.g. `"/path/to/opencode-openai-limits"`. Configuration hot-reloads; `/reload` can force it. Authenticate OpenAI through the ChatGPT/Codex OAuth option in OpenCode. API keys do **not** expose these subscription quotas. OpenCode's own `/api/experimental/usage/limits` is for OpenCode Go/Console, **not** OpenAI.

These endpoints are undocumented OpenAI APIs: their format or access policy may change. If the detail endpoint fails, the summary count from usage is shown but expiries say "unknown"; no dates are invented. Only available in the full TUI sidebar, not `mini` or desktop. The percentage shown is of the subscription allowance; it is not a token count.

The API's primary/secondary window positions do not identify their duration. The widget uses `limit_window_seconds` to distinguish a 5-hour limit (18,000 seconds) from a weekly one (604,800 seconds). Pro can expose only a weekly *primary* window; in that case the 5-hour field is hidden. Unknown durations are never labeled as either window.

After switching accounts, a `chatgpt-token-sharing` connection may be active. On this machine, OpenAI returns 401 for the quota endpoints with that method even with a fresh token. Choose a ChatGPT browser/headless sign-in for the account whose quotas you want to see; a successful model call does not imply the token can read the private quota API.

Run `npm test` for parser tests.
