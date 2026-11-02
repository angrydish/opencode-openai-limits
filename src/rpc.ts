import { Rpc } from "@opencode/plugin/rpc"

const window = {
  type: "object",
  properties: {
    used: { type: "number" },
    resetsAt: { type: "number" },
  },
  required: ["used", "resetsAt"],
  additionalProperties: false,
} as const

const resets = {
  type: "object",
  properties: {
    available: { type: "integer", minimum: 0 },
    expiries: { type: "array", items: { type: "number" } },
    noExpiry: { type: "integer", minimum: 0 },
    unknown: { type: "integer", minimum: 0 },
  },
  required: ["available", "expiries", "noExpiry", "unknown"],
  additionalProperties: false,
} as const

export const OpenAILimits = Rpc.define({
  id: "openai-limits-local",
  methods: {
    read: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "unavailable", "error"] },
          message: { type: "string" },
          fiveHour: window,
          weekly: window,
          resets,
          fetchedAt: { type: "number" },
        },
        required: ["status", "message"],
        additionalProperties: false,
      },
    },
  },
  events: {},
} as const)
