export type Page = 'dashboard' | 'admin' | 'emulator';

interface Props {
  connected: boolean;
  page: Page;
  onNavigate: (p: Page) => void;
}

const TABS: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Мониторинг' },
  { id: 'emulator', label: 'Эмулятор' },
  { id: 'admin', label: 'Датчики' },
];

export function Header({ connected, page, onNavigate }: Props) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 py-4">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center font-bold text-white text-xs">
            S
          </div>
          <span className="text-white font-semibold tracking-tight">Sentry</span>
        </div>

        <nav className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`px-4 py-4 text-sm border-b-2 transition-colors ${
                page === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            connected ? 'bg-green-400' : 'bg-red-500 animate-pulse'
          }`}
        />
        <span className="text-xs text-gray-500">{connected ? 'Online' : 'Offline'}</span>
      </div>
    </header>
  );
}
