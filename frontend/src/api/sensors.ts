import { HistoryPoint, Sensor } from '../types';

export async function fetchSensors(): Promise<Sensor[]> {
  const res = await fetch('/api/sensors');
  if (!res.ok) throw new Error('Failed to fetch sensors');
  return res.json();
}

export async function fetchHistory(
  sensorId: string,
  from = '-1h',
  to?: string,
  limit = 300,
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({ from, limit: String(limit) });
  if (to) params.set('to', to);
  const res = await fetch(`/api/sensors/${sensorId}/history?${params}`);
  if (!res.ok) return [];
  return res.json();
}

export async function createSensor(data: {
  topic: string;
  name: string;
  unit: string;
  description?: string;
}): Promise<Sensor> {
  const res = await fetch('/api/sensors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Failed to create sensor');
  }
  return res.json();
}

export async function deleteSensor(id: string): Promise<void> {
  const res = await fetch(`/api/sensors/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete sensor');
}
