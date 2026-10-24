// CompactionSlider — OpenCode V2 server plugin.
//
// Purpose: let the user choose, per model, at what percentage of the model's
// real context window automatic compaction should start. The value is stored
// in the plugin's durable storage and applied through a model transform, so it
// survives registry rebuilds and model switches without editing opencode.json.
//
// Why `limit.input` and `limit.context` are both set:
//   * OpenCode budgets automatic compaction from the model's usable input
//     limit (`limit.input` when present, otherwise `limit.context`).
//   * An explicit `limit` block in opencode.json is merged *after* model
//     transforms, so `limit.context` from the config wins over a transform.
//     `limit.input` set by a transform is preserved, which keeps the chosen
//     compaction threshold effective even for models that still carry a
//     `limit.context` override in the user's config.
//   * The TUI reports `contextConflict` when that config override is present
//     and recommends removing it so the displayed context matches the chosen
//     percentage.
//
// The TUI plugin (tui.tsx) calls the `state` / `set` RPC methods exposed here.

import { appendFileSync } from "node:fs"
import { CompactionSlider } from "./rpc.js"
import {
  estimateCompaction,
  isAllowed,
  modelKey,
  percentFor,
  resolveBounds,
  snapPercent,
  splitKey,
  targetTokens,
} from "./settings.js"

const STORAGE_KEY = "percents"
const DEBUG_LOG = process.env.COMPACTION_SLIDER_DEBUG

function log(message) {
  console.log(`[compaction-slider] ${message}`)
  if (!DEBUG_LOG) return
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Ignore debug write failures.
  }
}

function positive(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function sourceBase(model) {
  return positive(model?.limit?.input) || positive(model?.limit?.context)
}

function sanitizePercents(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!splitKey(key)) continue
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1 || n > 100) continue
    out[key] = Math.round(n)
  }
  return out
}

