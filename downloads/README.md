# Архивы для загрузки

Собирает сборщик в итоге вехи (`npm run build && npm run pack`, `npm run build:playtest` и `pack --dir dist-playtest --suffix playtest`), проверяет `check-release`.

| Файл | Что | Куда |
|---|---|---|
| `anomaly-shop-0.1.0.zip` | релиз для Яндекс Игр: настоящий SDK, без отладки; `check-release` 8/8 | Консоль разработчика → черновик игры → «Загрузить архив» |
| `anomaly-shop-0.1.0-playtest.zip` | сборка для проверки на моке SDK (как ссылка продюсера, `?debug=1`); `check-release` её отклоняет — так и задумано | не загружать в Консоль; открыть локально или отдать тестировщику |

Хеши и коммит сборки — `docs/evidence/P/archives.txt` (прошлые — `docs/evidence/V/archives.txt`, `docs/evidence/F/archives.txt`, `docs/evidence/T/archives.txt`, `docs/evidence/W/archives.txt`, `docs/evidence/M7/archives.txt`). Счётчик Метрики в релизе пока `0`, покупки выключены (`game.json → payments: false`) — шаги продюсера в итоге M7 в `progress.md`
