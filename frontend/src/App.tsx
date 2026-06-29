import { useEffect, useState } from 'react';
import { fetchSensors } from './api/sensors';
import { Header, Page } from './components/Header';
import { SensorCard } from './components/SensorCard';
import { SensorChart } from './components/SensorChart';
import { useSocket } from './hooks/useSocket';
import { AdminPage } from './pages/AdminPage';
import { EmulatorPage } from './pages/EmulatorPage';
import { Sensor } from './types';

export default function App() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [page, setPage] = useState<Page>('dashboard');
  const { readings, connected } = useSocket();

  useEffect(() => {
    if (page === 'dashboard') {
      fetchSensors().then(setSensors).catch(console.error);
    }
  }, [page]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header connected={connected} page={page} onNavigate={setPage} />

      {page === 'dashboard' && (
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
                  <SensorChart key={s.id} sensor={s} latestReading={readings[s.topic]} />
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {page === 'emulator' && <EmulatorPage readings={readings} />}
      {page === 'admin' && <AdminPage />}
    </div>
  );
}
