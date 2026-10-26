# 02. Техника

Стек, архитектура, данные, платформа, бюджеты. «Допущение» — оценка без замера: упрёшься — проверь и запиши в `docs/допущения.md`.

## 1. Главное
TypeScript strict + Vite + PixiJS 8 (сцена) + HTML/CSS поверх canvas (интерфейс). Логика — чистый TS, гоняется в Node. Данные — `content/` и `game.json`. Платформа — `src/platform/`, в сборку попадает один профиль из `yandex`, `null`, `youtube`.

## 2. Стек
Точные версии без `^` и `~`, `package-lock.json` в git (создаёт M0), установка `npm ci`. Node ≥ 22.18 (скрипты импортируют `.ts`); typescript 7.0.2; vite 8.3.2; pixi.js 8.21.0 (сцена, WebGL, `preference: 'webgl'`); vitest 5.0.3; @playwright/test 1.63.0 (Chromium в облаке — `scripts/ensure-chromium.sh`); lil-gui 0.21.0 (`?debug=1`, только dev, playtest и ссылка продюсера); zzfx 1.4.0 (звуки параметрами); @fontsource/rubik 5.3.0 (кириллица локально); valibot 1.5.0 (схемы); fflate 0.8.3 (ZIP); @types/ysdk 1.2.0.
Не берём: three.js, физику, UI-фреймворки, WebGPU как обязательный рендер, WASM, CDN, Google Fonts.

## 3. Структура и скрипты
```
src/main.ts    платформа → язык → данные → сохранение → сцена → ready
src/core/      цикл, шина событий, PauseManager, rng, логгер
src/sim/       экономика, яйца, вылупление, кормёжка, торг, покупатели, улучшения, офлайн, перерождение
src/content/   загрузка, типы, validate.ts
src/platform/  types.ts, yandex.ts, youtube.ts, null.ts, storage.ts, save-queue.ts
src/scene/     PixiJS: лавка, инкубаторы, витрина, очередь, существа, эффекты
src/ui/        HTML: панели, окна, тосты, t(), числа, кнопки сообществ
src/audio/ analytics/ debug/ studio/ test-api/;  dev/yasdk-mock/;  tests/ e2e/ scripts/
```
Скрипты — `package.json`. `verify`: typecheck → test → validate:content → build:e2e → e2e → build → size → pack → check-release → e2e:release → build:youtube → check:youtube → e2e:youtube (M6-04: youtube-сборка на фейковом `ytgame`, ни одного внешнего запроса, нет кнопок сообществ и подарка «За визит в группу»); `--fast` — первые три, `--full` — плюс `e2e:full`, `--no-e2e` — без e2e; полный лог — в файл `--log`, в консоль — ступени и 40 строк упавшей. Позже: `sim:balance` (`scripts/balance-model.ts`, `01a`, раздел 9), `studio:shots`, `promo:*`, мок `ytgame` для e2e.

## 4. Архитектура
### 4.1 Слои (проверяет `tests/architecture.test.ts`)
- `core`, `sim`, `content` — чистый TS: без DOM, PixiJS, `platform`, `scene`, `ui`, `audio`, `analytics`; из пакетов — только `valibot` в `content`; нет `Math.random` в `core` и `sim`. Гоняются в Node.
- `pixi.js` — только `src/scene/` и `src/main.ts`; `YaGames`, `ysdk`, `ytgame` — только `src/platform/`; `youtube*` и `yandex*` друг друга не импортируют. В `src` нет кириллицы и абсолютных адресов; `window.open` — в одном модуле.
- `scene` и `ui` читают состояние и слушают события; действия игрока — командами в `sim` (`buyEgg`, `tapCreature`, `haggle`, `sell`, `buyUpgrade`), каждая помечает сохранение грязным.

