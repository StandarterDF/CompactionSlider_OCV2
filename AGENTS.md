# AGENTS.md — архитектура OpenCode_CompactionSlider

## Назначение

Плагин OpenCode V2, который даёт пользователю слайдер «порог авто-compaction»
для каждой модели: 10–99 % от **реального** максимума контекста модели из
каталога провайдера (models.dev), а не из `opencode.json`. Ниже 95 % слайдер
шагает по 5 %, с 95 % — по 1 %, чтобы верхнюю границу можно было выставить
точно.

Состоит из двух частей в одном пакете:

- серверный плагин `plugin/index.js` — считает и применяет лимиты, хранит
  проценты, отдаёт RPC;
- TUI-плагин `plugin/tui.tsx` — команда `/ctx-percent` и диалог со слайдером.

## Файлы

| Файл | Роль |
|---|---|
| `plugin/index.js` | Серверный плагин: `setup(ctx)`, `ctx.model.transform`, `ctx.storage`, `ctx.rpc.register`. |
| `plugin/tui.tsx` | TUI-плагин: `Plugin.define({ id, setup })`, keymap-слой, диалог. |
| `plugin/rpc.js` | Общий контракт `Rpc.define` (`opencode.compaction-slider`, методы `state` / `set`, `events: {}`). |
| `plugin/settings.js` | Чистые помощники без импортов OpenCode: границы, снап/шаг, токены, оценка compaction, ключи. |
| `plugin/package.json` | `"type": "module"`, `main: index.js`, `exports` (`.`, `./tui`). |
| `opencode.json` | Проектный конфиг (только `$schema`). |
| `install.bat` | Копирует `plugin/` в глобальный каталог плагинов (Windows). |
| `tests/settings.test.mjs` | Юнит-тесты `settings.js` на Node. |
| `README.md` | Описание, установка, настройка, проверка. |
| `CHANGES.md` | Незакоммиченные изменения. |
| `AGENTS.md` | Этот файл. |
| `LICENSE` | MIT. |

## Точки входа

Сервер:

```js
export default {
  id: "opencode.compaction-slider",
  async setup(ctx) { ...; return cleanup }
}
```

TUI:

```ts
export default Plugin.define({
  id: "opencode.compaction-slider",
  setup(context) { /* rpc лениво внутри open(), keymap.layer(...) */ },
})
```

OpenCode (TUI) загружает `./tui` из каталога плагина; `Host.resolve` ищет
`<dir>/tui` с расширениями `.ts/.tsx/.js/.jsx/...`.

## Поток данных

1. `setup(ctx)` читает `ctx.options` (`min`, `max`, `step`, `providers`,
   `models`) и `ctx.storage.get("percents")`
   (`{ "provider/model": percent }`).
2. Регистрируется `ctx.model.transform(callback)`. Callback синхронный и
   повторяемый:
   1. обходит `editor.provider.list()` и запоминает исходный максимум каждой
      модели в `bases: Map<key, tokens>` и её имя в `names`;
   2. для каждого сохранённого процента считает
      `target = round(base * percent / 100)` и через `editor.update` пишет
      `limit = { ...limit, context: target, input: target }`.
3. Один раз вызывается `await ctx.model.list()`, чтобы transform переигрался и
   `bases` заполнился до первого RPC-запроса.
4. RPC `state` читает эффективную модель из `ctx.model.list()`, считает
   `budget`, `percent`, `currentPercent`, `expected`, оценку compaction и флаги
   конфликтов.
5. RPC `set` снапит процент, пишет storage, вызывает `ctx.model.reload()`
   (горячее применение) и возвращает новое состояние.
6. TUI-команда `/ctx-percent` лениво создаёт RPC-клиент
   (`context.client.rpc(CompactionSlider)`), запрашивает `state` для модели из
   `context.ui.model.current()` и показывает диалог. Сохранение вызывает `set`.

## Ключевые решения

### `limit.input` — рабочий рычаг, `limit.context` — для отображения

