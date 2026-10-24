# OpenCode_CompactionSlider

> Плагин для OpenCode V2: слайдер, которым задаётся порог авто-compaction —
> **10–99 % от реального максимального контекста модели**, отдельно для каждой
> модели, без правки `opencode.json`.

## Описание

OpenCode запускает автоматическое сжатие контекста (compaction), когда запрос
приближается к лимиту модели. Если в `opencode.json` стоит заниженный
`limit.context`, сжатие срабатывает слишком рано — иногда в каждом ходе.

Плагин даёт ручку управления: выбранная модель, процент от её **настоящего**
максимума (из каталога провайдера / models.dev, а не из конфига) и кнопка
«Сохранить». Значение живёт в хранилище плагина, применяется на лету и не
переписывает `opencode.json`.

**Возможности:**

- команда `/ctx-percent` (алиас `/ctxpct`) открывает диалог со слайдером;
  отдельной команды в палитре нет — только слэш-команда;
- диапазон 10–99 %, шаг 5 % в безопасной части и **1 % с 95 %** — верхняя
  граница выставляется точно;
- 100 % — это реальный максимум контекста модели из каталога провайдера:
  для `opencode-go/deepseek-v4.1-flash` это `1 000 000`, даже если в конфиге
  стоит `222 222`;
- значение хранится **по модели** (`provider/model`) и переживает перезапуск;
- применяется без перезапуска: серверный плагин переигрывает каталог моделей
  (`ctx.model.reload()`), TUI сразу видит новый лимит;
- показывает, где начнётся compaction с учётом буфера OpenCode
  (`max(16k, 15 % лимита)`);
- кнопка «Сброс» возвращает модель к лимиту из конфига;
- предупреждает, если `limit` в `opencode.json` перекрывает выбранное значение.

## Требования

- OpenCode **V2**.
- Node.js **18+** (OpenCode уже включает его).
- Сборка не нужна: TUI-часть (`tui.tsx`) компилирует сам OpenCode.

## Структура

```
CompactionSlider_OCV2/
├── opencode.json          # пустой проектный конфиг (только $schema)
├── install.bat            # установка в глобальный каталог OpenCode (Windows)
├── plugin/
│   ├── index.js           # серверный плагин: transform лимитов, storage, RPC
│   ├── tui.tsx            # TUI-плагин: команда /ctx-percent и диалог-слайдер
│   ├── rpc.js             # общий контракт RPC (state/set)
│   ├── settings.js        # чистые помощники (границы, снап, расчёт токенов)
│   └── package.json       # "type": "module", exports ".", "./tui"
├── tests/settings.test.mjs  # юнит-тесты settings.js (node tests/settings.test.mjs)
├── README.md
├── CHANGES.md             # незакоммиченные изменения
├── AGENTS.md              # описание архитектуры проекта
└── LICENSE                # MIT
```

## Как это работает

1. TUI-плагин регистрирует команду `/ctx-percent`. Она берёт модель, выбранную
   в промпте, и через RPC `state` спрашивает у серверного плагина текущее
   состояние.
2. Серверный плагин на каждом переигрывании каталога (`ctx.model.transform`)
   запоминает **исходный** максимум каждой модели (`limit.input` или
   `limit.context` из каталога провайдера).
3. Сохранённый процент превращается в абсолютный лимит:
   `tokens = round(source_max * percent / 100)`.
4. Лимит записывается в модель через `editor.update` (`limit.context` и
   `limit.input`). После сохранения вызывается `ctx.model.reload()`.
5. Compaction оценивается по правилу OpenCode: порог = лимит − буфер, где
   буфер = `max(16 000, 15 % лимита)`.

### Почему выставляются оба поля

- Авто-compaction в OpenCode считается от **usable input** модели:
  `limit.input`, а если его нет — `limit.context`.
- Явный блок `limit` в `opencode.json` мержится **после** трансформаций
  модели, поэтому `limit.context` из конфига побеждает трансформ.
- `limit.input` из трансформа при этом сохраняется — именно он и держит
  выбранный порог compaction.

Итог: порог compaction работает даже при старом `limit.context` в конфиге, но
**счётчик контекста** в интерфейсе может показывать конфиговое значение. Плагин
сообщает об этом в диалоге и рекомендует убрать `limit` у модели.

## Установка

### Вариант 1. Автоматически, силами нейросети (рекомендуется)

Скопируй промт ниже и отправь его OpenCode. Агент сам установит плагин,
почистит конфликтующий `limit` в конфиге, перезапустит сервис и проверит
результат.

```text
Установи мне плагин OpenCode V2 CompactionSlider из репозитория
https://github.com/StandarterDF/CompactionSlider_OCV2 (замени URL на свой форк,
если он у тебя другой).

Что нужно сделать:
1. Определи каталог глобального конфига OpenCode:
   - Windows: %USERPROFILE%\.config\opencode  (или %XDG_CONFIG_HOME%\opencode)
   - Linux/macOS: ~/.config/opencode  (или $XDG_CONFIG_HOME/opencode)
   Каталог глобальных плагинов — <config>/plugins/.
2. Установи плагин: скопируй содержимое папки plugin/ репозитория
   (index.js, tui.tsx, rpc.js, settings.js, package.json) в
   <config>/plugins/compaction-slider/.
   Либо выполни: opencode plugin add 'github:StandarterDF/CompactionSlider_OCV2#main::path:plugin'
3. Найди в <config>/opencode.json блоки providers.<provider>.models.<model>.limit
   и предложи мне убрать у модели opencode-go/deepseek-v4.1-flash поля
   limit.context и limit.input: теперь порог задаёт плагин, а занижённый
   limit.context ломает счётчик контекста. Не удаляй limit.output.
4. Перезапусти сервис: opencode service restart
5. Проверь работу: выполни opencode run "reply with OK" и покажи мне строки
   лога [compaction-slider] ... (при необходимости включи
   COMPACTION_SLIDER_DEBUG). Затем напомни, что команда — /ctx-percent.
   Если плагин не загрузился — продиагностируй причину и доведи установку
   до конца.

Действуй автономно, лишних вопросов не задавай. В конце кратко отчитайся: что
установил, какие файлы изменил, какой лимит теперь у модели.
```

