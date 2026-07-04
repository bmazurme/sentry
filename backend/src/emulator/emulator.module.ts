import { Module } from '@nestjs/common';
import { MqttModule } from '../mqtt/mqtt.module';
import { SensorsModule } from '../sensors/sensors.module';
import { EmulatorController } from './emulator.controller';
import { EmulatorService } from './emulator.service';

@Module({
  imports: [MqttModule, SensorsModule],
  controllers: [EmulatorController],
  providers: [EmulatorService],
})
export class EmulatorModule {}
