import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { InfluxService } from '../influx/influx.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;

  constructor(
    private readonly influx: InfluxService,
    private readonly gateway: EventsGateway,
  ) {}

  onModuleInit() {
    this.client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883', {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log('MQTT connected');
      this.client.subscribe('sensor/#');
    });

    this.client.on('message', (topic, payload) => {
      const value = parseFloat(payload.toString());
      if (isNaN(value)) return;
      this.influx.write(topic, value);
      this.gateway.emit(topic, value);
    });

    this.client.on('error', err => this.logger.error('MQTT error', err.message));
  }

  publish(topic: string, value: string) {
    if (this.client?.connected) {
      this.client.publish(topic, value);
    }
  }

  onModuleDestroy() {
    this.client?.end();
  }
}
