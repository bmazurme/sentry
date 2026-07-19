/*
  Детектор вибраций/ударов + измеритель уровня шума (dBFS)
  на базе микрофона INMP441 (I2S)
  Плата: ESP32-D (ESP32-WROOM-32 DevKit)
  Используется ВСТРОЕННЫЙ одноцветный светодиод платы на GPIO2.

  Часть системы мониторинга Sentry: устройство публикует данные по MQTT,
  backend (NestJS) пишет их в InfluxDB, а frontend (React) отображает в
  реальном времени. Это расширенная версия esp32-d.ino: помимо ударов
  измеряется и передаётся УРОВЕНЬ ШУМА.

  ФУНКЦИИ:
  1. При обнаружении удара/резкого звукового всплеска светодиод
     загорается на 1 секунду, затем гаснет.
  2. Каждую секунду вычисляется текущий уровень шума в dBFS
     (децибелы относительно полной шкалы АЦП) и публикуется в MQTT.

  ЧТО ПУБЛИКУЕТСЯ (тема -> смысл):
    sensor/shock2/amplitude  -> пиковая амплитуда за окно публикации (ADC)
    sensor/shock2/detected   -> 1 в момент удара / пока горит LED, иначе 0 (bool)
    sensor/shock2/count      -> суммарное число зафиксированных ударов (count)
    sensor/shock2/noise      -> уровень шума за окно, приблизит. dB SPL (см. SPL_OFFSET)

  Темы shock2/* совпадают с esp32-d.ino, поэтому эта прошивка — прямая
  замена базовой версии для того же узла ESP32-D, но с добавленным шумом.

  ПОДКЛЮЧЕНИЕ (только микрофон, светодиод уже на плате):
  INMP441        ESP32-D (WROOM-32)
  -------        -------------------
  VDD    ->      3.3V
  GND    ->      GND
  L/R    ->      GND        (левый канал)
  SD     ->      GPIO27     (I2S DATA / DOUT)
  WS     ->      GPIO25     (I2S WS / LRCLK)
  SCK    ->      GPIO26     (I2S BCLK)

  Встроенный светодиод: GPIO2 (никаких дополнительных подключений не требуется)

  ВАЖНО про dBFS vs dB SPL:
  dBFS (dB Full Scale) — уровень сигнала относительно максимума АЦП.
  0 dBFS = "потолок" (клиппинг), отрицательные значения = тише.
  Это НЕ то же самое, что дБ SPL (звуковое давление, как на шумомере).
  Чтобы получить приблизительные dB SPL, нужна калибровка под конкретный
  экземпляр микрофона с эталонным источником звука (например, 94 dB SPL
  калибратор на 1 кГц) — см. комментарий у SPL_OFFSET ниже.

  Требуемые библиотеки:
    - встроенный ESP32 Arduino Core (WiFi)
    - PubSubClient (Library Manager -> "PubSubClient" by Nick O'Leary)
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <driver/i2s.h>
#include <math.h>

// ---------- Настройки WiFi и MQTT (заполните своими данными) ----------
const char* ssid        = "ssid";
const char* password    = "password";
const char* mqtt_server = "192.168.50.182";
const int   mqtt_port   = 1883;
const char* client_id   = "ESP32D_SHOCK";
// mqtt_user / mqtt_pass задаёте вы сами: они должны совпадать с MQTT_USER /
// MQTT_PASS в docker-compose.yml (сервис backend). По умолчанию брокер Mosquitto
// настроен на allow_anonymous, поэтому проверка пароля отключена и подойдут
// любые значения. Как включить реальную аутентификацию — см. DEPLOY_RASPBERRY_PI.md, п. 5.2.
const char* mqtt_user   = "forest";
const char* mqtt_pass   = "mXv6RCnZRBU36XT";

// ---------- MQTT-темы (совпадают с сенсорами в backend) ----------
const char* TOPIC_AMPLITUDE = "sensor/shock2/amplitude";
const char* TOPIC_DETECTED  = "sensor/shock2/detected";
const char* TOPIC_COUNT     = "sensor/shock2/count";
const char* TOPIC_NOISE     = "sensor/shock2/noise";

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ---------- Пины I2S (INMP441) ----------
#define I2S_WS_PIN   25   // Word Select (LRCLK)
#define I2S_SD_PIN   27   // Serial Data (DOUT микрофона)
#define I2S_SCK_PIN  26   // Bit Clock (BCLK)
#define I2S_PORT     I2S_NUM_0

// ---------- Встроенный светодиод платы ----------
#define LED_PIN 2

// ---------- Параметры звука/детекции ----------
#define SAMPLE_RATE      16000
#define SAMPLE_BITS      32          // INMP441 отдаёт 24 бита в 32-битном слове
#define I2S_READ_LEN     512         // сэмплов за одно чтение
#define DMA_BUF_COUNT    4
#define DMA_BUF_LEN      256

// Максимально возможное значение 24-битного сэмпла (полная шкала АЦП)
#define FULL_SCALE_24BIT  8388608.0f   // 2^23

// ---------- Адаптивная чувствительность (детекция ударов) ----------
#define BASELINE_SMOOTHING     0.98f     // чем ближе к 1 — тем медленнее адаптация фона
#define SHOCK_MULTIPLIER       1.6f      // во сколько раз превышение фона считаем ударом
#define SHOCK_MIN_DELTA        3000.0f   // минимальный абсолютный скачок над фоном
#define RETRIGGER_COOLDOWN_MS  300       // минимальный интервал между срабатываниями
#define FLASH_DURATION_MS      1000      // длительность свечения индикатора

// ---------- Калибровка под dB SPL ----------
// В систему публикуется приблизительный уровень в dB SPL:
//   SPL = dBFS + SPL_OFFSET
// SPL_OFFSET подбирается по одной калибровочной точке:
//   SPL_OFFSET = (эталонный SPL) - (измеренный в этот момент dBFS)
// Замер: при тишине ~40 dB SPL (по эталонному шумомеру/телефону) микрофон
// показывал -72 dBFS, отсюда: SPL_OFFSET = 40 - (-72) = 112.
// Это ПРИБЛИЗИТЕЛЬНАЯ величина (зависит от экземпляра микрофона и АЧХ);
// для большей точности повторите замер по своему эталону и пересчитайте offset.
#define SPL_OFFSET  112.0f   // 40 - (-72) = 112

// Интервал публикации уровня шума / пиковой амплитуды (мс)
#define PUBLISH_INTERVAL_MS  1000

int32_t i2sBuffer[I2S_READ_LEN];

bool ledActive = false;
unsigned long ledStartTime = 0;
unsigned long lastTriggerTime = 0;
unsigned long lastPublishTime = 0;
float noiseBaseline = 0.0f;     // текущий адаптивный уровень фонового шума (для детекции ударов)
bool baselineInitialized = false;

// Накопители за окно публикации
float windowMax = 0.0f;             // пиковая амплитуда с момента прошлой публикации
double windowSumSquares = 0.0;      // сумма квадратов сэмплов за окно (для RMS -> dBFS)
unsigned long windowSamples = 0;    // число сэмплов за окно
unsigned long shockCount = 0;       // суммарное число зафиксированных ударов

// ------------------------------------------------------------------
void setupWifi() {
  Serial.print("\nПодключение к WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWiFi подключён, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nНе удалось подключиться к WiFi (продолжаем, попробуем позже)");
  }
}

// Неблокирующая проверка/переподключение MQTT. Возвращает true, если соединение есть.
bool ensureMqtt() {
  if (mqtt.connected()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  Serial.print("Подключение к MQTT...");
  if (mqtt.connect(client_id, mqtt_user, mqtt_pass)) {
    Serial.println(" подключено!");
    // Публикуем стартовое состояние, чтобы карточки на дашборде сразу ожили
    mqtt.publish(TOPIC_DETECTED, "0");
    char buf[16];
    snprintf(buf, sizeof(buf), "%lu", shockCount);
    mqtt.publish(TOPIC_COUNT, buf);
    return true;
  }
  Serial.print(" ошибка, rc=");
  Serial.println(mqtt.state());
  return false;
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

// Читает блок сэмплов и возвращает:
//  - maxAbsOut: максимальную абсолютную амплитуду в блоке (для детекции ударов)
//  - sumSquaresOut: сумму квадратов сэмплов блока (для расчёта RMS/dBFS уровня шума)
//  - samplesOut: число прочитанных сэмплов
void readAudioBlock(float &maxAbsOut, double &sumSquaresOut, int &samplesOut) {
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, (void*)i2sBuffer, sizeof(i2sBuffer), &bytesRead, portMAX_DELAY);

  int samplesRead = bytesRead / sizeof(int32_t);
  int32_t maxAbs = 0;
  double sumSquares = 0.0;

  for (int i = 0; i < samplesRead; i++) {
    int32_t sample = i2sBuffer[i] >> 8;   // приводим к 24-битному значению
    int32_t absSample = abs(sample);
    if (absSample > maxAbs) {
      maxAbs = absSample;
    }
    sumSquares += (double)sample * (double)sample;
  }

  maxAbsOut = (float)maxAbs;
  sumSquaresOut = sumSquares;
  samplesOut = samplesRead;
}

// Переводит RMS-значение сэмплов в dBFS (децибелы относительно полной шкалы АЦП)
float rmsToDbfs(float rms) {
  if (rms < 1.0f) rms = 1.0f;   // защита от log(0)
  return 20.0f * log10f(rms / FULL_SCALE_24BIT);
}

void publishCount() {
  char buf[16];
  snprintf(buf, sizeof(buf), "%lu", shockCount);
  mqtt.publish(TOPIC_COUNT, buf);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Инициализация детектора вибраций + измерителя шума (INMP441)...");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);   // выключен по умолчанию

  setupWifi();
  mqtt.setServer(mqtt_server, mqtt_port);
  setupI2SMic();

  Serial.println("Готово. Слушаем звук/вибрации, измеряем шум и публикуем в MQTT...");
}

void loop() {
  // Поддерживаем соединения WiFi/MQTT (неблокирующе)
  if (WiFi.status() != WL_CONNECTED) setupWifi();
  bool mqttOk = ensureMqtt();
  if (mqttOk) mqtt.loop();

  float amplitude;
  double blockSumSquares;
  int blockSamples;
  readAudioBlock(amplitude, blockSumSquares, blockSamples);
  unsigned long now = millis();

  // Копим статистику за окно публикации
  if (amplitude > windowMax) windowMax = amplitude;
  windowSumSquares += blockSumSquares;
  windowSamples += blockSamples;

  // ---------- Детекция ударов (адаптивный порог по пиковой амплитуде) ----------
  if (!baselineInitialized) {
    noiseBaseline = amplitude;
    baselineInitialized = true;
  }

  float dynamicThreshold = noiseBaseline * SHOCK_MULTIPLIER + SHOCK_MIN_DELTA;

  // Раскомментируйте для калибровки/отладки детектора ударов (Serial Plotter):
  // Serial.printf("%.0f %.0f %.0f\n", amplitude, noiseBaseline, dynamicThreshold);

  if (!ledActive && (now - lastTriggerTime > RETRIGGER_COOLDOWN_MS)) {
    if (amplitude > dynamicThreshold) {
      ledActive = true;
      ledStartTime = now;
      lastTriggerTime = now;
      shockCount++;

      digitalWrite(LED_PIN, HIGH);

      // Мгновенно сообщаем системе об ударе
      if (mqttOk) {
        mqtt.publish(TOPIC_DETECTED, "1");
        publishCount();
      }

      float blockRms = (blockSamples > 0) ? sqrt(blockSumSquares / blockSamples) : 0.0f;
      float dbfsAtTrigger = rmsToDbfs(blockRms);
      Serial.printf(">>> УДАР ЗАФИКСИРОВАН! Уровень: %.1f dBFS (~%.1f dB SPL) <<<\n",
                    dbfsAtTrigger, dbfsAtTrigger + SPL_OFFSET);
    }
  }

  if (!ledActive) {
    noiseBaseline = noiseBaseline * BASELINE_SMOOTHING + amplitude * (1.0f - BASELINE_SMOOTHING);
  }

  if (ledActive && (now - ledStartTime >= FLASH_DURATION_MS)) {
    digitalWrite(LED_PIN, LOW);
    ledActive = false;
    if (mqttOk) mqtt.publish(TOPIC_DETECTED, "0");
    Serial.println(">>> LED OFF <<<");
  }

  // ---------- Периодическая публикация амплитуды и уровня шума ----------
  if (now - lastPublishTime >= PUBLISH_INTERVAL_MS) {
    lastPublishTime = now;

    float windowRms = (windowSamples > 0) ? sqrt(windowSumSquares / windowSamples) : 0.0f;
    float dbfs = rmsToDbfs(windowRms);
    float approxSpl = dbfs + SPL_OFFSET;

    if (mqttOk) {
      char buf[16];
      snprintf(buf, sizeof(buf), "%.0f", windowMax);
      mqtt.publish(TOPIC_AMPLITUDE, buf);
      // Публикуем приблизительный уровень в dB SPL (откалиброван через SPL_OFFSET),
      // чтобы на дашборде значение было в привычных dB, а не в отрицательных dBFS
      snprintf(buf, sizeof(buf), "%.1f", approxSpl);
      mqtt.publish(TOPIC_NOISE, buf);
    }

    Serial.printf("Уровень шума: %.1f dBFS  (~%.1f dB SPL, приблизительно)\n", dbfs, approxSpl);

    // Сброс накопителей окна
    windowMax = 0.0f;
    windowSumSquares = 0.0;
    windowSamples = 0;
  }
}
