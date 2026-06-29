export interface EmulatorStatus {
  running: boolean;
  intervalMs: number;
  sensors: { topic: string; name: string; unit: string; lastValue: number | null }[];
}

export async function getEmulatorStatus(): Promise<EmulatorStatus> {
  const res = await fetch('/api/emulator/status');
  if (!res.ok) throw new Error('Failed to fetch emulator status');
  return res.json();
}

export async function startEmulator(intervalMs: number): Promise<EmulatorStatus> {
  const res = await fetch('/api/emulator/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMs }),
  });
  return res.json();
}

export async function stopEmulator(): Promise<EmulatorStatus> {
  const res = await fetch('/api/emulator/stop', { method: 'POST' });
  return res.json();
}

export async function setEmulatorInterval(intervalMs: number): Promise<EmulatorStatus> {
  const res = await fetch('/api/emulator/interval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMs }),
  });
  return res.json();
}
