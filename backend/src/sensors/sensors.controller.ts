import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SensorsService } from './sensors.service';
import { MqttService } from '../mqtt/mqtt.service';

@Controller('sensors')
export class SensorsController {
  constructor(
    private readonly service: SensorsService,
    private readonly mqtt: MqttService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  // Доступные топики на сервисе: реально принятые брокером + из каталога
  @Get('topics')
  topics(): string[] {
    const fromCatalog = this.service.catalog().map(p => p.topic);
    const seen = this.mqtt.getSeenTopics();
    return [...new Set([...seen, ...fromCatalog])].sort();
  }

  @Post()
  create(@Body() body: { topic: string; name: string; unit: string; description?: string }) {
    return this.service.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<{ topic: string; name: string; unit: string; description: string }>,
  ) {
    const updated = await this.service.update(id, body);
    if (!updated) throw new NotFoundException('Sensor not found');
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    const deleted = await this.service.remove(id);
    if (!deleted) throw new NotFoundException('Sensor not found');
  }

  @Get(':id/history')
  getHistory(
    @Param('id') id: string,
    @Query('from') from = '-1h',
    @Query('to') to?: string,
    @Query('limit') limit = '300',
  ) {
    return this.service.getHistory(id, from, parseInt(limit), to);
  }
}
