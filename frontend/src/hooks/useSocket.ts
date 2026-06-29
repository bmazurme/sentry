import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SensorReading } from '../types';

export function useSocket() {
  const [readings, setReadings] = useState<Record<string, SensorReading>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
    const socket = io(url);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('sensor_update', (reading: SensorReading) => {
      setReadings(prev => ({ ...prev, [reading.topic]: reading }));
    });

    return () => { socket.disconnect(); };
  }, []);

  return { readings, connected };
}
