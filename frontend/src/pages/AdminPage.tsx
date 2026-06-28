import { useEffect, useRef, useState } from 'react';
import { createSensor, deleteSensor, fetchSensors } from '../api/sensors';
import { Sensor } from '../types';

const UNIT_PRESETS = ['ADC', 'bool', '°C', '%', 'Pa', 'lux', 'ppm', 'm/s²'];

const emptyForm = { topic: '', name: '', unit: '', description: '' };

export function AdminPage() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const topicRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setSensors(await fetchSensors());
    } catch {
      setError('Не удалось загрузить датчики');
    }
  }

  function flash(msg: string, type: 'ok' | 'err') {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
    else { setError(msg); setTimeout(() => setError(''), 4000); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.topic.trim() || !form.name.trim() || !form.unit.trim()) {
      flash('Заполните topic, название и единицу измерения', 'err');
      return;
    }
    setSubmitting(true);
    try {
      await createSensor({
        topic: form.topic.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        description: form.description.trim() || undefined,
      });
      setForm(emptyForm);
      topicRef.current?.focus();
      await load();
      flash('Датчик добавлен', 'ok');
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Ошибка', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(sensor: Sensor) {
    if (!confirm(`Удалить датчик "${sensor.name}"?`)) return;
    setDeletingId(sensor.id);
    try {
      await deleteSensor(sensor.id);
      await load();
      flash('Датчик удалён', 'ok');
    } catch {
      flash('Не удалось удалить', 'err');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-800 rounded-lg px-4 py-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Add form */}
      <section>
        <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
          Добавить датчик
        </h2>
        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="MQTT Topic *">
              <input
                ref={topicRef}
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="sensor/temperature/room1"
                className={inputCls}
              />
            </Field>
            <Field label="Название *">
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Температура в комнате"
                className={inputCls}
              />
            </Field>
            <Field label="Единица измерения *">
              <div className="flex gap-2">
                <input
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="°C"
                  className={inputCls}
                />
                <select
                  value=""
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm px-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>пресет</option>
                  {UNIT_PRESETS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Описание">
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Необязательно"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? 'Сохранение...' : 'Добавить датчик'}
            </button>
          </div>
        </form>
      </section>

      {/* Sensor list */}
      <section>
        <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
          Датчики ({sensors.length})
        </h2>
        {sensors.length === 0 ? (
          <p className="text-gray-600 text-sm">Нет датчиков</p>
        ) : (
          <ul className="space-y-2">
            {sensors.map(s => (
              <li
                key={s.id}
                className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                      {s.unit}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs font-mono mt-0.5 truncate">{s.topic}</p>
                  {s.description && (
                    <p className="text-gray-600 text-xs mt-1 truncate">{s.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                  className="flex-shrink-0 px-3 py-1.5 text-xs text-red-400 border border-red-900 hover:bg-red-900/30 disabled:opacity-40 rounded-lg transition-colors"
                >
                  {deletingId === s.id ? '...' : 'Удалить'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-gray-400 text-xs font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';
