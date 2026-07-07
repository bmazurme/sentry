# Датчик вибрации (пьезоударный) + ESP32-S3

Проект считывает сигнал с пьезоэлектрического ударного датчика вибрации, выводит данные в Serial Monitor и включает встроенный адресный RGB-светодиод (WS2812) на плате ESP32-S3 DevKitC на 1 секунду при обнаружении удара.

## Используемые компоненты

- Плата ESP32-S3 DevKitC (со встроенным RGB LED WS2812)
- Пьезоэлектрический ударный датчик вибрации (DC5V), пины: G (GND), V (VCC 5V), AD0 (аналоговый выход), D0 (цифровой TTL выход)

## Схема подключения

```
Датчик вибрации          ESP32-S3
─────────────────        ────────────
G  (GND)      ────────── GND
V  (VCC 5V)   ────────── 5V (VIN)
D0 (TTL)      ────────── GPIO4   (не используется в логике, зарезервирован)
AD0 (analog)  ────────── GPIO5   (ADC1_CH4)
```

### Важно про питание и уровни сигналов

- Датчик питается от **5V**, ESP32-S3 логика — **3.3V**. Не подавайте на ADC-вход напряжение выше 3.3V.
- Если выход `AD0` на вашем конкретном модуле реально доходит до уровня VCC (5V), используйте делитель напряжения перед GPIO5:

```
AD0 ──[R1=10кОм]──┬── GPIO5
                   │
              [R2=20кОм]
                   │
                  GND
```

- Светодиод — **встроенный RGB WS2812** на плате, отдельного подключения не требует. Управляется через макрос `PIN_RGB_LED`, который уже определён в файле платы (`pins_arduino.h`) — правильный номер GPIO (48 или 38, в зависимости от ревизии платы) подставляется автоматически.

## Логика работы скетча

1. Каждый цикл `loop()` делает **20 быстрых замеров подряд** с `AD0` и берёт максимальное значение (пик) — это нужно, чтобы не пропустить короткий импульс удара между обычными считываниями.
2. Если пиковое значение превышает `THRESHOLD` и с момента последнего срабатывания прошло больше `COOLDOWN_TIME` — фиксируется удар.
3. Встроенный RGB LED загорается **красным** на `LED_ON_TIME` (1 секунда), затем гаснет.
4. Все значения и события выводятся в Serial Monitor (115200 бод).

## Скетч

```cpp
#include <Adafruit_NeoPixel.h>

// ===== Настройки пинов =====
const int PIN_AD0 = 5;      // аналоговый выход датчика вибрации
const int PIN_D0  = 4;      // цифровой выход датчика (зарезервирован, не используется в логике)

// Используем встроенный макрос платы PIN_RGB_LED - он уже правильно
// определён в pins_arduino.h для конкретной платы
const int RGB_LED_PIN = PIN_RGB_LED;

// ===== Настройки чувствительности =====
const int THRESHOLD = 100;                  // порог срабатывания (подберите под свой датчик)
const unsigned long LED_ON_TIME = 1000;     // время свечения LED, мс
const unsigned long COOLDOWN_TIME = 200;    // блокировка повторных срабатываний, мс

// ===== NeoPixel объект (1 встроенный LED) =====
Adafruit_NeoPixel pixel(1, RGB_LED_PIN, NEO_GRB + NEO_KHZ800);

bool ledActive = false;
unsigned long ledStartTime = 0;
unsigned long lastTriggerTime = 0;

// Быстрая серия замеров - ловит короткие импульсы удара, которые
// можно пропустить при одиночном analogRead() раз в цикл
int readPeakValue() {
  int peak = 0;
  for (int i = 0; i < 20; i++) {
    int v = analogRead(PIN_AD0);
    if (v > peak) peak = v;
  }
  return peak;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_D0, INPUT);
  analogReadResolution(12);

  pixel.begin();
  pixel.setBrightness(50);
  pixel.setPixelColor(0, pixel.Color(0, 0, 0));
  pixel.show();

  Serial.print("RGB LED pin: ");
  Serial.println(RGB_LED_PIN);
  Serial.println("=== Vibration sensor monitor started ===");
}

void loop() {
  int analogValue = readPeakValue();

  Serial.print("AD0 peak: ");
  Serial.print(analogValue);
  Serial.print("  LED state: ");
  Serial.println(ledActive ? "ON" : "OFF");

  unsigned long now = millis();

  // Проверка срабатывания (с учётом cooldown)
  if (!ledActive && (now - lastTriggerTime > COOLDOWN_TIME)) {
    if (analogValue > THRESHOLD) {
      ledActive = true;
      ledStartTime = now;
      lastTriggerTime = now;

      pixel.setPixelColor(0, pixel.Color(255, 0, 0)); // красный при ударе
      pixel.show();

      Serial.println(">>> УДАР ЗАФИКСИРОВАН! LED ON <<<");
    }
  }

  // Выключение LED через 1 секунду
  if (ledActive && (now - ledStartTime >= LED_ON_TIME)) {
    pixel.setPixelColor(0, pixel.Color(0, 0, 0));
    pixel.show();
    ledActive = false;
    Serial.println(">>> LED OFF <<<");
  }
}
```

## Калибровка чувствительности

1. Загрузите скетч, откройте Serial Monitor на **115200 бод**.
2. Оставьте датчик в покое на 5-10 секунд — запишите максимальное значение `AD0 peak` в тишине (это шумовой потолок).
3. Слегка коснитесь/постучите по датчику — запишите минимальное значение при слабом ударе, который хотите ловить.
4. Установите `THRESHOLD` примерно посередине между шумом покоя и минимальным реальным ударом (например, если покой ≤ 20, а слабый удар ≥ 150 — ставьте `THRESHOLD = 80-100`).

**Дополнительные параметры для тонкой настройки:**

| Параметр | За что отвечает | Эффект при уменьшении |
|---|---|---|
| `THRESHOLD` | порог срабатывания | выше чувствительность, но больше риск ложных срабатываний |
| `COOLDOWN_TIME` | блокировка после срабатывания | быстрее реагирует на повторные удары подряд |
| `20` в `readPeakValue()` | число замеров за один пик | больше замеров = точнее ловит короткие импульсы, но чуть медленнее цикл |

## Библиотеки

Требуется библиотека **Adafruit NeoPixel**: Arduino IDE → Sketch → Include Library → Manage Libraries → найти "Adafruit NeoPixel" → Install.
