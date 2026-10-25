# Отчёт соответствия Яндекс Играм

Дата: 25.10.2026 · веха M7 «Сборка» (сессия по расписанию) · чек-лист `docs/03-yandex-compliance.md`, раздел 1 (66 пунктов). Обновляет сборщик в итоге вехи.

**Итог:** PASS-auto — 47 · PASS-manual — 7 · PRODUCER — 7 · N/A — 5 · FAIL — 0 · TODO — 0. Шаги продюсера — в конце и в итоге M7 в `progress.md`.

Легенда (`docs/03`): `PASS-auto` — автотест или проверка скрипта (файл и начало заголовка теста или `check-release: <проверка>`); `PASS-manual` — ручная проверка, доказательство в репозитории; `PRODUCER` — нужно действие продюсера (черновик, телефоны, Консоль); `N/A` — неприменимо, с причиной; `FAIL` — не выполнено.

Проверки `check-release` (`scripts/check-release.mjs`, прогон M7 — `docs/evidence/M7/check-release.txt`, RESULT: PASS): 1 index.html в корне, пути `[A-Za-z0-9._/-]`; 2 архив и распакованное ≤ 30 МБ, JS gzip ≤ 600 КБ; 3 нет внешних адресов, кроме `/sdk.js`, Метрики и сообществ; 4 `<script src="/sdk.js">` ровно один, до кода игры; 5 звук только Web Audio; 6 нет lil-gui, `__TEST__`, мока, localhost, debugger, sourceMappingURL, ytgame; 7 нет следов разработки и стоп-слов в текстах; 8 ключи ru и en одинаковы, не пусты, в en нет кириллицы.

Покупки: `game.json → profiles.yandex.payments: false` — в релизе Яндекса магазина нет (`e2e/store-m5.spec.ts › payments off (game.json): «Акции» stays off`). Матрица размеров и бот-сессия — `@full`, идут в `verify:full`.

## Сборка
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| BLD-01 | ZIP: index.html в корне, пути, ≤ 30 МБ | PASS-auto | check-release 1, 2 |
| BLD-02 | всё внутри архива: нет CDN, Google Fonts, importmap | PASS-auto | check-release 3; `tests/architecture.test.ts › no absolute addresses in src/**/*.ts` |
| BLD-03 | нет ИИ в рантайме | PASS-auto | check-release 3: внешних адресов нет, обратиться к ИИ-сервису некуда |
| BLD-04 | в релизе нет отладки, мока, `__TEST__`, номеров сборки | PASS-auto | `e2e/smoke-release.spec.ts › BLD-04 release boots on the mock…`; check-release 6; `e2e/usability-ub.spec.ts › UB-09 PC: no service marks` |
| BLD-05 | браузеры и iOS, ES2022 | PRODUCER | черновик в Яндекс Браузере, Chrome, Firefox, Opera, Safari, на Android и iPhone; профиль `webkit` — только в CI (`qa/device-matrix.md`) |
| BLD-06 | нет WebGL → спокойная заставка | PASS-auto | `e2e/build-m7.spec.ts › BLD-06 no WebGL: the shop still opens (2D canvas)…` и `› BLD-06 nothing can draw at all: a calm screen…` (M7: заставка `boot.unsupported` вместо вечного спиннера) |

## SDK
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| SDK-01 | `/sdk.js` до кода, `init()` один раз, SDK только в `src/platform/` | PASS-auto | check-release 4; `tests/architecture.test.ts › platform SDKs only in src/platform…`; вкладка IT черновика — шаг продюсера ниже |
| SDK-02 | `ready()` один раз, когда всё готово, ≤ 4 с | PASS-auto | `e2e/smoke.spec.ts › SDK-02 ready() once, after the shop is drawn, within 4 s…` |
| SDK-03 | подписка на `game_api_pause/resume` до `ready()` | PASS-auto | `e2e/smoke.spec.ts › SDK-03 startup ad…`; `tests/platform.test.ts › SDK-03…` |
| SDK-04 | `GameplayAPI.start/stop` только на переходах | PASS-auto | `e2e/smoke.spec.ts › SDK-04…`; `tests/platform.test.ts › SDK-04…` |
| SDK-05 | язык из SDK | PASS-auto | `e2e/smoke.spec.ts › SDK-05 LOC-03…`; `tests/platform.test.ts › SDK-05…` |
| SDK-06 | всё без входа; вход только с выгодой | PASS-auto | все e2e на моке без входа; `e2e/leaders-m4.spec.ts › M4-04 leaders: sign in by the button…` |
| SDK-07 | `serverTime()` для офлайна и дня; отзыв раз за сессию, не в первые 5 минут | PASS-auto | `tests/platform.test.ts › now() is the server time of the SDK…`; `e2e/store-m5.spec.ts › M5-06…` |

