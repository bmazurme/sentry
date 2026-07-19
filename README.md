# Sentry

Система мониторинга вибрации и звука в реальном времени: датчики на ESP32
публикуют показания по MQTT, backend на NestJS складывает их в InfluxDB и
раздаёт на фронтенд по WebSocket, а React-дашборд рисует графики.

Поток данных:

```
ESP32 (датчики) → MQTT (Mosquitto) → backend (NestJS) → InfluxDB + WebSocket → frontend (React)
                                                     ↘ Postgres (метаданные датчиков)
```

## Стек

| Компонент | Технология |
|---|---|
| Контроллер | ESP32 + датчики SW‑420, 801S, MAX4466 |
| Брокер сообщений | Mosquitto (MQTT) |
| Backend | NestJS (REST API + WebSocket, `mqtt`, `typeorm`) |
| Хранилище показаний | InfluxDB 2 |
| Хранилище метаданных | PostgreSQL |
| Дашборд | React + Vite + Tailwind + Recharts, Socket.IO client |
| Доп. дашборды | Grafana |

## Структура репозитория

```
backend/      NestJS backend (MQTT, InfluxDB, Postgres, WebSocket, REST API)
frontend/     React-дашборд (Vite + Tailwind + Recharts)
controller/   Прошивки и заметки по датчикам ESP32 (SW‑420, MAX4466, версии v0–v2)
mosquitto/    Конфиг MQTT-брокера
grafana/      Конфиг Grafana
docker-compose.yml         Запуск всего стека одной командой
DEPLOY_RASPBERRY_PI.md     Инструкция по развёртыванию на Raspberry Pi 5
```

## Быстрый старт (Docker Compose)

```bash
docker compose up -d --build
```

После запуска поднимаются:

| Сервис | Порт | Назначение |
|---|---|---|
| frontend | 3000 | веб-дашборд |
| backend | 3001 | REST API (`/api`) + WebSocket |
| mosquitto | 1883 | MQTT-брокер, сюда шлют данные ESP32 |
| influxdb | 8086 | хранилище временных рядов |
| postgres | 5432 | метаданные датчиков |

Подробная инструкция по развёртыванию на Raspberry Pi 5 — в
[DEPLOY_RASPBERRY_PI.md](DEPLOY_RASPBERRY_PI.md).

## Локальная разработка

Backend:

```bash
cd backend
npm install
npm run start:dev   # http://localhost:3001/api
```

