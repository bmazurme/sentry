# Развёртывание Sentry на Raspberry Pi 5 (Docker)

Пошаговая инструкция по сборке и запуску всей системы мониторинга Sentry на
одноплатном компьютере Raspberry Pi 5 через Docker Compose.

Raspberry Pi 5 использует архитектуру **arm64 (aarch64)**. Все образы из
`docker-compose.yml` (`eclipse-mosquitto`, `postgres`, `influxdb`, `node`,
`nginx`) мультиархитектурные и собираются/запускаются на Pi нативно —
кросс-сборка не требуется.

---

## 1. Что разворачиваем

| Сервис | Образ / сборка | Порт (хост) | Назначение |
|---|---|---|---|
| `frontend` | сборка `./frontend` (nginx) | `3000` → 80 | Веб-дашборд (React) |
| `backend` | сборка `./backend` (NestJS) | `3001` | API + WebSocket + приём MQTT |
| `mosquitto` | `eclipse-mosquitto:2` | `1883` | MQTT-брокер (сюда шлют ESP32) |
| `influxdb` | `influxdb:2.7` | `8086` | Временные ряды показаний |
| `postgres` | `postgres:15-alpine` | `5432` | Метаданные датчиков |

Поток данных: **ESP32 → MQTT (1883) → backend → InfluxDB + WebSocket → frontend (3000)**.

---

## 2. Требования

- **Raspberry Pi 5** (4 или 8 ГБ) с **Raspberry Pi OS (64-bit)** или Ubuntu 24.04 arm64.
- microSD (рекомендуется от 16 ГБ) или SSD по USB/NVMe.
- Pi и все ESP32-устройства — в одной локальной сети.
- Доступ к Pi по SSH или напрямую с монитором/клавиатурой.

Проверьте, что система 64-битная:

```bash
uname -m      # должно вывести: aarch64
```

---

## 3. Установка Docker и Docker Compose на Pi

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Официальный скрипт установки Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Запускаем Docker без sudo (нужно перелогиниться после этой команды)
sudo usermod -aG docker $USER

# Автозапуск Docker при загрузке Pi
sudo systemctl enable docker
```

Перезайдите в сессию (`exit` и снова SSH) и проверьте:

```bash
docker --version
docker compose version
```

> Плагин `docker compose` (v2) ставится вместе с Docker Engine — отдельный
> пакет `docker-compose` не нужен.

---

## 4. Получение кода на Pi

```bash
git clone <URL-репозитория> sentry
cd sentry
```

Или скопируйте проект на Pi через `scp`/`rsync` с рабочей машины:

```bash
rsync -av --exclude node_modules ./sentry/ pi@<IP_PI>:~/sentry/
```

---

## 5. Настройка перед запуском

### 5.1. Пароли (обязательно для «боевого» использования)

Значения по умолчанию заданы в `docker-compose.yml`. Перед реальной
эксплуатацией поменяйте их в одном месте — файле `docker-compose.yml`:

- `POSTGRES_PASSWORD` и `DB_PASS` (должны совпадать);
- `DOCKER_INFLUXDB_INIT_PASSWORD`, `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN` и
  соответствующий `INFLUX_TOKEN` у backend (токен в двух местах должен совпадать);
- `MQTT_USER` / `MQTT_PASS` у backend.

### 5.2. MQTT-брокер и учётные данные `mqtt_user` / `mqtt_pass`

В прошивках ESP32 указаны логин и пароль для MQTT:

```cpp
const char* mqtt_user = "forest";
const char* mqtt_pass = "mXv6RCnZRBU36XT";
```

**Откуда берутся эти значения.** Это не «внешние» ключи, которые нужно где-то
получать, — вы задаёте их сами. В проекте они прописаны в двух местах, и они
должны совпадать:

1. `docker-compose.yml` → сервис `backend` → переменные `MQTT_USER` и `MQTT_PASS`
   (значения по умолчанию — `forest` / `mXv6RCnZRBU36XT`);
2. прошивки ESP32 → `mqtt_user` / `mqtt_pass`.

**Важно:** по умолчанию `mosquitto/mosquitto.conf` содержит
`allow_anonymous true`, то есть брокер пускает **кого угодно без проверки**, и
логин/пароль фактически игнорируются — в прошивку можно вписать любые значения
(или те же `forest` / `mXv6RCnZRBU36XT`, чтобы совпадало с backend). Для
локальной сети этого достаточно.

**Как включить реальную аутентификацию (рекомендуется вне доверенной сети).**
Создайте на брокере файл паролей и придумайте свои логин/пароль:

```bash
# 1) Генерируем файл паролей (задаёт пароль для пользователя forest интерактивно)
docker compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd forest

