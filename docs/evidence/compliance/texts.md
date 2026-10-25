# Вычитка текстов ru и en (CNT-06)

M7, 25.10.2026, сессия по расписанию. Проверено строк: ru 1429, en 1429 — все 450 ключей `content/i18n/*.json` и 979 пар `{ru, en}` в `content/*.json`. Плейсхолдеры `{…}` в ru и en совпадают у всех ключей; двойных пробелов, пробелов по краям и перед знаками нет (скрипт).

Исправлены только ошибки (не вкус):
| Где | Было | Стало | Почему |
|---|---|---|---|
| lines.json, bubble_fish (ru) | Сияю как жемчуг | Сияю, как жемчуг | сравнительный оборот |
| lines.json, kettle (ru) | Расту как пар! | Расту, как пар! | сравнительный оборот |
| lines.json, slipper_pup (en) | A foot best friend | A foot's best friend | притяжательный падеж |
| news.json (en) | asks seconds for everyone | asks for seconds for everyone | ask for |
| upgrades.json, news.json (en) | Door Bell, Door Mat, door mat | Doorbell, Doormat, doormat | слитное написание |
| customers.json, lines.json, news.json (en) | cat sized, thousand piece, gold plated, well traveled, Top quality, off key | через дефис | составные прилагательные |
| i18n/en.json | Level ups | Level-ups | существительное через дефис |
| upgrades.json, lines.json (en) | Lunch time | Lunchtime | слитное написание |
| lines.json, sun_bun (en) | I will shine your morning | I will brighten your morning | shine + дополнение = «начищать» |
| lines.json, yarn_lamb (en) | I will knit you cozy! | I will knit you something cozy! | нет дополнения у knit |
| news.json (en) | The lights blinked, the Lamp Bug… | The lights blinked, but the Lamp Bug… | comma splice |
| en: i18n, news, achievements | «…» | “…” | в английском нет «ёлочек» |
| en: i18n, news, achievements | neighbours, Favourite | neighbors, Favorite | одно написание (американское, как honor, cozy) |

Замечено, не правилось (вкус и правило оформления, решает продюсер): длинные тире в 9 строках ru — `shop.tapHatch`, `shop.tapWarm`, `shop.tapFeed`, `event.twins`, `hatch.skip`, `rep.how`, `price.hint`, `customers.json seller.accept.0`, `seller.bye.2`
