import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MqttService } from '../mqtt/mqtt.service';
import { SensorsService } from '../sensors/sensors.service';

function simulate(unit: string): number {
  switch (unit) {
    case 'ADC':
      return Math.random() < 0.1
        ? Math.floor(Math.random() * 1500 + 500)
        : Math.floor(Math.random() * 250);
    case 'dB':
      // Приблизительный уровень шума в dB SPL: тихий фон ~ 35..50,
      // редкие всплески до ~85 (разговор/удар рядом)
      return Math.random() < 0.1
        ? parseFloat((60 + Math.random() * 25).toFixed(1))
        : parseFloat((35 + Math.random() * 15).toFixed(1));
    case 'bool':
      return Math.random() < 0.15 ? 1 : 0;
    case '°C':
      return parseFloat((20 + Math.random() * 10).toFixed(1));
    case '%':
      return parseFloat((40 + Math.random() * 40).toFixed(1));
    case 'Pa':
      return Math.round(101000 + Math.random() * 1000);
    case 'lux':
      return Math.round(100 + Math.random() * 900);
    case 'ppm':
      return Math.round(400 + Math.random() * 200);
    case 'm/s²':
      return parseFloat((Math.random() * 2).toFixed(2));
    default:
      return parseFloat((Math.random() * 100).toFixed(2));
  }
}

export interface EmulatorStatus {
  running: boolean;
  intervalMs: number;
  sensors: { topic: string; name: string; unit: string; lastValue: number | null }[];
}

@Injectable()
export class EmulatorService implements OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 1000;
  private lastValues: Record<string, number> = {};
  private counters: Record<string, number> = {};

  constructor(
    private readonly mqtt: MqttService,
    private readonly sensors: SensorsService,
  ) {}

  async start(intervalMs?: number) {
    if (intervalMs) this.intervalMs = Math.max(200, Math.min(10000, intervalMs));
    this.stop();
    await this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setInterval(ms: number) {
    this.intervalMs = Math.max(200, Math.min(10000, ms));
    if (this.timer) this.start();
  }

  async status(): Promise<EmulatorStatus> {
    const all = await this.sensors.findAll();
    return {
      running: !!this.timer,
      intervalMs: this.intervalMs,
      sensors: all.map(s => ({
        topic: s.topic,
        name: s.name,
        unit: s.unit,
        lastValue: this.lastValues[s.topic] ?? null,
      })),
    };
  }

  private async tick() {
    const all = await this.sensors.findAll();
    for (const s of all) {
      let value: number;
      if (s.unit === 'count') {
        // Монотонный счётчик: изредка увеличиваем, имитируя редкие удары
        if (Math.random() < 0.15) this.counters[s.topic] = (this.counters[s.topic] ?? 0) + 1;
        value = this.counters[s.topic] ?? 0;
      } else {
        value = simulate(s.unit);
      }
      this.lastValues[s.topic] = value;
      this.mqtt.publish(s.topic, String(value));
    }
  }

  onModuleDestroy() {
    this.stop();
  }
}
