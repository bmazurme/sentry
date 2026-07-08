import { useEffect, useRef, useState } from 'react';
import {
  EmulatorStatus,
  getEmulatorStatus,
  setEmulatorInterval,
  startEmulator,
  stopEmulator,
} from '../api/emulator';
import { SensorReading } from '../types';

interface Props {
  readings: Record<string, SensorReading>;
}

export function EmulatorPage({ readings }: Props) {
  const [status, setStatus] = useState<EmulatorStatus | null>(null);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function load() {
    try {
      const s = await getEmulatorStatus();
      setStatus(s);
      setIntervalMs(s.intervalMs);
    } catch { /* ignore */ }
  }

  async function toggle() {
    setBusy(true);
    try {
      const s = status?.running
        ? await stopEmulator()
        : await startEmulator(intervalMs);
      setStatus(s);
    } finally {
      setBusy(false);
    }
  }

  async function applyInterval(ms: number) {
    setIntervalMs(ms);
    if (status?.running) {
      const s = await setEmulatorInterval(ms);
      setStatus(s);
    }
  }

  const running = status?.running ?? false;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Controls */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-gray-900 dark:text-white font-semibold">Эмулятор датчиков</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Публикует случайные данные в MQTT для всех зарегистрированных датчиков
            </p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
            running
              ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            {running ? 'Работает' : 'Остановлен'}
          </div>
        </div>

        {/* Interval slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-600 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
              Интервал публикации
            </label>
            <span className="text-gray-900 dark:text-white text-sm font-mono">
              {intervalMs >= 1000 ? `${intervalMs / 1000} с` : `${intervalMs} мс`}
            </span>
          </div>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={intervalMs}
            onChange={e => applyInterval(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-gray-600 text-xs mt-1">
            <span>200 мс</span>
            <span>5 с</span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mb-6">
          {[500, 1000, 2000, 5000].map(ms => (
            <button
              key={ms}
              onClick={() => applyInterval(ms)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                intervalMs === ms
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {ms >= 1000 ? `${ms / 1000}с` : `${ms}мс`}
            </button>
          ))}
        </div>

        <button
          onClick={toggle}
          disabled={busy || !status}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
            running
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {busy ? '...' : running ? 'Остановить' : 'Запустить'}
        </button>
      </section>

      {/* Sensor values */}
      {status && status.sensors.length > 0 && (
        <section>
          <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
            Генерируемые значения
          </h2>
          <ul className="space-y-2">
            {status.sensors.map(s => {
              const live = readings[s.topic];
              const display = live?.value ?? s.lastValue;
              const isBool = s.unit === 'bool';

              return (
                <li
                  key={s.topic}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-gray-900 dark:text-white font-medium truncate">{s.name}</p>
                    <p className="text-gray-500 text-xs font-mono mt-0.5 truncate">{s.topic}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {display !== null && display !== undefined ? (
                      <span className={`text-lg font-bold tabular-nums ${
                        isBool
                          ? display === 1 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {isBool ? (display === 1 ? '1 (да)' : '0 (нет)') : display}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                    {!isBool && display !== null && (
                      <span className="text-gray-500 text-xs ml-1">{s.unit}</span>
                    )}
                    {running && live && (
                      <p className="text-gray-600 text-xs mt-0.5">
                        {new Date(live.time).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {status && status.sensors.length === 0 && (
        <p className="text-gray-600 text-sm">
          Нет датчиков. Добавьте их на вкладке «Датчики».
        </p>
      )}
    </div>
  );
}
