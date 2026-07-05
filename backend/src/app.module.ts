import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from './sensors/sensor.entity';
import { InfluxModule } from './influx/influx.module';
import { GatewayModule } from './gateway/gateway.module';
import { SensorsModule } from './sensors/sensors.module';
import { MqttModule } from './mqtt/mqtt.module';
import { EmulatorModule } from './emulator/emulator.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'sentry',
      password: process.env.DB_PASS || 'sentry123',
      database: process.env.DB_NAME || 'sentry',
      entities: [Sensor],
      synchronize: true,
    }),
    InfluxModule,
    GatewayModule,
    SensorsModule,
    MqttModule,
    EmulatorModule,
  ],
})
export class AppModule {}
