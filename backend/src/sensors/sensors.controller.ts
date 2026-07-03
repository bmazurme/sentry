import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SensorsService } from './sensors.service';

@Controller('sensors')
export class SensorsController {
  constructor(private readonly service: SensorsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: { topic: string; name: string; unit: string; description?: string }) {
    return this.service.create(body);
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
