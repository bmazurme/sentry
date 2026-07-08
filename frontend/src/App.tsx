import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { useSocket } from './hooks/useSocket';
import { useTheme } from './hooks/useTheme';
import { AdminPage } from './pages/AdminPage';
import { EmulatorPage } from './pages/EmulatorPage';
import { MonitoringPage } from './pages/MonitoringPage';

export default function App() {
  const { readings, connected } = useSocket();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white transition-colors flex">
      <Sidebar connected={connected} theme={theme} onToggleTheme={toggleTheme} />

      <div className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<MonitoringPage readings={readings} theme={theme} />} />
          <Route path="/emulator" element={<EmulatorPage readings={readings} />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