### 4.2 Время и пауза
- `requestAnimationFrame` → накопитель → шаги 1/60 с, не больше 5 за кадр; после паузы накопитель обнуляется. Вылупление, витрина, помощники — тиками логики. Офлайн и «раз в сутки» — от `platform.now()`, разница зажата: < 0 → 0, больше потолка `01a` → потолок.
- `PauseManager`: причины `ad`, `sdk`, `hidden`, `blur`, `menu`, `transition`; игра идёт при пустом наборе. Причина → логика стоит, `AudioContext.suspend()`, `gameplayStop()`; снимает тот, кто поставил. `audioAllowed() === false` глушит звук отдельно.

### 4.3 Состояние
`SaveData` — всё, что переживает перезагрузку (валюты, яйца, существа, витрина, улучшения, помощники, коллекция, календарь, перерождения, настройки, флаги аналитики); поля `v`, `rev`, `savedAt`; миграции `vN → vN+1` с unit-тестом. `localStorage` — через обёртку с префиксом `anomaly-shop:`.

### 4.4 Сцена, интерфейс, ориентация
- PixiJS: фон, прилавок, инкубаторы, витрина, очередь, существа, цифры, частицы; атласы из `assets/`, до арта — примитивы. HTML поверх canvas: сделка, магазин, коллекция, календарь, настройки, пауза, тосты; из любого окна есть «Назад».
- Обе ориентации без блокировки: портрет — лавка сверху, панели снизу; альбом и ПК — лавка слева, панели справа; любые пропорции. Разрешение `min(devicePixelRatio, 2)`, поворот без потери состояния, зоны ≥ 44 px, всё одним тапом.
- Читаемость (UB-07): видимый текст не мельче 12 px, кнопки и ползунки не меньше 44 px по меньшей стороне на 375×812 и 1280×720 (ползунок — 44 px зоны вокруг дорожки 14 px); метка вехи ссылки продюсера — только с `?debug=1`. Проверка — e2e `read-ub`, `layout-read-ub` (обход всех экранов и окон первых 5 минут, `e2e/read-shared.ts`)

## 5. Данные
- `content/*.json` (яйца, виды, покупатели, улучшения, календарь, магазин, стиль), `content/i18n/ru.json`, `en.json`; схемы `*.schema.json` рядом.
- `game.json`: `id`, `title`, `age`, `languages`, `fallbackLanguage`, `bootBackground`, `metrikaCounterId`, `community` (адреса, `placement`), `profiles`. В сборку — публичная часть своего профиля (`__GAME__`): у `youtube` нет ссылок и номера счётчика.
- `validate:content` → `validateContent(files, game)` из `src/content/validate.ts` → `{ ok, errors }`: схемы, связи, паритет ключей ru/en, нет пустых строк. Его запускает Node без сборщика: в `validate.ts` и его импортах — только относительные пути с `.ts` и стираемый синтаксис (без `enum`).

## 6. Платформа
Профиль — режим сборки (раздел 9) или `VITE_PLATFORM`; модуль грузится динамическим импортом по `__PLATFORM__`, в сборку попадает один.

### 6.1 Интерфейс `src/platform/types.ts`
```ts
export interface Platform {
  readonly name: 'yandex' | 'null' | 'youtube';
  readonly device: 'desktop' | 'mobile' | 'tablet';
  readonly caps: { ads: boolean; payments: boolean; community: boolean; analytics: boolean };
  init(): Promise<void>;
  language(): 'ru' | 'en';                      // ru для ru, be, kk, uk, uz; иначе en
  firstFrame(): void; ready(): void;            // ready — строго один раз
  gameplayStart(): void; gameplayStop(): void;  // только на смене состояния
  onPause(cb: () => void): void; onResume(cb: () => void): void;
  audioAllowed(): boolean; onAudioChange(cb: (on: boolean) => void): void;
  showInterstitial(placement: string): Promise<{ shown: boolean }>;
  showRewarded(placement: string): Promise<{ rewarded: boolean }>;
  load(): Promise<string | null>; save(data: string, opts?: { flush?: boolean }): void;
  now(): number;
}
```

