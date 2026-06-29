import { Sensor, SensorReading } from '../types';

interface Props {
  sensor: Sensor;
  reading?: SensorReading;
}

export function SensorCard({ sensor, reading }: Props) {
  const isBool = sensor.unit === 'bool';
  const value = reading?.value;
  const hasValue = value !== undefined;

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-xs font-mono uppercase tracking-wider">{sensor.topic}</p>
          <h3 className="text-white font-semibold mt-1">{sensor.name}</h3>
        </div>
        {isBool && hasValue && (
          <span
            className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
              value === 1 ? 'bg-red-500 animate-pulse' : 'bg-gray-600'
            }`}
          />
        )}
      </div>

      <div className="mt-4">
        {!hasValue ? (
          <span className="text-gray-600 text-3xl font-bold">—</span>
        ) : isBool ? (
          <span className={`text-2xl font-bold ${value === 1 ? 'text-red-400' : 'text-green-400'}`}>
            {value === 1 ? 'Обнаружена' : 'Нет'}
          </span>
        ) : (
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-bold text-white tabular-nums">{value}</span>
            <span className="text-gray-500 text-sm mb-1">{sensor.unit}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        {sensor.description && (
          <p className="text-gray-600 text-xs">{sensor.description}</p>
        )}
        {reading && (
          <p className="text-gray-700 text-xs ml-auto">
            {new Date(reading.time).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
