# 06. Аналитика

Заготовка, уточняется по `01` и `01a` к M4. Отправка — только профиль `yandex` (Метрика); в `null` и `youtube` — только буфер и `window.__TEST__.events`.

## 1. Первая минута
`player` — раз за жизнь (флаг в сохранении), `session` — раз за загрузку. Ориентиры — `01`, раздел 4, от `gameReady`.

| Событие | Где | Раз | Ориентир |
|---|---|---|---|
| `load_start` | первая строка `index.html` | session | 0 с |
| `gameReady` | после `ready()` | session | ≤ 4 с |
| `startup_ad_start`, `startup_ad_end` | пауза платформы до старта | session | сразу |
| `first_tap` | первый тап по яйцу | player | ≤ 10 с |
| `hatch_1` | первое вылупление | player | 10–20 с |
| `feed_1` | первый уровень от кормёжки | player | 20 с |
| `sale_1` (`haggled`) | первая сделка | player | 20–40 с |
| `egg_buy_1` | первое купленное яйцо | player | 40–60 с |
| `session_60s` … `session_600s` | 1, 3, 5, 10 мин активной игры | session | сверка с Консолью |

## 2. Экономика и мета
`upgrade_buy` (`id`, `level`) · `rare_hatch` (`rarity`) · `haggle` (`result`: `up`, `left`) · `helper_1` · `offline_claim` (`hours`, `x2`) · `collection_row` · `daily_anomaly` · `rebirth_1` · `community_open` (`network`: `telegram`, `vk`).

## 3. Реклама и покупки
Стандартные имена Яндекса: `gameRewardedRequest|Open|Earned|Close|Error`, `gameFullscreenRequest|Open|Close|Error`, покупки — `gameOfferView`, `gamePurchaseStart|Success|Error`. Свои: `rewarded_shown` (первая кнопка на экране), `ad_resume_ok` (после рекламы игра идёт). `placement`: `deal_x2`, `instant_hatch`, `rare_egg`, `offline_x2`, `helper_hour`, `shop`.

## 4. Устройство
`track(name, params?)` — только имена из `src/analytics/events.ts`; отправка в `try/catch`, при `metrikaCounterId > 0`. Параметры: `event`, `player`, `device`, `session`, `t`. Цели в Метрике заводит продюсер.
