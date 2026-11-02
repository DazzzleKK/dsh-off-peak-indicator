# dsh-off-peak-indicator

Индикатор пиковых / непиковых часов DeepSeek для веб-интерфейса DeepSeek Harness: одна ячейка в строке под composer'ом, рядом с балансом и штатной статистикой сессии.

```
● Off-peak · peak in 8h 36m        ● Peak · off-peak in 2h 30m        ● Off-peak weekend · peak in 1d 22h
```

- **Красная** точка — пик (полный тариф), **жёлтая** — будничный off-peak (половина цены), **зелёная** — выходные (off-peak весь день).
- Правило: пик — `01:00–04:00` и `06:00–10:00` UTC, понедельник–пятница; это `09:00–12:00` и `14:00–18:00` по Пекину. Всё остальное — off-peak.
- Подсказка при наведении объясняет правило.
- Считается локально из часов браузера: **хостовой половины нет** — ни RPC, ни сетевых запросов, ни зависимостей кроме React. Логика окон вообще не может разойтись с сервером, потому что расписание фиксировано в UTC.

## Установка

Ставится прямо из GitHub — без npm и без клонирования:

```powershell
$cli = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $cli plugin --profile desktop add github:DazzzleKK/dsh-off-peak-indicator
```

CLI берётся **из самого приложения**: глобальный `dsh` из npm профиль `desktop` не принимает. Установка выполняется при **полностью закрытом** приложении.

Для разработки удобнее `link:` на клон — правки применяются без переустановки, достаточно обновить страницу:

```powershell
git clone https://github.com/DazzzleKK/dsh-off-peak-indicator.git
& $cli plugin --profile desktop add "link:$((Resolve-Path .\dsh-off-peak-indicator).Path)"
```

Для браузерного профиля (обычный `dsh web`) — та же команда с `--profile web`.

После установки запусти приложение и обнови страницу.

## Проверка

Автономный тест: подменяет `window.__ModuleLoader__`, `document` и React заглушками, загружает `client.js` как классический скрипт, рендерит ячейку на «замороженных» часах и сверяет каждое поле с независимо написанной моделью расписания — 886 моментов за восемь суток плюс восемь граничных точек.

```powershell
node verify.cjs
```

## Как это устроено

```
package.json      манифест: dsh.bundle.patch + dsh.client.platform = web
cordis.patch.yml  вставляет строку плагина в реестр профиля
index.js          хостовая половина — намеренно пустая (apply ничего не делает)
client.js         бандл: window.__ModuleLoader__.load({ id, factory })
verify.cjs        автономный тест
```

Слот — `conversation.composer.dock`, `order: -3`, то есть слева от баланса (`-2`) и штатной статистики (`-1`). Чтобы перенести индикатор в строку ввода рядом с селектором модели, достаточно поменять константы `SLOT` и `SLOT_ORDER` в начале `client.js` на `conversation.input.left` и, например, `100`.

Три свойства, обеспечивающие безопасность: бандл целиком обёрнут в IIFE (combo-скрипт склеивает бандлы в один классический скрипт, где top-level `const` конфликтует с чужими именами); из `apply` не выпускается ни одно исключение; ошибка регистрации ячейки стоит только этой ячейки, а не активации владельца слота.

## Удаление

```powershell
$cli = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $cli plugin --profile desktop remove dsh-off-peak-indicator
```

## Происхождение правила

Расписание взято из официальной страницы цен DeepSeek (api-docs.deepseek.com → Models & Pricing) в трактовке, совпадающей с уже проверенными сторонними плагинами: два пиковых окна по будням, выходные целиком off-peak, off-peak вдвое дешевле. Если DeepSeek поменяет расписание, правится одна константа `PEAK_BLOCKS` в `client.js`.