# Либо без запущенного контейнера, разово:
docker run --rm -it -v "$PWD/mosquitto:/mosquitto/config" \
  eclipse-mosquitto:2 mosquitto_passwd -c /mosquitto/config/passwd forest
```

Затем в `mosquitto/mosquitto.conf` выключите анонимный доступ и подключите файл:

```conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
```

Добавьте монтирование файла паролей в `docker-compose.yml` (сервис `mosquitto`):

```yaml
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf
      - ./mosquitto/passwd:/mosquitto/config/passwd
```

После этого те же логин/пароль, что вы задали командой `mosquitto_passwd`,
пропишите в:
- `docker-compose.yml` → `MQTT_USER` / `MQTT_PASS` (backend);
- прошивках ESP32 → `mqtt_user` / `mqtt_pass`.

Перезапустите брокер и backend: `docker compose up -d mosquitto backend`.

### 5.3. Узнайте IP-адрес Pi (понадобится для прошивок)

```bash
hostname -I        # например: 192.168.50.42
```

Запомните этот адрес — его нужно указать в прошивках ESP32 (см. раздел 8).

---

## 6. Сборка и запуск

Из корня проекта:

```bash
docker compose up -d --build
```

- `--build` — соберёт образы `backend` и `frontend` под arm64 прямо на Pi
  (первая сборка занимает несколько минут);
- `-d` — запуск в фоне.

Проверьте, что все контейнеры поднялись:

```bash
docker compose ps
```

Все сервисы должны быть в статусе `Up`. Логи (для диагностики):

```bash
docker compose logs -f backend      # приём MQTT, подключение к БД
docker compose logs -f mosquitto
```

---

## 6А. Альтернатива: перенос образов без Docker Registry

Способ из [notes.ntlstl.dev/note/3](https://notes.ntlstl.dev/note/3): собрать
образы **один раз** на «сборочной» машине, упаковать в tar-архив (`docker save`),
скопировать по SSH (`scp`) и загрузить на Pi (`docker load`) — без реестра.

Когда полезно: на Pi долгая/тяжёлая сборка, нет доступа к Docker Registry, или
один и тот же образ нужно развернуть на нескольких Pi.

### Шаг 0. Задать имена образов в `docker-compose.yml`

Чтобы Compose использовал загруженные образы, а не пересобирал их, добавьте поле
`image:` к сервисам `backend` и `frontend`:

```yaml
  backend:
    build: ./backend
    image: sentry-backend:latest      # <— добавить
    # ...

  frontend:
    build: ./frontend
    image: sentry-frontend:latest     # <— добавить
    # ...
```

### Шаг 1. Собрать образы на сборочной машине (обязательно под arm64)

Raspberry Pi 5 — arm64, поэтому образы должны быть собраны именно под arm64.

- Если сборочная машина сама arm64 (другой Pi, Mac на Apple Silicon с Docker):

  ```bash
  docker compose build
  ```

- Если машина x86-64 — соберите под arm64 через buildx:

  ```bash
  docker buildx build --platform linux/arm64 -t sentry-backend:latest  --load ./backend
  docker buildx build --platform linux/arm64 -t sentry-frontend:latest --load ./frontend
  ```

### Шаг 2. Сохранить образы в tar-архив

```bash
# Опция -o задаёт имя выходного файла
docker save sentry-backend:latest  -o sentry-backend.tar
docker save sentry-frontend:latest -o sentry-frontend.tar
```

Если Pi полностью изолирован от интернета, так же перенесите базовые образы
(иначе Pi докачает их с Docker Hub сам):

```bash
docker save eclipse-mosquitto:2 postgres:15-alpine influxdb:2.7 -o sentry-base-images.tar
```

### Шаг 3. Скопировать архивы на Pi по SSH

```bash
scp sentry-backend.tar sentry-frontend.tar user@<IP_PI>:/tmp/
```

### Шаг 4. Загрузить образы на Pi

```bash
# docker load распаковывает tar и загружает образ в локальный Docker-демон
ssh user@<IP_PI> "docker load -i /tmp/sentry-backend.tar && docker load -i /tmp/sentry-frontend.tar"