`limit` из `opencode.json` мержится **после** трансформаций модели, значит
`limit.context` из конфига побеждает значение трансформа. При этом
`limit.input`, выставленный трансформом, сохраняется, а авто-compaction
считается именно от usable input. Поэтому плагин пишет оба поля: порог
compaction работает всегда, а `limit.context` совпадает с выбранным процентом,
когда конфликтующего блока в конфиге нет.

`readState` возвращает:

- `inputConflict` — конфиг перекрыл `limit.input` (порог не действует);
- `contextConflict` — `limit.context` не совпадает с ожидаемым (счётчик
  контекста покажет старое значение).

### База — только каталог провайдера

`sourceBase(model)` берёт `limit.input` или `limit.context` **источника** из
`editor.provider.list()`. Значение из пользовательского конфига в базу не
попадает никогда: иначе занижённый `222 222` стал бы «100 %».

### Процент для неуправляемой модели

Если модель ещё не сохранялась, процент выводится из текущего бюджета
(`percentFor`); в `percent` он **зажимается** в `[min, max]` (модель на полном
лимите даёт 100 %, что вне диапазона слайдера), а реальное значение остаётся в
`currentPercent` — его и показывает строка «Сейчас».

### Сетка слайдера

`snapPercent` ниже `fineFrom` (95 %) округляет к сетке, привязанной к `min`
(10, 15, … 90), а начиная с `fineFrom` — к сетке с шагом `fineStep` (1 %).
`movePercent` двигает на один шаг в сторону: ниже границы это `step`, на
границе и выше — `fineStep`; переход через границу всегда попадает точно в
`fineFrom`, поэтому зона точной настройки достижима стрелками.

### Оценка compaction

`estimateCompaction(budget)` повторяет правило OpenCode: буфер =
`max(16 000, 15 % бюджета)`; если буфер ≥ бюджета, порог равен бюджету.

## Настройки

| Константа / опция | Значение | Смысл |
|---|---|---|
| `DEFAULT_BOUNDS` (`settings.js`) | `{ min: 10, max: 99, step: 5, fineFrom: 95, fineStep: 1 }` | Границы, шаг и зона точной настройки по умолчанию. |
| `options.min/max/step` | из `DEFAULT_BOUNDS` | Переопределение границ и шага. |
| `options.fineFrom/fineStep` | из `DEFAULT_BOUNDS` | С какого процента и с каким шагом работает точная настройка. |
| `options.providers` | — | Allowlist провайдеров. |
| `options.models` | — | Allowlist моделей `provider/model`. |
| `STORAGE_KEY` (`index.js`) | `"percents"` | Ключ `ctx.storage`. |

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `COMPACTION_SLIDER_DEBUG` | Путь к файлу отладочного лога. Если не задана — лог только в stdout. |

## Внешние зависимости

Нет. Серверная часть использует `node:fs` и plugin-context OpenCode
(`ctx.options`, `ctx.storage`, `ctx.model.transform`, `ctx.model.list`,
`ctx.model.reload`, `ctx.rpc.register`). TUI-часть импортирует
`@opencode/plugin/tui` и `solid-js` — их резолвит рантайм OpenCode.

## Архитектурные ограничения

- Плагин **не** переписывает `opencode.json`: значения живут в хранилище
  плагина (hot reload через `ctx.model.reload()`).
- Управляются только модели из allowlist (если он задан); остальные не
  перебираются.
- Изменения `index.js` / `rpc.js` / `settings.js` подхватываются только после
  `opencode service restart`: модули кэшируются на время жизни сервиса.
  `tui.tsx` перезагружается вместе с TUI.
- JSX проверяется только рантаймом OpenCode/esbuild:
  `esbuild plugin/tui.tsx --jsx=automatic --jsx-import-source=solid-js`.
- Значение compaction-порога в диалоге — **оценка** по формуле OpenCode; при
  смене формулы в новой версии её надо обновить в `estimateCompaction`.