Frontend:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Backend ожидает переменные окружения `MQTT_URL`, `MQTT_USER`, `MQTT_PASS`,
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS`, `INFLUX_URL`/`INFLUX_TOKEN`/
`INFLUX_ORG`/`INFLUX_BUCKET` (см. `docker-compose.yml` для примера значений).

## Backend API

- `GET /api/sensors` — список зарегистрированных датчиков
- `GET /api/sensors/catalog` — каталог известных датчиков
- `GET /api/sensors/topics` — MQTT-топики (реально принятые брокером + из каталога)
- `POST /api/sensors` — зарегистрировать датчик
- `PATCH /api/sensors/:id` — обновить датчик
- `DELETE /api/sensors/:id` — удалить датчик
- `GET /api/sensors/:id/history?from=&to=&limit=` — история показаний из InfluxDB
- `GET/POST /api/emulator/*` — эмулятор датчиков для разработки без реального ESP32

Показания транслируются в реальном времени через Socket.IO-событие
`sensor_update` (`{ topic, value, time }`).

## Контроллеры и прошивки

Все прошивки — Arduino-скетчи для ESP32, публикующие показания в Mosquitto по
WiFi. Backend подписан на `sensor/#`, поэтому новое устройство достаточно
подключить к тому же MQTT-брокеру — регистрировать топик на сервере вручную
не обязательно (см. `GET /api/sensors/topics`).

### Узел вибрации/шума — SW‑420 + MAX4466 (папка [controller/](controller/))

Основной узел на связке датчика вибрации/удара **SW‑420** (цифровой выход DO)
и электретного микрофона **MAX4466** (аналоговый выход через АЦП ESP32),
опционально с OLED-дисплеем (SSD1306) для локального отображения показаний.

| Файл | Описание |
|---|---|
| `v0.md` | Первая версия: SW‑18010P (AO+DO) + MAX4466, статистика по шуму и вибрации, OLED |
| `v1.md` | Упрощение v0: только DO вибрации + шум, OLED, окно замера `sampleWindow` |
| `v2.md` | Актуальная версия v1: добавлен счётчик вибраций, авторизация MQTT (user/pass) |
| `sw420.md` | Прошивка только на SW‑420 (без MAX4466), OLED |
| `SW‑420.md` | Базовый пример подключения SW‑420 напрямую (`digitalRead`, без MQTT) и вариант с Prometheus/Grafana |
| `max4466.md` | Базовый пример измерения уровня шума с MAX4466 (Serial only, без MQTT) |
| `max4466-1.md` | MAX4466 + SW‑18010P вместе, публикация по MQTT (без OLED) |

Публикуемые топики (актуальная версия, `v2.md`):

| Топик | Единица | Смысл |
|---|---|---|
| `sensor/noise/peak` | ADC | Пиковый уровень шума за окно (`sampleWindow`, по умолчанию 1 с) |
| `sensor/vibration/peak` | ADC/bool | Пиковое состояние вибрации за окно |
| `sensor/vibration/count` | count | Счётчик срабатываний DO SW‑420 |
| `sensor/vibration/last` | ms | Время последнего срабатывания |

Подключение SW‑420: `VCC → 3.3–5V`, `GND → GND`, `DO → GPIO38`. MAX4466: сигнал
на аналоговый вход (`GPIO32`/`GPIO34` в зависимости от версии).

### Детекторы удара на INMP441 (I2S-микрофон)

Отдельная линейка устройств: слушает звук через цифровой I2S-микрофон
**INMP441** и при резком звуковом всплеске (удар/стук) на 1 секунду зажигает
встроенный светодиод платы, параллельно публикуя событие по MQTT.

| Файл | Плата | LED | MQTT-топики |
|---|---|---|---|
| `vibration_shock_detector.ino` / `.md` | ESP32‑S3 DevKitC | встроенный адресный RGB (NeoPixel) | `sensor/shock/amplitude`, `sensor/shock/detected`, `sensor/shock/count` |
| `esp32-d.ino` | ESP32‑D (WROOM‑32 DevKit) | встроенный одноцветный, GPIO2 | `sensor/shock2/amplitude`, `sensor/shock2/detected`, `sensor/shock2/count` |
| `esp32-d-ex.ino` | ESP32‑D (WROOM‑32 DevKit) | встроенный одноцветный, GPIO2 | то же + `sensor/shock2/noise` (уровень шума в dBFS) — расширенная версия `esp32-d.ino` |

Топики `shock` и `shock2` намеренно разные, чтобы плата ESP32‑S3 и плата
ESP32‑D могли работать в системе одновременно, не перезаписывая показания друг
друга.

Подключение INMP441 (одинаково для всех трёх прошивок, отличаются только пины
на ESP32‑S3): `VDD → 3.3V`, `GND → GND`, `L/R → GND` (левый канал),
`SD → I2S DATA`, `WS → I2S LRCLK`, `SCK → I2S BCLK`.

#### `vibration_shock_detector.ino`

Готовый скетч для **ESP32‑S3 DevKitC** (тот же код, что задокументирован в
[vibration_shock_detector.md](vibration_shock_detector.md)). Пины I2S:
`SD → GPIO15`, `WS → GPIO16`, `SCK → GPIO17`. Индикация — встроенный
адресный RGB LED (NeoPixel), пин берётся автоматически из `PIN_RGB_LED`
(`pins_arduino.h`), внешних подключений не требует. I2S настроен на
`SAMPLE_RATE 16000`, `SAMPLE_BITS 32` (INMP441 отдаёт 24 бита в 32-битном
слове), чтение блоками по `I2S_READ_LEN 512` сэмплов. При превышении порога
амплитуды публикует `sensor/shock/detected = 1`, зажигает LED на 1 секунду,
инкрементирует счётчик (`sensor/shock/count`) и раз в окно шлёт пиковую
амплитуду (`sensor/shock/amplitude`). Библиотеки: `PubSubClient`,
`Adafruit NeoPixel` (+ встроенный `driver/i2s.h`).

#### `esp32-d.ino`

Тот же принцип детекции удара по INMP441, но под **ESP32‑D (ESP32‑WROOM‑32
DevKit)**: пины I2S `SD → GPIO27`, `WS → GPIO25`, `SCK → GPIO26`, индикация —
штатный одноцветный светодиод платы на `GPIO2` (никакой адресной ленты, в
отличие от S3). Публикует `sensor/shock2/amplitude|detected|count` — топики с
суффиксом `2`, чтобы этот узел мог работать одновременно с ESP32‑S3, не
перетирая его данные (если ESP32‑D полностью заменяет S3-версию, топики можно
поменять на `sensor/shock/*`). Библиотеки: `PubSubClient` + встроенный
`driver/i2s.h`, NeoPixel не требуется.

#### `esp32-d-ex.ino`

Расширенная версия `esp32-d.ino` для той же платы **ESP32‑D**: те же пины,
тот же встроенный LED на `GPIO2` и та же логика детекции удара, плюс раз в
секунду считается и публикуется общий уровень шума в `sensor/shock2/noise`
(приблизительно в dB SPL — по умолчанию в dBFS, для перевода в SPL нужна
калибровка микрофона через константу `SPL_OFFSET`, см. комментарий в файле).
Топики `shock2/*` совпадают с `esp32-d.ino`, так что эта прошивка — прямая
замена базовой версии на том же узле. Библиотеки те же: `PubSubClient`,
`driver/i2s.h`, плюс `math.h` для расчёта dBFS.

Во всех трёх скетчах `mqtt_user`/`mqtt_pass` должны совпадать с
`MQTT_USER`/`MQTT_PASS` backend'а из `docker-compose.yml`; по умолчанию
Mosquitto настроен на `allow_anonymous`, так что для локальных тестов подходят
любые значения (реальная аутентификация — см.
[DEPLOY_RASPBERRY_PI.md](DEPLOY_RASPBERRY_PI.md), п. 5.2).

### Пьезодатчик удара — автономный прототип

`vibration_sensor_esp32s3.md` — прототип на пьезоударном датчике вибрации
(DC5V, аналоговый+цифровой выход) и ESP32‑S3 со встроенным RGB-светодиодом.
В отличие от остальных прошивок работает **локально** (Serial Monitor + LED,
без WiFi/MQTT) и пока не интегрирован в Sentry.