# при переносе базовых образов:
ssh user@<IP_PI> "docker load -i /tmp/sentry-base-images.tar"
```

### Шаг 5. Запустить на Pi без пересборки

На Pi нужен сам файл `docker-compose.yml` (склонируйте репозиторий или
скопируйте хотя бы `docker-compose.yml`, `mosquitto/mosquitto.conf`). Затем:

```bash
docker compose up -d      # без --build: используются загруженные образы
```

Проверить, что образы на месте: `docker images | grep sentry`.

---

## 7. Проверка работы

1. Откройте в браузере: **`http://<IP_PI>:3000`** — должен открыться дашборд.
2. В шапке индикатор соединения должен показать «онлайн» (WebSocket подключён).
3. Быстрый тест без железа: на странице **«Эмулятор»** запустите генерацию —
   на дашборде появятся значения и графики по всем датчикам.
4. Проверить приём реальных данных из MQTT можно вручную с любой машины в сети:

   ```bash
   # публикуем тестовое значение (mosquitto-clients: sudo apt install mosquitto-clients)
   mosquitto_pub -h <IP_PI> -t sensor/shock/amplitude -m 1234
   ```

   Значение должно появиться на карточке «Пиковая амплитуда удара».

---

## 8. Подключение ESP32 к Pi

В прошивках (`vibration_shock_detector.ino`, `esp32-d.ino`,
`controller/*.md`) укажите IP-адрес Pi из шага 5.3 как MQTT-сервер:

```cpp
const char* mqtt_server = "192.168.50.42";   // IP вашего Raspberry Pi
const int   mqtt_port   = 1883;
```

Убедитесь, что задан правильный `ssid`/`password` вашей сети. После прошивки
устройства начнут публиковать в темы `sensor/#`, backend сам их подхватит
(подписка на `sensor/#`), запишет в InfluxDB и разошлёт на дашборд.

Соответствие тем и предустановленных датчиков — в
`backend/src/sensors/sensors.service.ts`.

---

## 9. Автозапуск при перезагрузке

В `docker-compose.yml` у всех сервисов уже стоит `restart: unless-stopped`, а
Docker включён в автозагрузку (шаг 3). Поэтому после перезагрузки Pi система
поднимется автоматически. Проверить:

```bash
sudo reboot
# после загрузки:
docker compose ps
```

---

## 10. Полезные команды

```bash
# Остановить всё (данные в томах сохраняются)
docker compose down

# Остановить и удалить данные (postgres/influx) — ПОЛНЫЙ сброс
docker compose down -v

# Перезапустить один сервис
docker compose restart backend

# Обновить код и пересобрать
git pull
docker compose up -d --build

# Освободить место от старых образов/слоёв
docker system prune -f
```

---

## 11. Диагностика

| Симптом | Что проверить |
|---|---|
| Дашборд не открывается | `docker compose ps`; открыт ли порт 3000; правильный ли IP Pi |
| Индикатор «оффлайн» на дашборде | логи `backend`; доступность `http://<IP_PI>:3001/api/sensors` |
| Данные с ESP32 не приходят | тот же ли IP брокера в прошивке; `docker compose logs mosquitto`; одна ли сеть у Pi и ESP32 |
| Нет истории/графиков | логи `backend` (подключение к InfluxDB); статус контейнера `influxdb` |
| `backend` перезапускается | логи; доступность `postgres`/`influxdb`; совпадают ли пароли/токены |
| Мало памяти при сборке | закрыть лишнее; при 4 ГБ увеличить swap (`sudo dphys-swapfile`) |

Проверка доступности API напрямую:

```bash
curl http://<IP_PI>:3001/api/sensors
```

---

## 12. Доступ из локальной сети

Дашборд и порты слушают на всех интерфейсах Pi, поэтому доступны с любого
устройства в сети по IP Pi. Если на Pi включён firewall (`ufw`), откройте порты:

```bash
sudo ufw allow 3000/tcp    # дашборд
sudo ufw allow 1883/tcp    # MQTT (для ESP32)
```

Порты `3001`, `8086`, `5432` для работы дашборда наружу не обязательны — их
можно не открывать, если доступ к API/БД снаружи не нужен.