export default {
  id: "opencode.compaction-slider",

  async setup(ctx) {
    const options = ctx.options ?? {}
    const bounds = resolveBounds(options)

    // "provider/model" -> chosen percentage (only models the user changed).
    let percents = sanitizePercents(await ctx.storage.get(STORAGE_KEY))
    // "provider/model" -> context maximum from the provider source (models.dev).
    // Never taken from the user config, so a manual limit.context override
    // does not become the 100% baseline.
    const bases = new Map()
    // "provider/model" -> display name from the source definition.
    const names = new Map()

    let transform
    try {
      transform = await ctx.model.transform((editor) => {
        // 1. Refresh source maxima for every provider/model. This is a cheap
        //    pass and also covers models that were added after startup.
        for (const record of editor.provider.list()) {
          const providerID = record?.provider?.id
          if (!providerID) continue
          const models = record.models instanceof Map ? record.models : new Map(Object.entries(record.models ?? {}))
          for (const [modelID, source] of models) {
            const base = sourceBase(source)
            if (base > 0) bases.set(modelKey(providerID, modelID), base)
            if (source?.name) names.set(modelKey(providerID, modelID), source.name)
          }
        }

        // 2. Apply every stored percentage.
        for (const [key, percent] of Object.entries(percents)) {
          const parsed = splitKey(key)
          if (!parsed) continue
          const { providerID, modelID } = parsed
          if (!isAllowed(providerID, modelID, options)) continue

          const base = bases.get(key)
          if (!base) continue
          const target = targetTokens(base, percent)
          if (!(target > 0)) continue

          const current = editor.get(providerID, modelID)
          if (!current) continue
          if (positive(current.limit?.context) === target && positive(current.limit?.input) === target) continue

          editor.update(providerID, modelID, (draft) => {
            draft.limit = { ...(draft.limit ?? {}), context: target, input: target }
          })
        }
      })
    } catch (error) {
      log(`could not register the model transform: ${error}`)
      return
    }

    // Replay once so `bases` is populated and the UI has something to show.
    try {
      await ctx.model.list()
    } catch (error) {
      log(`could not read the model registry: ${error}`)
    }

    const effectiveModel = async (providerID, modelID) => {
      const list = await ctx.model.list()
      const data = list?.data ?? list ?? []
      return data.find((model) => model.providerID === providerID && model.id === modelID)
    }

    const readState = async (input) => {
      const providerID = String(input?.providerID ?? "")
      const modelID = String(input?.modelID ?? "")
      if (!providerID || !modelID) throw new Error("providerID and modelID are required")
      if (!isAllowed(providerID, modelID, options)) {
        throw new Error(`Model is excluded by plugin options: ${modelKey(providerID, modelID)}`)
      }

      const key = modelKey(providerID, modelID)
      const model = await effectiveModel(providerID, modelID)
      if (!model) throw new Error(`Model not found: ${key}`)

      const budget = positive(model.limit?.input) || positive(model.limit?.context)
      const base = bases.get(key) || budget
      if (!(base > 0)) throw new Error(`Cannot determine the context maximum for ${key}`)

      const stored = percents[key]
      const managed = Number.isInteger(stored)
      // Unmanaged models derive their percentage from the current budget, which
      // can be 100% (model at its full limit) — the slider must stay inside the
      // allowed range so the first key press does not send an out-of-range value.
      // `currentPercent` keeps the real value so the dialog can show it.
      const currentPercent = percentFor(budget, base) ?? bounds.min
      const derived = managed ? stored : currentPercent
      const percent = Math.min(bounds.max, Math.max(bounds.min, derived))
      const expected = targetTokens(base, percent)
      const estimate = estimateCompaction(budget)
      const context = positive(model.limit?.context)

      return {
        providerID,
        modelID,
        name: names.get(key) ?? model.name ?? modelID,
        base,
        budget,
        context,
        percent,
        currentPercent,
        managed,
        expected,
        compaction: estimate.threshold,
        buffer: estimate.buffer,
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
        fineFrom: bounds.fineFrom,
        fineStep: bounds.fineStep,
        // Functional conflict: the config overrides `limit.input`, so the
        // chosen threshold is not actually in effect.
        inputConflict: managed && positive(model.limit?.input) !== expected,
        // Cosmetic conflict: `limit.context` in the config still wins, so the
        // context readout may disagree with the chosen percentage.
        contextConflict: managed && context > 0 && context !== expected,
      }
    }

    const registration = await ctx.rpc.register(CompactionSlider, {
      state: async (input) => readState(input),
      set: async (input) => {
        const providerID = String(input?.providerID ?? "")
        const modelID = String(input?.modelID ?? "")
        if (!providerID || !modelID) throw new Error("providerID and modelID are required")
        if (!isAllowed(providerID, modelID, options)) {
          throw new Error(`Model is excluded by plugin options: ${modelKey(providerID, modelID)}`)
        }

        const key = modelKey(providerID, modelID)
        if (input?.reset === true) {
          delete percents[key]
        } else {
          const percent = snapPercent(input?.percent, bounds)
          if (!bases.has(key)) throw new Error(`Cannot determine the context maximum for ${key}`)
          percents[key] = percent
        }

        await ctx.storage.set(STORAGE_KEY, percents)
        await ctx.model.reload()
        const state = await readState({ providerID, modelID })

        log(
          input?.reset === true
            ? `${key}: reset to the configured limit (${state.percent}%)`
            : `${key}: ${state.percent}% -> ${state.budget} tokens (source max ${state.base})`,
        )

        return state
      },
    })

    for (const [key, percent] of Object.entries(percents)) {
      const base = bases.get(key)
      if (!base) continue
      const target = targetTokens(base, percent)
      const parsed = splitKey(key)
      if (!parsed) continue
      const model = await effectiveModel(parsed.providerID, parsed.modelID)
      if (!model) continue
      const input = positive(model.limit?.input)
      const context = positive(model.limit?.context)
      if (input !== target) {
        log(`${key}: limit.input is ${input || "unset"}, expected ${target} (a config override wins)`)
      } else if (context !== target) {
        log(`${key}: limit.context is ${context} (config override); compaction still uses ${target}`)
      }
    }

    log(`ready: ${Object.keys(percents).length} managed model(s), ${bases.size} source maxima`)

    return async () => {
      await registration.dispose()
      await transform.dispose()
    }
  },
}
