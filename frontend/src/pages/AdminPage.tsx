import { useEffect, useRef, useState } from 'react';
import {
  createSensor,
  deleteSensor,
  fetchCatalog,
  fetchSensors,
  fetchTopics,
  SensorPreset,
  updateSensor,
} from '../api/sensors';
import { Sensor } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';

const UNIT_PRESETS = ['ADC', 'bool', 'count', 'dB', '°C', '%', 'Pa', 'lux', 'ppm', 'm/s²'];

const emptyForm = { topic: '', name: '', unit: '', description: '' };

export function AdminPage() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [catalog, setCatalog] = useState<SensorPreset[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [manualTopic, setManualTopic] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Sensor | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const topicRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    load();
    fetchCatalog().then(setCatalog).catch(() => setCatalog([]));
    fetchTopics().then(setTopics).catch(() => setTopics([]));
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

  // Пресеты из каталога, которые ещё не добавлены
  const availablePresets = catalog.filter(p => !sensors.some(s => s.topic === p.topic));

  function selectPreset(topic: string) {
    const preset = catalog.find(p => p.topic === topic);
    if (preset) {
      setForm({
        topic: preset.topic,
        name: preset.name,
        unit: preset.unit,
        description: preset.description,
      });
    }
  }

  // Доступные топики на сервисе, ещё не привязанные к датчику.
  // Текущий выбранный/редактируемый топик всегда оставляем в списке.
  const registeredTopics = new Set(sensors.map(s => s.topic));
  const freeTopics = topics.filter(t => !registeredTopics.has(t));
  const topicOptions =
    form.topic && !freeTopics.includes(form.topic) ? [form.topic, ...freeTopics] : freeTopics;

  // Выбор топика в select: подставляем метаданные из каталога в пустые поля
  function selectTopic(topic: string) {
    const preset = catalog.find(p => p.topic === topic);
    setForm(f => ({
      ...f,
      topic,
      name: f.name || (preset?.name ?? ''),
      unit: f.unit || (preset?.unit ?? ''),
      description: f.description || (preset?.description ?? ''),
    }));
  }

  function startEdit(sensor: Sensor) {
    setEditingId(sensor.id);
    setManualTopic(false);
    setForm({
      topic: sensor.topic,
      name: sensor.name,
      unit: sensor.unit,
      description: sensor.description ?? '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setManualTopic(false);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.topic.trim() || !form.name.trim() || !form.unit.trim()) {
      flash('Заполните topic, название и единицу измерения', 'err');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        topic: form.topic.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        description: form.description.trim() || undefined,
      };
      if (editingId) {
        await updateSensor(editingId, payload);
        flash('Датчик обновлён', 'ok');
      } else {
        await createSensor(payload);
        flash('Датчик добавлен', 'ok');
      }
      setForm(emptyForm);
      setEditingId(null);
      topicRef.current?.focus();
      await load();
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Ошибка', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    const sensor = confirmTarget;
    if (!sensor) return;
    setDeletingId(sensor.id);
    try {
      await deleteSensor(sensor.id);
      if (editingId === sensor.id) cancelEdit();
      await load();
      flash('Датчик удалён', 'ok');
      setConfirmTarget(null);
    } catch {
      flash('Не удалось удалить', 'err');
    } finally {
      setDeletingId(null);
    }
  }

  const isEditing = editingId !== null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg px-4 py-3 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 rounded-lg px-4 py-3 text-green-700 dark:text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Add / edit form */}
      <section>
        <h2 className="text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">
          {isEditing ? 'Изменить датчик' : 'Добавить датчик'}
        </h2>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4"
        >
          {/* Быстрый выбор из каталога (только при добавлении) */}
          {!isEditing && availablePresets.length > 0 && (
            <Field label="Выбрать из доступных датчиков">
              <select
                value=""
                onChange={e => selectPreset(e.target.value)}
                className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  — выберите датчик из каталога —
                </option>
                {availablePresets.map(p => (
                  <option key={p.topic} value={p.topic}>
                    {p.name} ({p.topic})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="MQTT Topic *">
              {manualTopic ? (
                <div className="flex gap-2">
                  <input
                    ref={topicRef}
                    value={form.topic}
                    onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                    placeholder="sensor/temperature/room1"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setManualTopic(false)}
                    title="Выбрать из списка"
                    className="shrink-0 px-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    ☰
                  </button>
                </div>
              ) : (
                <select
                  value={form.topic}
                  onChange={e => {
                    if (e.target.value === '__manual__') {
                      setManualTopic(true);
                      setForm(f => ({ ...f, topic: '' }));
                      return;
                    }
                    selectTopic(e.target.value);
                  }}
                  className={inputCls}
                >
                  <option value="" disabled>
                    — выберите топик с сервиса —
                  </option>
                  {topicOptions.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__manual__">✎ Ввести вручную…</option>
                </select>
              )}
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
                  className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 text-sm px-2 focus:outline-none focus:border-blue-500"
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

          <div className="flex justify-end gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="px-5 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Отмена
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting
                ? 'Сохранение...'
                : isEditing
                  ? 'Сохранить изменения'
                  : 'Добавить датчик'}
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
                className={`bg-white dark:bg-gray-800 border rounded-xl px-5 py-4 flex items-center justify-between gap-4 transition-colors ${
                  editingId === s.id
                    ? 'border-blue-500'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 dark:text-white font-medium truncate">{s.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                      {s.unit}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs font-mono mt-0.5 truncate">{s.topic}</p>
                  {s.description && (
                    <p className="text-gray-500 dark:text-gray-600 text-xs mt-1 truncate">{s.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(s)}
                    className="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => setConfirmTarget(s)}
                    disabled={deletingId === s.id}
                    className="px-3 py-1.5 text-xs text-red-500 dark:text-red-400 border border-red-300 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40 rounded-lg transition-colors"
                  >
                    {deletingId === s.id ? '...' : 'Удалить'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmTarget !== null}
        danger
        title="Удалить датчик?"
        message={
          confirmTarget
            ? `Датчик «${confirmTarget.name}» (${confirmTarget.topic}) будет удалён. История в InfluxDB сохранится.`
            : undefined
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        busy={deletingId !== null}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-gray-600 dark:text-gray-400 text-xs font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';
