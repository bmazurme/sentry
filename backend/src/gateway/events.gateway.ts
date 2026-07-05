import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  emit(topic: string, value: number) {
    this.server.emit('sensor_update', {
      topic,
      value,
      time: new Date().toISOString(),
    });
  }
}