## Пауза и звук
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| SND-01 | только Web Audio | PASS-auto | check-release 5 |
| SND-02 | звук стоп ≤ 2 с при pause, hidden, blur, pagehide | PASS-auto | `e2e/build-m7.spec.ts › SND-02 blur, hidden and pagehide…` (пауза и `AudioContext` не `running` ≤ 2 с); на живом телефоне — шаг продюсера |
| SND-03 | полноэкранная реклама ставит логику и звук на паузу | PASS-auto | `e2e/truthful-m7.spec.ts › SND-03 a full-screen ad pauses the game and the sound…` |
| SND-04 | пауза в одном месте, ничто не замораживает | PASS-auto | `tests/core.test.ts › SND-04…` |
| SND-05 | кнопки звука и паузы | PASS-manual | `docs/evidence/RD/screens/overlay-pause_880x405.png`, `overlay-settings_880x405.png`; `e2e/layout.spec.ts › SCR-01 phone: pause and settings windows fit…` |

## Сохранения
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| SAV-01 | сразу после действия, F5 после сделки | PASS-auto | `e2e/loop.spec.ts › SAV-01 F5 after a deal…`; `tests/platform.test.ts › SAV-01…` |
| SAV-02 | `setData` ≤ 100 за 5 мин и ≤ 200 КБ; превышение — отказ | PASS-auto | `tests/save-queue.test.ts › SAV-02 at most 86 writes in 5 minutes…`; `tests/persist-limit.test.ts › SAV-02 a save over 100 KB never reaches the platform…` (M7); `tests/save.test.ts › a full shop stays far below the 100 KB limit…` |
| SAV-03 | поворот и ресайз без потерь | PASS-auto | `e2e/layout.spec.ts › SAV-03 rotation keeps the state…` |
| SAV-04 | облачные сохранения в черновике | PRODUCER | включить облачные сохранения в черновике, проверить перенос прогресса между устройствами |
| SAV-05 | версия схемы, миграции, битое сохранение | PASS-auto | `e2e/smoke.spec.ts › SAV-05…`; `tests/save.test.ts › SAV-05…` |

## Реклама
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| ADS-01 | свои вызовы обоих типов | PASS-auto | `tests/platform.test.ts › ads: rewarded only from onRewarded…`; `e2e/truthful-m5.spec.ts › M5-03 interstitial…`, `› a rewarded video…` |
| ADS-02 | только `ysdk.adv.*`, без своих рекламных окон | PASS-manual | `docs/evidence/M5/screens/stub-fullscreen_1280x720_ru.png`, `docs/evidence/M5/gamedesign-ads.md`; `tests/architecture.test.ts › platform SDKs only in src/platform…` |
| ADS-03 | полноэкранная только по карте 2.2 | PASS-auto | `tests/ad-gate.test.ts › M5-03 ad gate`; `e2e/truthful-m5.spec.ts › M5-03 interstitial: not in the first 3 minutes…` |
| ADS-04 | за награду: «Реклама», награда только в `onRewarded`, всё проходится без рекламы | PASS-auto | `e2e/truthful-m5.spec.ts › every rewarded place has its own button…`, `› closed early (✕)…`; `tests/platform.test.ts › M5-02 rewarded outcomes…` |
| ADS-05 | после любого исхода игра идёт | PASS-auto | `e2e/truthful-m5.spec.ts › closed early…`, `› no video (error)…`, `› M5-03 an interstitial that fails…` |
| ADS-06 | ориентация рекламы | PRODUCER | реклама на телефоне в обеих ориентациях в черновике |
| ADS-07 | стики-баннер ничего не обрезает | PASS-auto | `e2e/truthful-m5.spec.ts › desktop: the banner stand-in takes 160 px…`; `e2e/matrix-m7.spec.ts › 1280x720-banner`, `1920x1080-banner` (M7) |

