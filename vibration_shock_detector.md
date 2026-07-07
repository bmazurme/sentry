# Детектор вибраций/ударов на ESP32-S3 DevKitC + INMP441

Устройство слушает звук через микрофон INMP441 (шина I2S). При резком звуковом
всплеске (удар, стук, вибрация) встроенный адресный RGB светодиод платы
загорается красным на 1 секунду, затем автоматически гаснет.

## Компоненты

- ESP32-S3 DevKitC (со встроенным адресным RGB LED)
- Микрофон INMP441 (I2S MEMS)
- Провода для подключения

## Схема подключения

Светодиод — встроенный в плату (NeoPixel), внешних подключений для него не
требуется. Подключается только микрофон.

| INMP441 | ESP32-S3 DevKitC | Назначение |
|---|---|---|
| VDD | 3.3V | Питание |
| GND | GND | Земля |
| L/R | GND | Выбор канала (GND = левый канал) |
| SD (DOUT) | GPIO15 | I2S Data (SD) |
| WS | GPIO16 | I2S Word Select (LRCLK) |
| SCK | GPIO17 | I2S Bit Clock (BCLK) |

```
INMP441                 ESP32-S3 DevKitC
--------                -----------------
VDD   ────────────────► 3.3V
GND   ────────────────► GND
L/R   ────────────────► GND
SD    ────────────────► GPIO15 (I2S SD)
WS    ────────────────► GPIO16 (I2S WS)
SCK   ────────────────► GPIO17 (I2S SCK)
```

## Необходимая библиотека

Установите через Arduino IDE → Library Manager:

- **Adafruit NeoPixel**

## Скетч

