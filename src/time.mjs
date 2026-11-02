export function timeUntil(timestamp, now) {
  if (timestamp <= now) return "ожидается обновление"
  const minutes = Math.ceil((timestamp - now) / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remaining = minutes % 60
  return [days && `${days} д`, hours && `${hours} ч`, (remaining || (!days && !hours)) && `${remaining} мин`]
    .filter(Boolean).join(" ")
}