## Покупки
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| IAP-01 | только `ysdk.payments`, каталог, `getPurchases()` | N/A | `payments: false` в релизе Яндекса; на моке — `tests/platform.test.ts › M5-05 payments on the mock…`. Включение — после товаров в Консоли (шаг продюсера) |
| IAP-02 | покупки на другом устройстве | N/A | покупок в релизе нет |
| IAP-03 | «Без рекламы» убирает полноэкранную и баннер | N/A | покупок в релизе нет; поведение покрыто `e2e/truthful-m5.spec.ts › M5-03 «no ads» stops…` |
| IAP-04 | случайные яйца за деньги — с составом и шансами | N/A | покупок в релизе нет; до включения — шансы в наборах «Золотое» и «Осеннее» (`docs/evidence/M5/gamedesign-ads.md`, п. 5) |

## Экран и ввод
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| SCR-01 | ничего не обрезано в матрице §6, обе ориентации | PASS-auto | `e2e/matrix-m7.spec.ts › M7-05 SCR-01 <размер>…` — 12 размеров `docs/03` §6 и 2 со стики-баннером, все вкладки, «кнопка видна целиком», без прокрутки (`@full`); `e2e/frames-rd.spec.ts` — 880×405, 815×290; кадры `docs/evidence/M7/matrix/` |
| SCR-02 | ПК: игра касается краёв по одной оси, поля цветом фона | PASS-auto | `e2e/build-m7.spec.ts › SCR-02 2560×1080…`, `› SCR-02 600×1300…` |
| SCR-03 | нет прокрутки и swipe-to-refresh | PASS-auto | `expectNoPageScroll` в `e2e/layout.spec.ts`, `e2e/smoke.spec.ts › SCR-01 1280×720…`, `e2e/matrix-m7.spec.ts` |
| SCR-04 | нет выделения и контекстного меню | PASS-auto | `e2e/build-m7.spec.ts › SCR-04 no context menu on a right click or a long tap…` |
| SCR-05 | клавиши необязательны, `event.code`, без Ctrl и F1–F12 | PASS-auto | `tests/keys.test.ts › SCR-05 keys are optional and read by event.code…` |
| SCR-06 | всё тапом, зоны ≥ 44 px, без удержаний | PRODUCER | пройти игру на телефоне только тапами; 44 px в коде — `e2e/layout-usability-ub.spec.ts › UB-09 phone…` |
| SCR-07 | поворот, сворачивание, «Назад» без зависаний | PASS-auto | `e2e/layout.spec.ts › SAV-03 rotation…`; `e2e/build-m7.spec.ts › SCR-07 minimised and back, «Назад» from the platform…` |
| SCR-08 | поле промокода: клавиатура по тапу, поле не перекрыто | PRODUCER | на телефоне: «Настройки» → тап по полю кода — клавиатура не закрывает поле; видимость поля — `e2e/fixes-fb.spec.ts › «Настройки»: … the code in sight…` |
| SCR-09 | ноль `pageerror`, `console.error`, `alert` | PASS-auto | `e2e/smoke.spec.ts › SCR-09…`; `collectErrors` в большинстве e2e; `e2e/bot-m7.spec.ts` — 10 минут игры (`@full`) |

## Геймдизайн
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| GD-01 | цель, прогресс, рекорд | PASS-manual | `docs/evidence/UB/reputation_375x812_ru.png`, `docs/evidence/M4/leaders_375x812_ru.png` |
| GD-02 | контента больше 10 минут | PASS-auto | `sim:balance` в `verify` (`docs/evidence/RD/balance.txt`); `e2e/bot-m7.spec.ts` — сделки идут и во второй половине 10 минут (`@full`, `docs/evidence/M7/bot-session.txt`) |
| GD-03 | цены и редкость растут монотонно | PASS-auto | `tests/game-rewards.test.ts`, `tests/game-ladder.test.ts`, `tests/game-upgrades.test.ts` |
| GD-04 | управление показано в игре и в «Как играть» | PASS-auto | в игре — подсказки первой минуты: `e2e/ftue-ub.spec.ts › UB-06…`, `e2e/ftue.spec.ts › M1-09…`; поле «Как играть» карточки — шаг продюсера (готовый текст — в итоге M7) |
| GD-05 | нет тупика, ошибка облака — тихий повтор | PASS-auto | `tests/ftue.test.ts › M6-02 a first deal below the egg price never dead-ends…`; `e2e/truthful-m5.spec.ts › Q-045 A…`; `tests/platform.test.ts › cloud write failures…` |
| GD-06 | нет «Скоро», пустых вкладок, битых иконок, ключей | PASS-auto | `tests/release-content.test.ts › GD-06 nothing is promised «in an update»…` (M7: убрана устаревшая строка «(в обновлении)» в окне уровня); `e2e/usability-ub.spec.ts › UB-09 PC: no service marks`; `e2e/build-m7.spec.ts › M7-00 … on every tab` (нет пустых картинок) |
| GD-07 | категории по геймплею | PRODUCER | выбрать категории в черновике |
| GD-08 | не дубль, название уникально | PRODUCER | поиск названия ru и en в каталоге (вместе с карточкой, позже) |
| GD-09 | рейтинг вовлечённости > 30 | N/A | до выхода |

