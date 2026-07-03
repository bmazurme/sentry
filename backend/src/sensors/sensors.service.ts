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

@Injectable()
export class SensorsService implements OnModuleInit {
  constructor(
    @InjectRepository(Sensor)
    private readonly repo: Repository<Sensor>,
    private readonly influx: InfluxService,
  ) {}

  async onModuleInit() {
    const defaults = [
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
    ];

    for (const s of defaults) {
      const exists = await this.repo.findOneBy({ topic: s.topic });
      if (!exists) await this.repo.save(s);
    }
  }

  findAll(): Promise<Sensor[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async create(data: { topic: string; name: string; unit: string; description?: string }) {
    const sensor = this.repo.create(data);
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
