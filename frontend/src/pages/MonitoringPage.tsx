import { useEffect, useState } from 'react';
import { fetchSensors } from '../api/sensors';
import { SensorCard } from '../components/SensorCard';
import { SensorChart } from '../components/SensorChart';
import { Theme } from '../hooks/useTheme';
import { Sensor, SensorReading } from '../types';

interface Props {
  readings: Record<string, SensorReading>;
  theme: Theme;
}

export function MonitoringPage({ readings, theme }: Props) {
  const [sensors, setSensors] = useState<Sensor[]>([]);

  useEffect(() => {
    fetchSensors().then(setSensors).catch(console.error);
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
      <section>
        <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
          Текущие показания
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sensors.map(s => (
            <SensorCard key={s.id} sensor={s} reading={readings[s.topic]} />
          ))}
          {sensors.length === 0 && (
            <p className="text-gray-600 text-sm col-span-3">Нет датчиков</p>
          )}
        </div>
      </section>

      {sensors.length > 0 && (
        <section>
          <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
            История
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sensors.map(s => (
              <SensorChart key={s.id} sensor={s} latestReading={readings[s.topic]} theme={theme} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