### 6.2 `yandex`
`<script src="/sdk.js">` до кода (на ссылке продюсера `sdk.js`); Метрика — в релизе при номере > 0. `YaGames.init()` без таймаута (через 8 с — `sdk_init_slow`), исключение → повтор → `null`. Подписка на `game_api_pause/resume` до `ready()`; язык — `environment.i18n.lang`; `ready()` — лавка нарисована, тап работает. Реклама: причина `ad` до вызова, свой `requestId`, сторож 10 с, награда только в `onRewarded`.

### 6.3 `youtube` (YouTube Playables)
- `<script src="https://www.youtube.com/game_api/v1">` до кода — единственный внешний адрес; больше никаких внешних вызовов: без Яндекс SDK, Метрики, серверов, логинов, ссылок, обфускации; WASM по возможности нет.
- `ytgame.game.firstFrameReady()` после первого кадра, `gameReady()` — когда игра управляема.
- Сохранение — только `ytgame.game.saveData(string)` (UTF-16, до 3 MiB) и `loadData()`; запись на ключевых событиях и в `onPause`.
- `ytgame.system.onPause/onResume` → причина `sdk`; `isAudioEnabled()`, `onAudioEnabledChange` → звук; язык — `getLanguage()`, в сохранение не пишем; английский обязателен. Реклама выключена (`profiles.youtube.ads`), сообществ нет; ошибки — `ytgame.health.logError()`.
- Лимиты (данные продюсера, сверить в день порта): бандл ≤ 250 MiB, первая загрузка ≤ 30 MiB (цель 15), старт ≤ 5 с, память ≤ 512 МБ, любые пропорции, тач и мышь, 13+.

### 6.3а `vk` (ВКонтакте и Одноклассники, «Ресейл 16»)
`src/platform/vk.ts` на `@vkontakte/vk-bridge` из npm: VKWebAppInit — первый вызов; площадка по параметрам запуска (`vk_client=ok`, `vk_platform=*_ok` → ОК); сохранения — VK Storage (`vk-save.ts`: сжатие, части ≤ 4 096 символов, раз в 45 с и при сворачивании), localStorage — кэш; реклама — VKWebAppCheckNativeAds заранее, ShowNativeAds с `use_waterfall: false`; вступление — VKWebAppJoinGroup. Только русский, без покупок и окна оценки; меню и «Помощь» — `src/ui/vk-menu.ts`; числа и тексты — `content/vk.json`. Сборка `npm run build:vk` → `dist-vk`, проверка `check:vk`; на Pages — `/vk/` и документы `/legal/` (`build:pages`); заглушка моста — `?mock=vk` (`vk-mock.ts`, не включается при запуске из VK/ОК). Соответствие — `docs/vk-compliance.md`.

### 6.4 `null` и мок
`null`: `localStorage`, рекламы нет, язык — `navigator.language`, `now()` = `Date.now()`. Мок `dev/yasdk-mock/sdk.js` — на `/sdk.js` в dev, preview, e2e и ссылке продюсера: `?mock_lang=en`, `?mock_device=mobile`, `?mock_ad=ok|error|noshow|slow|closenoreward|late` (late — `onRewarded` после `onClose`), `?mock_ad_ms=3000` (сколько стоит тёмный экран «Реклама»; у ролика ✕ — закрыть раньше), `?mock_banner=1|auto` (заглушка стики-баннера: ПК справа 160 px, телефон снизу; auto — только ПК; `?banner=1` — то же), `?mock_fullscreen=tap` (весь экран по первому тапу), `?mock_startup_ad=1`, `?mock_save=fail`, `?mock_time_offset=86400000`, покупки `getPayments()` — `?mock_pay=ok|cancel|error`, `?mock_catalog=id:цена,…`, неизрасходованные покупки живут в браузере; журнал — `__YA_MOCK__.calls`, нарушения — `__YA_MOCK__.violations`. Ссылка продюсера (M5-00, «правдивый стенд») включает `mock_fullscreen=tap`, `mock_banner=auto`, `mock_ad_ms=3000` по умолчанию (`__YA_MOCK_DEFAULTS__` в `build:pages`); e2e-проект `truthful` проверяет стенд. `?payments=1` включает магазин в тестовой и отладочной сборке (кадры, ссылка продюсера), релиз — по `game.json`.

