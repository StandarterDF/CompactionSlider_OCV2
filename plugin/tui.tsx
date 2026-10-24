// CompactionSlider — OpenCode V2 TUI plugin.
//
// Adds a palette/slash command that opens a small slider dialog for the model
// selected in the prompt:
//
//   Порог авто-compaction                          95 %
//   DeepSeek V4.1 Flash · opencode-go/deepseek-v4.1-flash
//   ────────────────────────────────────────────────────────
//   ██████████████████████████████░░  95 %
//   10 %                                             99 %
//
//   Сейчас       950 000 · 95 % · плагин
//   Compaction   ≈ 807 500 · резерв 142 500
//
// Left/Right (or h/l) move one notch — 5 % in the safe part of the range and
// 1 % from 95 % up, Enter saves, R resets the model to its configured limit,
// Escape cancels.
//
// Values are persisted and applied by the server plugin (index.js) through the
// `state` / `set` RPC methods defined in rpc.js.

import { Plugin } from "@opencode/plugin/tui"
import { Show, createSignal } from "solid-js"
import { CompactionSlider } from "./rpc.js"
import { estimateCompaction, formatTokens, movePercent } from "./settings.js"

const BAR_WIDTH = 34
const LABEL = 12

function modelRef(model) {
  if (!model) return undefined
  const providerID = model.providerID ?? model.provider?.id ?? model.provider?.providerID
  let modelID = model.modelID ?? model.id ?? model.model?.id
  let provider = providerID
  if (!provider && typeof modelID === "string" && modelID.includes("/")) {
    const index = modelID.indexOf("/")
    provider = modelID.slice(0, index)
    modelID = modelID.slice(index + 1)
  }
  if (typeof provider !== "string" || provider.length === 0) return undefined
  if (typeof modelID !== "string" || modelID.length === 0) return undefined
  return { providerID: provider, modelID }
}

const DIVIDER = "─".repeat(BAR_WIDTH + 14)