### Вариант 2. Одной командой через CLI

Если репозиторий опубликован на GitHub:

```bash
opencode plugin add 'github:StandarterDF/CompactionSlider_OCV2#main::path:plugin'
```

CLI скачает пакет, установит его и добавит запись в конфиг. Затем:

```bash
opencode service restart
```

### Вариант 3. Вручную (Windows)

Запусти из корня репозитория:

```bat
install.bat
```

Скрипт скопирует `plugin/` в
`%USERPROFILE%\.config\opencode\plugins\compaction-slider\`.

Для Linux / macOS глобальный путь —
`~/.config/opencode/plugins/compaction-slider/`.

### Вариант 4. Только для одного проекта

Положи каталог плагина в проект и подключи его проектной конфигурацией:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./plugin"]
}
```

## Использование

1. Выбери модель в промпте.
2. Введи `/ctx-percent` (алиас `/ctxpct`).
3. Управление:

   | Клавиша | Действие |
   |---|---|
   | `←` / `h` | −1 шаг (5 % ниже 95 %, 1 % начиная с 95 %) |
   | `→` / `l` | +1 шаг |
   | `Enter` | сохранить |
   | `R` | сброс к лимиту из конфига |
   | `Esc` | отмена |

   Те же действия доступны мышью по `←`, `→`, `[ Сохранить ]`, `[ Сброс ]`,
   `[ Отмена ]`.

В диалоге видно: текущий лимит модели, выбранный процент, абсолютный лимит в
токенах, исходный максимум и ожидаемый порог срабатывания compaction.

### Почему compaction наступает раньше лимита

OpenCode держит ниже лимита резерв: `compaction.buffer` (по умолчанию 15 % от
лимита, минимум 16k). При лимите 950 000 резерв ≈ 142 500, поэтому сжатие
начинается на ≈ 807 500. Слайдер задаёт **лимит модели**, а не точку сжатия.

Если нужен порог ближе к верхней границе, уменьши резерв в `opencode.json`:

```jsonc
{
  "compaction": { "buffer": 16000 }
}
```

Тогда при 99 % (990 000) сжатие начнётся на ≈ 974 000. Не ставь резерв больше
лимита — OpenCode такой буфер игнорирует.

## Настройка

Параметры передаются объектной формой в `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./plugin",
      "options": {
        "min": 10,
        "max": 99,
        "step": 5,
        "fineFrom": 95,
        "fineStep": 1,
        "models": ["opencode-go/deepseek-v4.1-flash"]
      }
    }
  ]
}
```

| Опция | По умолчанию | Описание |
|---|---|---|
| `min` | `10` | Нижняя граница слайдера, % (1–99). |
| `max` | `99` | Верхняя граница слайдера, % (2–100). |
| `step` | `5` | Шаг слайдера ниже `fineFrom`, % (1–50). |
| `fineFrom` | `95` | С какого процента включается точная настройка. |
| `fineStep` | `1` | Шаг точной настройки, % (1…`step`). |
| `providers` | — | Allowlist провайдеров; пусто — все. |
| `models` | — | Allowlist моделей в виде `provider/model`; пусто — все. |

### Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `COMPACTION_SLIDER_DEBUG` | — | Путь к файлу, куда пишется отладочный лог. Если не задана — лог идёт только в stdout. |

## Проверка

```powershell
# Windows (PowerShell)
$env:COMPACTION_SLIDER_DEBUG="$PWD\compaction-slider-debug.log"; opencode run "reply with OK"
```

```bash
# Linux / macOS
COMPACTION_SLIDER_DEBUG="$PWD/compaction-slider-debug.log" opencode run "reply with OK"
```

В логе должны появиться строки вида:

```
[compaction-slider] ready: 1 managed model(s), 118 source maxima
[compaction-slider] opencode-go/deepseek-v4.1-flash: 95% -> 950000 tokens (source max 1000000)
```

Юнит-тесты помощников:

```bash
node tests/settings.test.mjs
```

Если слайдер не открывается:

1. Плагин загружен? В логе OpenCode есть `[compaction-slider] ready: ...`.
2. Модель выбрана в промпте? Без неё команда показывает предупреждение.
3. Модель не отсечена опциями `providers` / `models`?
4. После правки файлов плагина перезапусти сервис:
   `opencode service restart`.

## Удаление

1. Убери запись плагина из `opencode.json` (при установке через CLI —
   `opencode plugin remove ...`).
2. Удали каталог `<config>/plugins/compaction-slider/`.
3. Перезапусти сервис: `opencode service restart`.
4. Если хочешь вернуть прежнее поведение — верни `limit` в `opencode.json`.

## Ссылки

- [Документация OpenCode V2 — плагины](https://opencode.ai/v2/docs/build/plugins)
- [Плагины TUI](https://opencode.ai/v2/docs/plugins)
- [OpenCode V2](https://opencode.ai/v2/docs/)

## Лицензия

MIT — см. [LICENSE](LICENSE).