### 6.5 Кнопки сообществ
Две небольшие кнопки «Telegram» и «ВКонтакте» с подписью «промокоды и бонусы в канале» (ключи `i18n`). Места — `community.placement`: `pause`, `settings`, `side` (сбоку главного экрана, не перекрывая сцену и сделку). Адреса — `community.telegram`, `community.vk`. Только по нажатию: `window.open(url, '_blank', 'noopener')`, игра на паузе по `blur`/`hidden`; без награды; событие `community_open`. `community === null` (`youtube`) — ни кнопок, ни адресов. Правила — `03`, CNT-08.

## 7. Сохранения
- Каждое изменение — сразу в локальное зеркало (Яндекс — `getStorage()`/`localStorage`, `null` — `localStorage`, `youtube` — только SDK).
- Облако Яндекса: `setData` с дебаунсом 2 с (≤ 10 с), не чаще раза в 3,5 с (≤ 86 за 5 минут); немедленно — сделка, вылупление, покупка, награда, перерождение, `hidden`, `pagehide`.
- Загрузка: больший `rev`, при равенстве — поздний `savedAt`; битое → второй источник или новый профиль. Строка ≤ 50 КБ (предел 100 КБ).

## 8. Бюджеты (допущение для 2D с атласами, уточнить на M5)
| Метрика | Цель | Предел | Чем |
|---|---|---|---|
| JS gzip / архив Яндекса | ≤ 400 КБ / 15 МБ | 600 КБ / 30 МБ | `size`, `check-release` |
| До `ready()`: скачано / время (10 Мбит/с, RTT 100 мс, CPU ×4) | ≤ 3 МБ / 4 с | 5 МБ / 5 с | e2e `perf` |
| YouTube: первая загрузка / бандл | ≤ 15 MiB | 30 / 250 MiB | `check:youtube` |
| Память (heap + текстуры) / атласы | ≤ 300 МБ / 2048², 64 МБ | 512 / 128 МБ | e2e `perf` |
| Draw calls / FPS | ≤ 50 / 60 ПК, ≥ 50 телефон | 100 / 30 | `?debug=1`, продюсер |

## 9. Сборки
Режимы (`vite.config.ts`): `development`, `local` (профиль `null`), `production`, `playtest`, `e2e`, `pages`, `youtube`. Флаги `define` (`env.d.ts`): отладка, студия, `__TEST__`, метка, профиль, `__GAME__`; ложный флаг вырезает модуль. `check-release` — 8 проверок архива по `03` (шапка скрипта; RD-05: архив ≤ 30 МБ, ни одного внешнего адреса, SDK до кода игры, звук только Web Audio, ключи ru и en); `check:youtube` — любой внешний адрес, кроме тега SDK и w3.org, следы Яндекса, размеры.

## 10. Тесты
- Vitest: ядро, логика (экономика, торг, вылупление, офлайн с зажимом времени), миграции и размер сохранения, платформа на фейковых `ysdk` и `ytgame`, валидатор, архитектура.
- Playwright против `build:e2e`, только в итоге вехи: 1280×720, 375×812, 812×375 (тач); WebGL — SwiftShader; `__YA_MOCK__.violations` пуст; пиксели не сравниваем.
- `window.__TEST__` (только `build:e2e`): `state()` (монеты, существа, причины паузы, `platform`, `controllable`), `events`, `setTimeScale(k)`, `runSim(sec)`. Время — игровое; действия — тапами по реальным элементам.

## 11. Языки
ru и en с M0: плоские ключи, подстановки `{n}`, `t(key, vars)` в `src/ui/`. Язык — от платформы до первого кадра. Нет ключа → в dev красная метка и падение теста, в релизе — английский. Числа — `Intl.NumberFormat`. Тесты: паритет ключей, в en нет кириллицы, кнопки без переполнения на 375×812. Текста на картинках нет.