```cpp
/*
  Детектор вибраций/ударов на базе микрофона INMP441 (I2S)
  Плата: ESP32-S3 DevKitC (встроенный адресный RGB LED, NeoPixel)
  При обнаружении удара/резкого звукового всплеска встроенный
  RGB LED платы загорается красным на 1 секунду, затем гаснет.

  ПОДКЛЮЧЕНИЕ:
  INMP441        ESP32-S3
  -------        --------
  VDD    ->      3.3V
  GND    ->      GND
  L/R    ->      GND        (левый канал)
  SD     ->      GPIO15     (I2S DATA / DOUT)
  WS     ->      GPIO16     (I2S WS / LRCLK)
  SCK    ->      GPIO17     (I2S BCLK)

  RGB LED — используется встроенный адресный светодиод платы
  (пин определяется автоматически макросом PIN_RGB_LED из
  pins_arduino.h для конкретной платы ESP32-S3 DevKitC),
  внешних подключений для светодиода не требуется.

  Требуется библиотека: Adafruit NeoPixel
  (Arduino IDE -> Library Manager -> "Adafruit NeoPixel")
*/

#include <driver/i2s.h>
#include <Adafruit_NeoPixel.h>

// ---------- Пины I2S (INMP441) ----------
#define I2S_WS_PIN   16   // Word Select (LRCLK)
#define I2S_SD_PIN   15   // Serial Data (DOUT микрофона)
#define I2S_SCK_PIN  17   // Bit Clock (BCLK)
#define I2S_PORT     I2S_NUM_0

// ---------- Встроенный RGB светодиод платы ----------
const int RGB_LED_PIN = PIN_RGB_LED;   // определяется автоматически для платы
Adafruit_NeoPixel pixel(1, RGB_LED_PIN, NEO_GRB + NEO_KHZ800);

// ---------- Параметры звука/детекции ----------
#define SAMPLE_RATE      16000
#define SAMPLE_BITS      32          // INMP441 отдаёт 24 бита в 32-битном слове
#define I2S_READ_LEN     512         // сэмплов за одно чтение
#define DMA_BUF_COUNT    4
#define DMA_BUF_LEN      256

// ---------- Адаптивная чувствительность ----------
// Вместо жёсткого порога считаем средний уровень фонового шума (baseline)
// и триггерим удар, когда амплитуда превышает baseline в SHOCK_MULTIPLIER раз
// (плюс небольшая абсолютная надбавка SHOCK_MIN_DELTA, чтобы не ловить тишину).
#define BASELINE_SMOOTHING     0.98f     // чем ближе к 1 — тем медленнее адаптация фона
#define SHOCK_MULTIPLIER       1.6f      // во сколько раз превышение фона считаем ударом
#define SHOCK_MIN_DELTA        3000.0f   // минимальный абсолютный скачок над фоном
// Минимальный интервал между срабатываниями (защита от дребезга/повторных импульсов удара)
#define RETRIGGER_COOLDOWN_MS 300
// Длительность свечения индикатора при срабатывании
#define FLASH_DURATION_MS    1000

int32_t i2sBuffer[I2S_READ_LEN];

bool ledActive = false;
unsigned long ledStartTime = 0;
unsigned long lastTriggerTime = 0;
float noiseBaseline = 0.0f;     // текущий адаптивный уровень фонового шума
bool baselineInitialized = false;

// ------------------------------------------------------------------
void setupLed() {
  pixel.begin();
  pixel.setBrightness(50);
  pixel.setPixelColor(0, pixel.Color(0, 0, 0));
  pixel.show();
}

void setupI2SMic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = DMA_BUF_COUNT,
    .dma_buf_len = DMA_BUF_LEN,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,
    .ws_io_num = I2S_WS_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD_PIN
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);
}

// Читает блок сэмплов и возвращает максимальную абсолютную амплитуду в блоке.
// Данные INMP441 приходят как 32-битные слова, значимые 24 бита сдвинуты влево,
// поэтому сдвигаем вправо на 8 бит и приводим к float для удобства сравнения с порогом.
float readMaxAmplitude() {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, (void*)i2sBuffer, sizeof(i2sBuffer), &bytesRead, portMAX_DELAY);

  int samplesRead = bytesRead / sizeof(int32_t);
  int32_t maxAbs = 0;

  for (int i = 0; i < samplesRead; i++) {
    int32_t sample = i2sBuffer[i] >> 8;   // приводим к 24-битному значению
    int32_t absSample = abs(sample);
    if (absSample > maxAbs) {
      maxAbs = absSample;
    }
  }
  return (float)maxAbs;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Инициализация детектора вибраций (INMP441 + встроенный RGB LED)...");

  setupLed();
  setupI2SMic();

  Serial.print("RGB LED pin (from board definition): ");
  Serial.println(RGB_LED_PIN);
  Serial.println("Готово. Слушаем звук/вибрации...");
}

void loop() {
  float amplitude = readMaxAmplitude();
  unsigned long now = millis();

  if (!baselineInitialized) {
    // Первое чтение — сразу берём как стартовый уровень фона
    noiseBaseline = amplitude;
    baselineInitialized = true;
  }

  float dynamicThreshold = noiseBaseline * SHOCK_MULTIPLIER + SHOCK_MIN_DELTA;

  // Раскомментируйте для калибровки/отладки (Serial Plotter):
  // Serial.printf("%.0f %.0f %.0f\n", amplitude, noiseBaseline, dynamicThreshold);

  if (!ledActive && (now - lastTriggerTime > RETRIGGER_COOLDOWN_MS)) {
    if (amplitude > dynamicThreshold) {
      ledActive = true;
      ledStartTime = now;
      lastTriggerTime = now;

      pixel.setPixelColor(0, pixel.Color(255, 0, 0));  // красный
      pixel.show();

      Serial.println(">>> УДАР ЗАФИКСИРОВАН! LED ON <<<");
    }
  }

  if (!ledActive) {
    // Плавно подстраиваем фон только когда нет активного срабатывания,
    // чтобы амплитуда самого удара не "испортила" baseline
    noiseBaseline = noiseBaseline * BASELINE_SMOOTHING + amplitude * (1.0f - BASELINE_SMOOTHING);
  }

  if (ledActive && (now - ledStartTime >= FLASH_DURATION_MS)) {
    pixel.setPixelColor(0, pixel.Color(0, 0, 0));
    pixel.show();
    ledActive = false;
    Serial.println(">>> LED OFF <<<");
  }
}
```

## Логика работы

1. Микрофон непрерывно читается блоками по 512 сэмплов через I2S.
2. Программа вычисляет максимальную амплитуду в каждом блоке.
3. Автоматически отслеживается средний уровень фонового шума (`noiseBaseline`).
4. Если амплитуда превышает фон в 1.6 раза (плюс минимальный порог) — считается,
   что зафиксирован удар/вибрация.
5. Светодиод загорается красным на 1000 мс, затем гаснет.
6. После срабатывания действует cooldown 300 мс, чтобы не ловить повторный дребезг
   от одного и того же удара.

## Настройка чувствительности

- `SHOCK_MULTIPLIER` — уменьшите значение (например до 1.3), чтобы сделать
  детектор чувствительнее; увеличьте, чтобы игнорировать слабые звуки.
- `SHOCK_MIN_DELTA` — минимальный абсолютный скачок над фоном; уменьшите для
  большей чувствительности к тихим ударам.
- `FLASH_DURATION_MS` — длительность свечения индикатора (по умолчанию 1000 мс).
- `RETRIGGER_COOLDOWN_MS` — минимальный интервал между срабатываниями.

Для подбора значений раскомментируйте строку `Serial.printf` в `loop()` и
откройте Serial Plotter (Tools → Serial Plotter) — на графике будут видны
амплитуда, фон и порог срабатывания в реальном времени.
