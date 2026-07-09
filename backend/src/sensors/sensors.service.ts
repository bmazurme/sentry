import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from './sensor.entity';
import { InfluxService } from '../influx/influx.service';

const VALID_RANGES = new Set(['-5m', '-15m', '-1h', '-6h', '-12h', '-24h', '-7d', '-30d']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function safeTimestamp(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (VALID_RANGES.has(value)) return value;
  if (ISO_RE.test(value)) return value;
  return fallback;
}

export interface SensorPreset {
  topic: string;
  name: string;
  unit: string;
  description: string;
}

// Каталог известных датчиков, которые публикуют прошивки. Используется как для
// первичного заполнения БД (onModuleInit), так и на фронте — выпадающий список
// «доступных датчиков» в форме добавления.
export const SENSOR_CATALOG: SensorPreset[] = [
  {
    topic: 'sensor/noise/peak',
    name: 'Уровень шума',
    unit: 'ADC',
    description: 'Пиковая амплитуда с микрофона MAX4466',
  },
  {
    topic: 'sensor/vibration/peak',
    name: 'Вибрация',
    unit: 'bool',
    description: 'Вибрация обнаружена датчиком SW-420',
  },
  {
    topic: 'sensor/shock/amplitude',
    name: 'Пиковая амплитуда удара',
    unit: 'ADC',
    description: 'Пиковая амплитуда звука/вибрации с микрофона INMP441 (ESP32-S3)',
  },
  {
    topic: 'sensor/shock/detected',
    name: 'Удар / резкий всплеск',
    unit: 'bool',
    description: 'Обнаружен удар или резкий звуковой всплеск (INMP441)',
  },
  {
    topic: 'sensor/shock/count',
    name: 'Счётчик ударов',
    unit: 'count',
    description: 'Суммарное число зафиксированных ударов (INMP441)',
  },
  {
    topic: 'sensor/shock2/amplitude',
    name: 'Пиковая амплитуда удара (ESP32-D)',
    unit: 'ADC',
    description: 'Пиковая амплитуда звука/вибрации с микрофона INMP441 (ESP32-D / WROOM-32)',
  },
  {
    topic: 'sensor/shock2/detected',
    name: 'Удар / резкий всплеск (ESP32-D)',
    unit: 'bool',
    description: 'Обнаружен удар или резкий звуковой всплеск (INMP441, ESP32-D)',
  },
  {
    topic: 'sensor/shock2/count',
    name: 'Счётчик ударов (ESP32-D)',
    unit: 'count',
    description: 'Суммарное число зафиксированных ударов (INMP441, ESP32-D)',
  },
  {
    topic: 'sensor/shock2/noise',
    name: 'Уровень шума (ESP32-D)',
    unit: 'dB',
    description: 'Приблизительный уровень шума в dB SPL (откалиброван из RMS/dBFS, INMP441, ESP32-D)',
  },
];

@Injectable()
export class SensorsService implements OnModuleInit {
  constructor(
    @InjectRepository(Sensor)
    private readonly repo: Repository<Sensor>,
    private readonly influx: InfluxService,
  ) {}

  async onModuleInit() {
    for (const s of SENSOR_CATALOG) {
      const exists = await this.repo.findOneBy({ topic: s.topic });
      if (!exists) {
        await this.repo.save(s);
      } else if (
        exists.name !== s.name ||
        exists.unit !== s.unit ||
        exists.description !== s.description
      ) {
        // Синхронизируем метаданные предустановленных датчиков с кодом
        // (например, при смене единицы dBFS -> dB после калибровки)
        await this.repo.update(exists.id, {
          name: s.name,
          unit: s.unit,
          description: s.description,
        });
      }
    }
  }

  findAll(): Promise<Sensor[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  catalog(): SensorPreset[] {
    return SENSOR_CATALOG;
  }

  async create(data: { topic: string; name: string; unit: string; description?: string }) {
    const sensor = this.repo.create(data);
    return this.repo.save(sensor);
  }

  async update(
    id: string,
    data: Partial<{ topic: string; name: string; unit: string; description: string }>,
  ): Promise<Sensor | null> {
    const sensor = await this.repo.findOneBy({ id });
    if (!sensor) return null;
    if (data.topic !== undefined) sensor.topic = data.topic;
    if (data.name !== undefined) sensor.name = data.name;
    if (data.unit !== undefined) sensor.unit = data.unit;
    if (data.description !== undefined) sensor.description = data.description;
    return this.repo.save(sensor);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async getHistory(id: string, from: string, limit: number, to?: string) {
    const sensor = await this.repo.findOneBy({ id });
    if (!sensor) return [];
    const safeFrom = safeTimestamp(from, '-1h');
    const safeTo = to ? safeTimestamp(to, undefined) : undefined;
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    return this.influx.query(sensor.topic, safeFrom, safeLimit, safeTo);
  }
}
