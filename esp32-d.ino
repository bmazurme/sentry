/*
  Детектор вибраций/ударов на базе микрофона INMP441 (I2S)
  Плата: ESP32-D (ESP32-WROOM-32 DevKit)
  Используется ВСТРОЕННЫЙ одноцветный светодиод платы на GPIO2.

  Часть системы мониторинга Sentry: при ударе светодиод загорается
  на 1 секунду, и параллельно устройство публикует данные по MQTT,
  чтобы backend (NestJS) писал их в InfluxDB, а frontend (React)
  отображал показания в реальном времени.

  ЧТО ПУБЛИКУЕТСЯ (тема -> смысл):
    sensor/shock2/amplitude  -> пиковая амплитуда за окно публикации (ADC)
    sensor/shock2/detected   -> 1 в момент удара / пока горит LED, иначе 0 (bool)
    sensor/shock2/count      -> суммарное число зафиксированных ударов (count)

  Темы отличаются от ESP32-S3 (sensor/shock/*), чтобы обе платы могли
  работать в системе одновременно, не затирая данные друг друга. Если это
  устройство ЗАМЕНЯЕТ ESP32-S3 — поменяйте топики ниже на sensor/shock/*.

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

  Требуемые библиотеки:
    - встроенный ESP32 Arduino Core (WiFi)
    - PubSubClient (Library Manager -> "PubSubClient" by Nick O'Leary)
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <driver/i2s.h>

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
#define SAMPLE_RATE      16000       // INMP441 работает в диапазоне ~16..48 кГц
#define SAMPLE_BITS      32          // INMP441 отдаёт 24 бита в 32-битном слове
#define I2S_READ_LEN     512         // сэмплов за одно чтение
#define DMA_BUF_COUNT    4
#define DMA_BUF_LEN      256

// ---------- Адаптивная чувствительность ----------
// Вместо жёсткого порога считаем средний уровень фонового шума (baseline)
// и триггерим удар, когда амплитуда превышает baseline в SHOCK_MULTIPLIER раз
// (плюс небольшая абсолютная надбавка SHOCK_MIN_DELTA, чтобы не ловить тишину).
#define BASELINE_SMOOTHING     0.98f     // чем ближе к 1 — тем медленнее адаптация фона
#define SHOCK_MULTIPLIER       2.0f      // во сколько раз превышение фона считаем ударом
#define SHOCK_MIN_DELTA        6000.0f   // минимальный абсолютный скачок над фоном
// Минимальный интервал между срабатываниями (защита от дребезга/повторных импульсов удара)
#define RETRIGGER_COOLDOWN_MS 300
// Длительность свечения индикатора при срабатывании
#define FLASH_DURATION_MS     1000
// Как часто публиковать пиковую амплитуду за окно (мс)
#define PUBLISH_INTERVAL_MS   1000

int32_t i2sBuffer[I2S_READ_LEN];

bool ledActive = false;
unsigned long ledStartTime = 0;
unsigned long lastTriggerTime = 0;
unsigned long lastPublishTime = 0;
float noiseBaseline = 0.0f;     // текущий адаптивный уровень фонового шума
bool baselineInitialized = false;
float windowMax = 0.0f;         // пиковая амплитуда с момента прошлой публикации
unsigned long shockCount = 0;   // суммарное число зафиксированных ударов

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

void publishCount() {
  char buf[16];
  snprintf(buf, sizeof(buf), "%lu", shockCount);
  mqtt.publish(TOPIC_COUNT, buf);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Инициализация детектора вибраций (INMP441 + встроенный LED GPIO2)...");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);   // выключен по умолчанию

  setupWifi();
  mqtt.setServer(mqtt_server, mqtt_port);
  setupI2SMic();

  Serial.println("Готово. Слушаем звук/вибрации и публикуем в MQTT...");
}

void loop() {
  // Поддерживаем соединения WiFi/MQTT (неблокирующе)
  if (WiFi.status() != WL_CONNECTED) setupWifi();
  bool mqttOk = ensureMqtt();
  if (mqttOk) mqtt.loop();

  float amplitude = readMaxAmplitude();
  unsigned long now = millis();

  if (!baselineInitialized) {
    // Первое чтение — сразу берём как стартовый уровень фона
    noiseBaseline = amplitude;
    baselineInitialized = true;
  }

  float dynamicThreshold = noiseBaseline * SHOCK_MULTIPLIER + SHOCK_MIN_DELTA;

  // Копим пик за окно публикации
  if (amplitude > windowMax) windowMax = amplitude;

  // Раскомментируйте для калибровки/отладки (Serial Plotter):
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

      Serial.println(">>> УДАР ЗАФИКСИРОВАН! LED ON <<<");
    }
  }

  if (!ledActive) {
    // Плавно подстраиваем фон только когда нет активного срабатывания,
    // чтобы амплитуда самого удара не "испортила" baseline
    noiseBaseline = noiseBaseline * BASELINE_SMOOTHING + amplitude * (1.0f - BASELINE_SMOOTHING);
  }

  if (ledActive && (now - ledStartTime >= FLASH_DURATION_MS)) {
    digitalWrite(LED_PIN, LOW);
    ledActive = false;
    if (mqttOk) mqtt.publish(TOPIC_DETECTED, "0");
    Serial.println(">>> LED OFF <<<");
  }

  // Периодически публикуем пиковую амплитуду за окно (для графика)
  if (now - lastPublishTime >= PUBLISH_INTERVAL_MS) {
    lastPublishTime = now;
    if (mqttOk) {
      char buf[16];
      snprintf(buf, sizeof(buf), "%.0f", windowMax);
      mqtt.publish(TOPIC_AMPLITUDE, buf);
    }
    windowMax = 0.0f;
  }
}
