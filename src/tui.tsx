import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { OpenAILimits } from "./rpc"
import { timeUntil } from "./time.mjs"
import { createSnapshotCache } from "./cache.mjs"

type Window = { used: number; resetsAt: number }
type Resets = { available: number; expiries: number[]; noExpiry: number; unknown: number }
type Snapshot = { status: string; message: string; fiveHour?: Window; weekly?: Window; resets?: Resets; fetchedAt?: number }

function date(ms: number) {
  return new Date(ms).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

function bar(used: number) {
  const count = Math.round(Math.max(0, Math.min(100, used)) / 10)
  return "━".repeat(count) + "┄".repeat(10 - count)
}

function Limit(props: { title: string; value?: Window; now: number }) {
  const ctx = usePlugin()
  const remaining = () => props.value ? Math.max(0, 100 - props.value.used) : undefined
  const reset = () => props.value ? date(props.value.resetsAt) : ""
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={ctx.theme.text.base}>{props.title}  {remaining() === undefined ? "—" : `${remaining()!.toFixed(0)}% осталось`}</text>
      <Show when={props.value}>
        <text fg={props.value!.used >= 90 ? ctx.theme.text.base : ctx.theme.text.muted}>{bar(props.value!.used)}  {props.value!.used.toFixed(0)}%</text>
        <text fg={ctx.theme.text.base}>До сброса: {timeUntil(props.value!.resetsAt, props.now)}</text>
        <text fg={ctx.theme.text.muted}>Сброс: {reset()}</text>
      </Show>
    </box>
  )
}

function ResetCredits(props: { value?: Resets }) {
  const ctx = usePlugin()
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={ctx.theme.text.base}>↻  ПОЛНЫЕ СБРОСЫ · {props.value?.available ?? "—"}</text>
      <Show when={props.value} fallback={<text fg={ctx.theme.text.muted}>Данные о сбросах недоступны</text>}>
        <Show when={props.value!.available > 0}>
          {props.value!.expiries.map((expiry, index) =>
            <text fg={ctx.theme.text.muted}>#{index + 1}  до {date(expiry)}</text>)}
          <Show when={props.value!.noExpiry > 0}>
            <text fg={ctx.theme.text.muted}>Без срока: {props.value!.noExpiry}</text>
          </Show>
          <Show when={props.value!.unknown > 0}>
            <text fg={ctx.theme.text.muted}>Срок неизвестен: {props.value!.unknown}</text>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

function Sidebar(props: { cache: ReturnType<typeof createSnapshotCache> }) {
  const ctx = usePlugin()
  const [snapshot, setSnapshot] = createSignal<Snapshot>(props.cache.get())
  const [now, setNow] = createSignal(Date.now())

  const unsubscribe = props.cache.subscribe((value: Snapshot) => setSnapshot(value))
  onMount(() => { void props.cache.refresh() })
  const timer = setInterval(() => void props.cache.refresh(), 15_000)
  const clock = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => { unsubscribe(); clearInterval(timer); clearInterval(clock) })

  return (
    <box flexDirection="column" marginTop={1} marginBottom={1}>
      <text fg={ctx.theme.text.base}>◈  OPENAI · ЛИМИТЫ</text>
      <Show when={snapshot().status === "ok"} fallback={<text fg={ctx.theme.text.muted}>{snapshot().message}</text>}>
        <Show when={snapshot().fiveHour}>
          <Limit title="5 часов" value={snapshot().fiveHour} now={now()} />
        </Show>
        <Show when={snapshot().weekly}>
          <Limit title="Неделя" value={snapshot().weekly} now={now()} />
        </Show>
        <ResetCredits value={snapshot().resets} />
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "openai-limits-local.tui",
  setup(ctx) {
    const cache = createSnapshotCache(() => ctx.client.rpc(OpenAILimits).read({}))
    const stop = ctx.data.on("credential.switched", () => {
      cache.invalidate()
      void cache.refresh()
    })
    const remove = ctx.ui.slot({ append: "sidebar.content", render: () => <Sidebar cache={cache} /> })
    return () => { stop(); remove() }
  },
})
