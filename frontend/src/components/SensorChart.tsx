import { useEffect, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchHistory } from '../api/sensors';
import { HistoryPoint, Sensor, SensorReading } from '../types';
import { Theme } from '../hooks/useTheme';

interface Props {
  sensor: Sensor;
  latestReading?: SensorReading;
  theme: Theme;
}

type Mode = 'preset' | 'custom';
const PRESETS = ['-15m', '-1h', '-6h', '-24h', '-7d'] as const;

function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function SensorChart({ sensor, latestReading, theme }: Props) {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('preset');
  const [preset, setPreset] = useState('-1h');

  const now = new Date();
  const [customFrom, setCustomFrom] = useState(toInputValue(new Date(now.getTime() - 3600_000)));
  const [customTo, setCustomTo] = useState(toInputValue(now));
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = mode === 'preset';
  }, [mode]);

  useEffect(() => {
    if (mode === 'preset') load(preset, undefined);
  }, [sensor.id, preset, mode]);

  async function load(from: string, to: string | undefined) {
    setLoading(true);
    try {
      const rows = await fetchHistory(sensor.id, from, to, 500);
      setData(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function applyCustom() {
    load(toIso(customFrom), toIso(customTo));
  }

  useEffect(() => {
    if (!latestReading || !liveRef.current) return;
    setData(prev => [...prev, { time: latestReading.time, value: latestReading.value }].slice(-500));
  }, [latestReading]);

  const isBool = sensor.unit === 'bool';
  const color = isBool ? '#ef4444' : '#3b82f6';
  const gradId = `grad-${sensor.id}`;

  // Цвета осей/сетки/тултипа зависят от темы
  const chartColors =
    theme === 'dark'
      ? { grid: '#1f2937', tick: '#4b5563', tooltipBg: '#111827', tooltipBorder: '#374151' }
      : { grid: '#e5e7eb', tick: '#9ca3af', tooltipBg: '#ffffff', tooltipBorder: '#e5e7eb' };

  // Числовой timestamp (мс) для временной оси X — чтобы точки располагались
  // по фактическому времени, а не равномерно (иначе интервалы между ударами
  // выглядят одинаковыми независимо от реальных пауз).
  const chartData = data.map(d => ({ ts: new Date(d.time).getTime(), value: d.value }));

  const formatTick = (t: number) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatLabel = (t: number) =>
    new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-colors">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-gray-900 dark:text-white font-semibold">{sensor.name}</h3>

        <div className="flex gap-1">
          <button
            onClick={() => setMode('preset')}
            className={`px-2.5 py-1 rounded-l-lg text-xs font-medium border transition-colors ${
              mode === 'preset'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Быстро
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`px-2.5 py-1 rounded-r-lg text-xs font-medium border transition-colors ${
              mode === 'custom'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Период
          </button>
        </div>
      </div>

      {/* Preset buttons */}
      {mode === 'preset' && (
        <div className="flex gap-1 mb-4">
          {PRESETS.map(r => (
            <button
              key={r}
              onClick={() => setPreset(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                preset === r
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
              }`}
            >
              {r.replace('-', '')}
            </button>
          ))}
        </div>
      )}

      {/* Custom range picker */}
      {mode === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="block text-gray-500 text-xs mb-1">От</label>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:[color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1">До</label>
            <input
              type="datetime-local"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:[color-scheme:dark]"
            />
          </div>
          <button
            onClick={applyCustom}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {loading ? '...' : 'Показать'}
          </button>
        </div>
      )}

      {/* Chart */}
      {loading && data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-gray-600 text-sm">
          Загрузка...
        </div>
      ) : data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-gray-600 text-sm">
          Нет данных за выбранный период
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={176}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTick}
              tick={{ fill: chartColors.tick, fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: chartColors.tick, fontSize: 11 }}
              domain={isBool ? [0, 1] : ['auto', 'auto']}
              tickCount={isBool ? 2 : 5}
            />
            <Tooltip
              contentStyle={{
                background: chartColors.tooltipBg,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#6b7280' }}
              itemStyle={{ color }}
              labelFormatter={t => formatLabel(t as number)}
              formatter={(v: number) => [
                isBool ? (v === 1 ? 'Обнаружена' : 'Нет') : `${v} ${sensor.unit}`,
                sensor.name,
              ]}
            />
            <Area
              type={isBool ? 'stepAfter' : 'monotone'}
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={isBool ? { r: 2, fill: color } : false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Point count */}
      {data.length > 0 && (
        <p className="text-gray-700 text-xs mt-2 text-right">{data.length} точек</p>
      )}
    </div>
  );
}
