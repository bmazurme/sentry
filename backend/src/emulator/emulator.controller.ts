import { Body, Controller, Get, Post } from '@nestjs/common';
import { EmulatorService } from './emulator.service';

@Controller('emulator')
export class EmulatorController {
  constructor(private readonly service: EmulatorService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('start')
  async start(@Body() body: { intervalMs?: number }) {
    await this.service.start(body?.intervalMs);
    return this.service.status();
  }

  @Post('stop')
  async stop() {
    this.service.stop();
    return this.service.status();
  }

  @Post('interval')
  async setInterval(@Body() body: { intervalMs: number }) {
    this.service.setInterval(body.intervalMs);
    return this.service.status();
  }
}
