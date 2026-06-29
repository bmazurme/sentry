export interface Sensor {
  id: string;
  topic: string;
  name: string;
  unit: string;
  description: string;
  createdAt: string;
}

export interface SensorReading {
  topic: string;
  value: number;
  time: string;
}

export interface HistoryPoint {
  time: string;
  value: number;
}