## Контент
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| CNT-01 | 6+ (раздел 3) | PASS-auto | check-release 7; `tests/architecture.test.ts › no stop-list words…` |
| CNT-02 | без политики, флагов, религии, вреда существам | PASS-manual | `docs/evidence/M6/species-30.png`, `docs/evidence/M6/screens/collection-30_880x405.png` |
| CNT-03 | чужих брендов нет; ассеты свои или CC0; свои силуэты | PASS-manual | `assets/LICENSES.md`; `docs/evidence/M6/species-30.png`; check-release 7. Промо и карточка — позже (решение продюсера 24.10) |
| CNT-04 | нет реальных призов; яйца без ставок | PASS-auto | `tests/game-codes.test.ts › rewards are in-game only…`; check-release 7 |
| CNT-05 | нет ссылок, QR, email, кроме CNT-08 | PASS-auto | check-release 3; `tests/architecture.test.ts › no absolute addresses…`, `› window.open in one module at most…`; `e2e/smoke.spec.ts › CNT-08…` |
| CNT-06 | тексты без ошибок | PASS-manual | вычитка ru и en — `docs/evidence/compliance/texts.md` (M7) |
| CNT-07 | тексты не обманывают, нет «онлайн» | PASS-auto | check-release 7; `tests/game-ads.test.ts`, `tests/game-gifts.test.ts` |
| CNT-08 | кнопки сообществ: по нажатию, новая вкладка, без награды | PASS-auto | `e2e/smoke.spec.ts › CNT-08 community buttons open the game.json addresses…`; `e2e/build-m7.spec.ts › CNT-08 … «Подарки» gives nothing for a visit to the group` (M7: карточка яйца за визит в группу выключена в профиле `yandex`, `game.json → communityGift`, вопрос Q-055). Сообщества с «Яндекс Игры» в названии — шаг продюсера в день подачи |

## Языки
| ID | Пункт | Статус | Доказательство |
|---|---|---|---|
| LOC-01 | ru и en с полным словарём | PASS-auto | `tests/content.test.ts › LOC-01…`; check-release 8 |
| LOC-02 | всё значимое переведено, в en нет кириллицы | PASS-auto | `tests/i18n.test.ts › LOC-02…`; `e2e/loop.spec.ts › LOC-03 English…` |
| LOC-03 | be, kk, uk, uz → ru, остальные → en | PASS-auto | `tests/platform.test.ts › LOC-03…`; `e2e/smoke.spec.ts › SDK-05 LOC-03…` |
| LOC-04 | название в игре = карточке | PASS-auto | `e2e/build-m7.spec.ts › LOC-04 the page title is the card title of game.json` |
| LOC-05 | ручной выбор «Русский», «English» | PASS-auto | `e2e/smoke.spec.ts › LOC-05…` |
| LOC-06 | текста на картинках нет | PASS-manual | `assets/LICENSES.md` (растровых ассетов нет); надписи сцены — из словаря |

## Шаги продюсера
1. BLD-05 — черновик в Яндекс Браузере, Chrome, Firefox, Opera, Safari, на Android и iPhone
2. SAV-04 — облачные сохранения в черновике
3. ADS-06 — реклама на телефоне в обеих ориентациях
4. SCR-06 — игра на телефоне только тапами
5. SCR-08 — поле промокода на телефоне: клавиатура не закрывает поле
6. GD-07 — категории черновика
7. GD-08 — уникальность названия ru и en (с карточкой, позже)
8. GD-04 — поле «Как играть» в карточке (текст в итоге M7)
- По PASS-пунктам: SDK-01 — вкладка IT черновика без ошибок; CNT-08 — сообщества с «Яндекс Игры» в названии в день подачи; SND-02 — звук стихает при сворачивании на живом телефоне; номер счётчика Метрики до финальной сборки (`game.json → metrikaCounterId`, сейчас 0)
