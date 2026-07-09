import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Theme } from '../hooks/useTheme';

interface Props {
  connected: boolean;
  theme: Theme;
  onToggleTheme: () => void;
}

const TABS: { to: string; label: string; icon: () => JSX.Element }[] = [
  { to: '/', label: 'Мониторинг', icon: IconDashboard },
  { to: '/emulator', label: 'Эмулятор', icon: IconEmulator },
  { to: '/admin', label: 'Датчики', icon: IconSensors },
];

export function Sidebar({ connected, theme, onToggleTheme }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Строка пункта: в свёрнутом виде — только центрированная иконка-квадрат,
  // в развёрнутом — строка на всю ширину с подписью.
  const rowCollapsed = 'group w-full flex justify-center py-1';
  const rowExpanded =
    'group w-full flex items-center gap-2.5 pl-1 pr-3 h-10 rounded-lg text-sm transition-colors';

  // Квадрат-обёртка иконки того же размера, что логотип Sentry (w-8 h-8).
  // Синим подсвечивается ТОЛЬКО иконка активной страницы.
  const iconBox = (active: boolean) => {
    const base = 'w-8 h-8 shrink-0 flex items-center justify-center rounded-md transition-colors';
    if (active) return `${base} bg-blue-600 text-white`;
    const idle = 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white';
    // В свёрнутом виде фона-подсветки у строки нет — даём ховер прямо на квадрат
    return collapsed
      ? `${base} ${idle} group-hover:bg-gray-100 dark:group-hover:bg-gray-800`
      : `${base} ${idle}`;
  };

  // Строка активного пункта в развёрнутом виде: более светлый оттенок фона и синий текст.
  const navRow = (active: boolean) =>
    collapsed
      ? rowCollapsed
      : `${rowExpanded} ${
          active ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`;

  const navLabel = (active: boolean) =>
    active
      ? 'whitespace-nowrap text-blue-700 dark:text-blue-300 font-medium'
      : 'whitespace-nowrap text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white';

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-56'
      } shrink-0 sticky top-0 h-screen flex flex-col overflow-hidden bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-[width] duration-200 ease-in-out`}
    >
      {/* Logo */}
      <div
        className={`h-16 flex items-center border-b border-gray-200 dark:border-gray-800 ${
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'
        }`}
      >
        <div className="w-8 h-8 shrink-0 bg-blue-600 rounded-md flex items-center justify-center font-bold text-white text-sm">
          S
        </div>
        {!collapsed && (
          <span className="text-gray-900 dark:text-white font-semibold tracking-tight whitespace-nowrap">
            Sentry
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              title={collapsed ? tab.label : undefined}
              className={({ isActive }) => navRow(isActive)}
            >
              {({ isActive }) => (
                <>
                  <span className={iconBox(isActive)}>
                    <Icon />
                  </span>
                  {!collapsed && <span className={navLabel(isActive)}>{tab.label}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-800 space-y-1">
        {/* Connection status */}
        <div
          className={`${collapsed ? rowCollapsed : rowExpanded} text-gray-500`}
          title={collapsed ? (connected ? 'Online' : 'Offline') : undefined}
        >
          <span className="w-8 h-8 shrink-0 flex items-center justify-center">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                connected ? 'bg-green-400' : 'bg-red-500 animate-pulse'
              }`}
            />
          </span>
          {!collapsed && <span className="whitespace-nowrap">{connected ? 'Online' : 'Offline'}</span>}
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={collapsed ? (theme === 'dark' ? 'Светлая тема' : 'Тёмная тема') : undefined}
          aria-label="Переключить тему"
          className={navRow(false)}
        >
          <span className={iconBox(false)}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
          {!collapsed && (
            <span className={navLabel(false)}>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          className={navRow(false)}
        >
          <span className={iconBox(false)}>
            <ChevronIcon collapsed={collapsed} />
          </span>
          {!collapsed && <span className={navLabel(false)}>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconDashboard() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}

function IconEmulator() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  );
}

function IconSensors() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      {...ICON_PROPS}
      className="transition-transform duration-200"
      style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
