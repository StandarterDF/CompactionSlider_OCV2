// Pure helpers shared by the server plugin and the TUI dialog.
// No OpenCode imports here, so the logic is easy to unit-test on Node.

// The slider is coarse in the safe part of the range and fine near the top:
// 10, 15, ... 90, 95, 96, 97, 98, 99.
export const DEFAULT_BOUNDS = Object.freeze({
  min: 10,
  max: 99,
  step: 5,
  fineFrom: 95,
  fineStep: 1,
})

function integer(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

// Normalise `min` / `max` / `step` / `fineFrom` / `fineStep` from plugin options.
export function resolveBounds(options = {}) {
  const min = clamp(integer(options.min, DEFAULT_BOUNDS.min), 1, 99)
  let max = clamp(integer(options.max, DEFAULT_BOUNDS.max), 2, 100)
  if (max <= min) max = Math.min(100, min + 1)
  const step = clamp(integer(options.step, DEFAULT_BOUNDS.step), 1, 50)
  const fineFrom = clamp(integer(options.fineFrom, DEFAULT_BOUNDS.fineFrom), min, max)
  const fineStep = clamp(integer(options.fineStep, DEFAULT_BOUNDS.fineStep), 1, step)
  return { min, max, step, fineFrom, fineStep }
}

// Snap a percentage to the slider grid: the coarse grid anchored at `min` below
// `fineFrom`, then the fine grid anchored at `fineFrom`.
export function snapPercent(value, bounds) {
  const n = clamp(integer(value, bounds.min), bounds.min, bounds.max)
  if (n >= bounds.fineFrom) {
    const steps = Math.round((n - bounds.fineFrom) / bounds.fineStep)
    return clamp(bounds.fineFrom + steps * bounds.fineStep, bounds.fineFrom, bounds.max)
  }
  const steps = Math.round((n - bounds.min) / bounds.step)
  return clamp(bounds.min + steps * bounds.step, bounds.min, bounds.max)
}

// Move one slider notch in `direction` (+1 / -1). Below the fine boundary the
// notch is `step`, above it `fineStep`; crossing the boundary lands exactly on
// it so the fine zone is always reachable.
export function movePercent(current, direction, bounds) {
  const value = snapPercent(current, bounds)
  if (direction > 0) {
    if (value >= bounds.fineFrom) {
      return clamp(value + bounds.fineStep, bounds.min, bounds.max)
    }
    const next = value + bounds.step
    return next >= bounds.fineFrom ? bounds.fineFrom : clamp(next, bounds.min, bounds.max)
  }
  if (value > bounds.fineFrom) {
    const next = value - bounds.fineStep
    return next <= bounds.fineFrom ? bounds.fineFrom : next
  }
  return clamp(value - bounds.step, bounds.min, bounds.max)
}

// Percentage of `base` used by `budget` (1..100), or undefined when unknown.
export function percentFor(budget, base) {
  const b = Number(base)
  const used = Number(budget)
  if (!(b > 0) || !(used > 0)) return undefined
  return clamp(Math.round((used / b) * 100), 1, 100)
}

// Absolute token limit for a percentage of the model's source maximum.
export function targetTokens(base, percent) {
  const b = Number(base)
  const pct = clamp(Number(percent) || 0, 1, 100)
  if (!(b > 0)) return 0
  return Math.max(1, Math.round((b * pct) / 100))
}

// OpenCode keeps a buffer free below the limit before automatic compaction.
// Budget docs: 15% of the limit, at least 16k; a buffer >= limit is ignored.
export function estimateCompaction(budget) {
  const limit = Math.max(0, Math.round(Number(budget) || 0))
  if (limit === 0) return { budget: 0, buffer: 0, threshold: 0 }
  const buffer = Math.max(16000, Math.round(limit * 0.15))
  if (buffer >= limit) return { budget: limit, buffer: 0, threshold: limit }
  return { budget: limit, buffer, threshold: limit - buffer }
}

export function modelKey(providerID, modelID) {
  return `${providerID}/${modelID}`
}

export function splitKey(key) {
  const text = String(key ?? "")
  const index = text.indexOf("/")
  if (index <= 0 || index === text.length - 1) return undefined
  return { providerID: text.slice(0, index), modelID: text.slice(index + 1) }
}

// Optional allowlist from plugin options. Empty / missing means "all models".
export function isAllowed(providerID, modelID, options = {}) {
  const providers = Array.isArray(options.providers) ? options.providers : undefined
  if (providers && providers.length > 0 && !providers.includes(providerID)) return false
  const models = Array.isArray(options.models) ? options.models : undefined
  if (models && models.length > 0 && !models.includes(modelKey(providerID, modelID))) return false
  return true
}

export function formatTokens(value) {
  const n = Math.max(0, Math.round(Number(value) || 0))
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}
