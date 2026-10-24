// RPC contract shared by the server plugin (implementation) and the TUI
// plugin (client). Keeping it in one file means the schemas cannot drift.

import { Rpc } from "@opencode/plugin/rpc"

const ref = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
  },
  required: ["providerID", "modelID"],
  additionalProperties: false,
}

const status = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
    name: { type: "string" },
    base: { type: "integer" },
    budget: { type: "integer" },
    context: { type: "integer" },
    percent: { type: "integer" },
    currentPercent: { type: "integer" },
    managed: { type: "boolean" },
    expected: { type: "integer" },
    compaction: { type: "integer" },
    buffer: { type: "integer" },
    min: { type: "integer" },
    max: { type: "integer" },
    step: { type: "integer" },
    fineFrom: { type: "integer" },
    fineStep: { type: "integer" },
    inputConflict: { type: "boolean" },
    contextConflict: { type: "boolean" },
  },
  required: [
    "providerID",
    "modelID",
    "name",
    "base",
    "budget",
    "context",
    "percent",
    "currentPercent",
    "managed",
    "expected",
    "compaction",
    "buffer",
    "min",
    "max",
    "step",
    "fineFrom",
    "fineStep",
    "inputConflict",
    "contextConflict",
  ],
  additionalProperties: false,
}

export const CompactionSlider = Rpc.define({
  id: "opencode.compaction-slider",
  methods: {
    state: {
      input: ref,
      output: status,
    },
    set: {
      input: {
        type: "object",
        properties: {
          providerID: { type: "string" },
          modelID: { type: "string" },
          percent: { type: "integer", minimum: 1, maximum: 100 },
          reset: { type: "boolean" },
        },
        required: ["providerID", "modelID"],
        additionalProperties: false,
      },
      output: status,
    },
  },
  events: {},
})
