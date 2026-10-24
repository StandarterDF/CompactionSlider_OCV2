import assert from "node:assert/strict"
import {
  DEFAULT_BOUNDS,
  estimateCompaction,
  formatTokens,
  isAllowed,
  modelKey,
  movePercent,
  percentFor,
  resolveBounds,
  snapPercent,
  splitKey,
  targetTokens,
} from "../plugin/settings.js"

// Defaults
assert.deepEqual(resolveBounds({}), DEFAULT_BOUNDS)
assert.deepEqual(DEFAULT_BOUNDS, { min: 10, max: 99, step: 5, fineFrom: 95, fineStep: 1 })

// Options are clamped and ordered
assert.deepEqual(resolveBounds({ min: 0, max: 200, step: 0 }), {
  min: 1,
  max: 100,
  step: 1,
  fineFrom: 95,
  fineStep: 1,
})
assert.deepEqual(resolveBounds({ min: 90, max: 20, step: 5 }), {
  min: 90,
  max: 91,
  step: 5,
  fineFrom: 91,
  fineStep: 1,
})

// Slider snaps to the coarse grid below the fine boundary
assert.equal(snapPercent(22, DEFAULT_BOUNDS), 20)
assert.equal(snapPercent(23, DEFAULT_BOUNDS), 25)
assert.equal(snapPercent(1, DEFAULT_BOUNDS), 10)
assert.equal(snapPercent(100, DEFAULT_BOUNDS), 99)
assert.equal(snapPercent(94, DEFAULT_BOUNDS), 95)

// ... and to the fine grid at the top
assert.equal(snapPercent(95, DEFAULT_BOUNDS), 95)
assert.equal(snapPercent(96, DEFAULT_BOUNDS), 96)
assert.equal(snapPercent(97.4, DEFAULT_BOUNDS), 97)
assert.equal(snapPercent(98.6, DEFAULT_BOUNDS), 99)

// One notch: coarse below 95, single percent at 95+
assert.equal(movePercent(90, 1, DEFAULT_BOUNDS), 95)
assert.equal(movePercent(95, 1, DEFAULT_BOUNDS), 96)
assert.equal(movePercent(98, 1, DEFAULT_BOUNDS), 99)
assert.equal(movePercent(99, 1, DEFAULT_BOUNDS), 99)
assert.equal(movePercent(96, -1, DEFAULT_BOUNDS), 95)
assert.equal(movePercent(95, -1, DEFAULT_BOUNDS), 90)
assert.equal(movePercent(90, -1, DEFAULT_BOUNDS), 85)
assert.equal(movePercent(10, -1, DEFAULT_BOUNDS), 10)
assert.equal(movePercent(25, 1, DEFAULT_BOUNDS), 30)

// Percent and absolute tokens
assert.equal(targetTokens(1_000_000, 95), 950_000)
assert.equal(targetTokens(1_000_000, 99), 990_000)
assert.equal(targetTokens(1_048_576, 20), 209_715)
assert.equal(percentFor(222_222, 1_000_000), 22)
assert.equal(percentFor(0, 1_000_000), undefined)

// Compaction estimate (15%, minimum 16k)
assert.deepEqual(estimateCompaction(222_222), { budget: 222_222, buffer: 33_333, threshold: 188_889 })
assert.deepEqual(estimateCompaction(50_000), { budget: 50_000, buffer: 16_000, threshold: 34_000 })
assert.deepEqual(estimateCompaction(0), { budget: 0, buffer: 0, threshold: 0 })

// Keys survive model ids with slashes
assert.equal(modelKey("openrouter", "anthropic/claude"), "openrouter/anthropic/claude")
assert.deepEqual(splitKey("openrouter/anthropic/claude"), {
  providerID: "openrouter",
  modelID: "anthropic/claude",
})
assert.equal(splitKey("broken"), undefined)

// Allowlist
assert.equal(isAllowed("a", "b", {}), true)
assert.equal(isAllowed("a", "b", { providers: ["a"] }), true)
assert.equal(isAllowed("a", "b", { providers: ["x"] }), false)
assert.equal(isAllowed("a", "b", { models: ["a/b"] }), true)
assert.equal(isAllowed("a", "b", { models: ["a/c"] }), false)

// Formatting
assert.equal(formatTokens(950000), "950 000")
assert.equal(formatTokens(1_000_000), "1 000 000")

console.log("settings tests: OK")