function SliderDialog(props) {
  const context = props.context
  const theme = context.theme
  const state = props.state
  const bounds = {
    min: state.min,
    max: state.max,
    step: state.step,
    fineFrom: state.fineFrom,
    fineStep: state.fineStep,
  }

  const [percent, setPercent] = createSignal(state.percent)
  const [busy, setBusy] = createSignal(false)
  const [note, setNote] = createSignal("")

  const target = () => Math.max(1, Math.round((state.base * percent()) / 100))
  const estimate = () => estimateCompaction(target())
  const notch = () => (percent() >= bounds.fineFrom ? bounds.fineStep : bounds.step)
  const ratio = () => (percent() - bounds.min) / Math.max(1, bounds.max - bounds.min)
  const filled = () => Math.round(ratio() * BAR_WIDTH)
  const empty = () => Math.max(0, BAR_WIDTH - filled())
  const changed = () => percent() !== state.percent

  const close = () => {
    context.ui.dialog.clear()
  }

  const move = (direction) => {
    if (busy()) return
    setPercent((current) => movePercent(current, direction, bounds))
  }

  const save = async (reset) => {
    if (busy()) return
    setBusy(true)
    setNote("")
    try {
      const next = await props.rpc.set({
        providerID: state.providerID,
        modelID: state.modelID,
        percent: percent(),
        reset: reset === true,
      })
      context.ui.toast.show({
        title: "Compaction",
        message:
          reset === true
            ? `${next.name}: сброшено на лимит из конфига (${next.percent}%)`
            : `${next.name}: ${next.percent}% · ${formatTokens(next.budget)} токенов`,
        variant: "success",
      })
      close()
    } catch (error) {
      setNote(String(error?.message ?? error))
      setBusy(false)
    }
  }

  const ids = {
    left: "opencode.compaction-slider.left",
    right: "opencode.compaction-slider.right",
    leftAlt: "opencode.compaction-slider.left-alt",
    rightAlt: "opencode.compaction-slider.right-alt",
    save: "opencode.compaction-slider.save",
    reset: "opencode.compaction-slider.reset",
    cancel: "opencode.compaction-slider.cancel",
  }

  context.keymap.layer(() => ({
    mode: "global",
    priority: 1000,
    commands: [
      { id: ids.left, title: "Меньше", bind: "left", run: () => move(-1) },
      { id: ids.right, title: "Больше", bind: "right", run: () => move(1) },
      { id: ids.leftAlt, title: "Меньше", bind: "h", run: () => move(-1) },
      { id: ids.rightAlt, title: "Больше", bind: "l", run: () => move(1) },
      { id: ids.save, title: "Сохранить", bind: "return", run: () => void save(false) },
      { id: ids.reset, title: "Сбросить", bind: "r", run: () => void save(true) },
      { id: ids.cancel, title: "Отмена", bind: "escape", run: () => close() },
    ],
    bindings: Object.values(ids),
  }))

  const row = (label, value, tone, bold = true) => (
    <text>
      <span style={{ fg: theme.text.muted }}>{label.padEnd(LABEL)}</span>
      <span style={tone ? { fg: tone } : undefined}>{bold ? <b>{value}</b> : value}</span>
    </text>
  )

  const chip = (label, tone, onPress) => (
    <box onMouseDown={onPress}>
      <text fg={tone}>
        <b>{label}</b>
      </text>
    </box>
  )

  const source = () => (state.managed ? "плагин" : "opencode.json")

  return (
    <box flexDirection="column" gap={1} padding={1} minWidth={0}>
      <box flexDirection="row" gap={1} minWidth={0}>
        <text fg={theme.text.base} wrapMode="none">
          <b>Порог авто-compaction</b>
        </text>
        <box flexGrow={1} />
        <text fg={theme.text.feedback.success.base}>
          <b>{`${percent()} %`}</b>
        </text>
      </box>

      <text fg={theme.text.muted} wrapMode="none" truncate>
        {`${state.name} · ${state.providerID}/${state.modelID}`}
      </text>

      <text fg={theme.text.muted}>{DIVIDER}</text>

      <text wrapMode="none">
        <span style={{ fg: theme.text.feedback.success.base }}>{"█".repeat(filled())}</span>
        <span style={{ fg: theme.text.muted }}>{"░".repeat(empty())}</span>
        <span style={{ fg: theme.text.muted }}>{"  │ "}</span>
        <span style={{ fg: theme.text.base }}>
          <b>{formatTokens(target())}</b>
        </span>
      </text>

      <box flexDirection="row" minWidth={0}>
        <text fg={theme.text.muted}>{`${bounds.min} %`}</text>
        <box flexGrow={1} />
        <text fg={theme.text.muted}>{`тонко с ${bounds.fineFrom} % · шаг ${bounds.fineStep} %`}</text>
        <box flexGrow={1} />
        <text fg={theme.text.muted}>{`${bounds.max} %`}</text>
      </box>

      {row(
        "Сейчас",
        `${formatTokens(state.budget)} · ${state.currentPercent} % · ${source()}`,
        changed() ? theme.text.muted : undefined,
      )}
      {row(
        "Станет",
        `${formatTokens(target())} · ${percent()} %`,
        changed() ? theme.text.feedback.success.base : theme.text.muted,
      )}
      {row(
        "Compaction",
        `≈ ${formatTokens(estimate().threshold)} · резерв ${formatTokens(estimate().buffer)}`,
        theme.text.muted,
        false,
      )}

      <Show when={state.inputConflict}>
        <text fg={theme.text.feedback.error.base}>
          Конфиг перекрывает limit.input — уберите limit.input/limit.context у этой модели в opencode.json.
        </text>
      </Show>
      <Show when={state.inputConflict === false && state.contextConflict}>
        <text fg={theme.text.feedback.warning.base}>
          В opencode.json остался limit.context — уберите его, иначе счётчик контекста покажет старое значение.
        </text>
      </Show>
      <Show when={note().length > 0}>
        <text fg={theme.text.feedback.error.base}>{note()}</text>
      </Show>

      <text fg={theme.text.muted}>{DIVIDER}</text>

      <box flexDirection="row" gap={2} minWidth={0}>
        {chip("←", theme.text.base, () => move(-1))}
        {chip("→", theme.text.base, () => move(1))}
        <box flexGrow={1} />
        {chip("[ Сохранить ]", theme.text.feedback.success.base, () => void save(false))}
        {chip("[ Сброс ]", theme.text.feedback.warning.base, () => void save(true))}
        {chip("[ Отмена ]", theme.text.muted, close)}
      </box>

      <text fg={theme.text.muted}>
        {busy()
          ? "Сохранение…"
          : `←/→ ±${notch()} %   Enter сохранить   R сброс   Esc отмена`}
      </text>
    </box>
  )
}

export default Plugin.define({
  id: "opencode.compaction-slider",

  setup(context) {
    const open = async () => {
      const ref = modelRef(context.ui.model.current())
      if (!ref) {
        context.ui.toast.show({
          message: "Сначала выберите модель в промпте",
          variant: "warning",
        })
        return
      }

      // Resolve the RPC client lazily: the server plugin may register its
      // methods after the TUI plugin has been set up.
      let rpc
      let state
      try {
        rpc = context.client.rpc(CompactionSlider)
        state = await rpc.state(ref)
      } catch (error) {
        context.ui.toast.show({
          title: "Compaction",
          message: String(error?.message ?? error),
          variant: "error",
        })
        return
      }

      context.ui.dialog.set({ size: "large", centered: true })
      context.ui.dialog.show(
        () => <SliderDialog context={context} rpc={rpc} state={state} />,
        () => undefined,
      )
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode.compaction-slider.open",
          title: "Порог авто-compaction (%)",
          group: "Контекст",
          slash: { name: "ctx-percent", aliases: ["ctxpct"] },
          enabled: () => true,
          run: open,
        },
      ],
      bindings: ["opencode.compaction-slider.open"],
    }))
  },
})
