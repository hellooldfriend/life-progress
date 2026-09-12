/* Персистентность: сохранение, разбор чужих данных, миграция с первой версии. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const KEY = 'doozy:v1';
const LEGACY_KEY = 'life-sprints/v1';
const PREVIOUS_KEY = 'life-progress:v1';

test('состояние переживает перезапуск приложения', () => {
  const first = loadApp();
  first.Store.addTask('2026-08-29', 'Купить матрас');
  first.Store.toggleTask('2026-08-29', first.Store.tasks('2026-08-29')[0].id);
  first.Store.setSummary('2026-08', 'Ездили на дачу.');
  first.Store.setSetting('horizon', 'month');
  first.Store.setSpan('month', 3);
  first.Store.setSpan('day', 30);

  const { Store } = loadApp({ [KEY]: first.storage.getItem(KEY) });

  assert.deepEqual(Store.stats('2026-08-29'), { done: 1, active: 1, cancelled: 0, total: 1 });
  assert.equal(Store.summary('2026-08'), 'Ездили на дачу.');
  assert.equal(Store.get().settings.horizon, 'month');
  assert.deepEqual(Store.get().settings.spans, { day: 30, week: 1, month: 3, quarter: 1, year: 1, life: 1 });
});

test('данные первой версии подхватываются со старого ключа', () => {
  const legacy = JSON.stringify({
    version: 1,
    ui: { view: 'quarter', range: 7 },
    periods: {
      '2026-08-29': { tasks: [{ id: 'a1', text: 'Купить матрас', done: true, important: true }], summary: '' },
      '2026-08': { tasks: [], summary: 'Август 2026: ездили на дачу.' },
    },
  });
  const { Store, storage } = loadApp({ [LEGACY_KEY]: legacy });

  assert.deepEqual(Store.tasks('2026-08-29').map(t => [t.text, t.done, t.important]),
    [['Купить матрас', true, true]]);
  assert.equal(Store.summary('2026-08'), 'Август 2026: ездили на дачу.');
  assert.equal(Store.get().settings.horizon, 'quarter', 'вкладка из ui.view перенесена в settings.horizon');
  assert.equal(Store.get().settings.spans.day, 7, 'старая настройка range стала окном дневного горизонта');
  assert.equal(Store.get().version, 3);
  assert.ok(storage.has(KEY), 'данные переписаны на актуальный ключ');
});

test('битые данные в localStorage не мешают приложению открыться', () => {
  const { Store } = loadApp({ [KEY]: '{это не json' });
  assert.deepEqual(Store.get().periods, {});
  assert.deepEqual(Store.get().settings, {
    horizon: 'overview', lang: 'en',
    spans: { day: 14, week: 1, month: 1, quarter: 1, year: 1, life: 1 },
    visible: { day: true, week: true, month: true, quarter: true, year: true, life: true },
  });
});

test('normalize отбрасывает мусор и оставляет пригодное', () => {
  const dirty = JSON.stringify({
    periods: {
      '2026-08-29': {
        tasks: [
          { text: 'Нормальная задача' },
          { text: '   ' },                       // пустой текст
          null,                                   // не объект
          { done: true },                         // без текста
        ],
        summary: 42,                              // не строка
      },
      'не-период': { tasks: [{ text: 'Задача в никуда' }] },
      '2026-13': { tasks: [{ text: 'Тринадцатый месяц' }] },
      '2026-09': { tasks: [], summary: '   ' },   // пусто — не храним
    },
    settings: { horizon: 'week', spans: { month: 3, week: 999, year: 'мусор' } },
  });
  const { Store } = loadApp({ [KEY]: dirty });

  assert.deepEqual(Object.keys(Store.get().periods), ['2026-08-29']);
  assert.deepEqual(Store.tasks('2026-08-29').map(t => t.text), ['Нормальная задача']);
  assert.equal(Store.summary('2026-08-29'), '');
  assert.equal(Store.get().settings.horizon, 'week');
  assert.equal(Store.get().settings.spans.month, 3, 'пригодное окно сохранено');
  assert.equal(Store.get().settings.spans.week, 1, 'недопустимое заменено значением по умолчанию');
  assert.equal(Store.get().settings.spans.year, 1);
});

test('у задач без id появляется свой id', () => {
  const raw = JSON.stringify({ periods: { '2026-08-29': { tasks: [{ text: 'Раз' }, { text: 'Два' }] } } });
  const { Store } = loadApp({ [KEY]: raw });
  const ids = Store.tasks('2026-08-29').map(t => t.id);

  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, 2, 'id не совпадают');
});

test('parseImport принимает свой бэкап и отвергает чужой файл', () => {
  const { Store } = loadApp();
  Store.addTask('2026-08-29', 'Купить матрас');
  const backup = JSON.stringify(Store.get());

  const parsed = Store.parseImport(backup);
  assert.deepEqual(parsed.periods['2026-08-29'].tasks.map(t => t.text), ['Купить матрас']);

  assert.throws(() => Store.parseImport('{"tasks":[]}'), /does not look like/);
  assert.throws(() => Store.parseImport('[]'), /does not look like/);
  assert.throws(() => Store.parseImport('не json'), SyntaxError);
});

test('replaceState заменяет данные целиком и сохраняет их', () => {
  const { Store, storage } = loadApp();
  Store.addTask('2026-08-29', 'Старое');

  Store.replaceState(Store.parseImport(JSON.stringify({
    periods: { '2026-09-01': { tasks: [{ text: 'Новое' }], summary: '' } },
  })));

  assert.equal(Store.tasks('2026-08-29').length, 0);
  assert.deepEqual(Store.tasks('2026-09-01').map(t => t.text), ['Новое']);
  assert.match(storage.getItem(KEY), /Новое/);
});

test('данные с ключа предыдущего имени приложения подхватываются', () => {
  const previous = JSON.stringify({
    version: 3,
    settings: { horizon: 'month', lang: 'ru', spans: { day: 7, week: 1, month: 3, quarter: 1, year: 1 } },
    periods: { '2026-09': { tasks: [{ id: 'p1', text: 'Переехало с life-progress' }], summary: '' } },
  });
  const { Store, storage } = loadApp({ [PREVIOUS_KEY]: previous });

  assert.deepEqual(Store.tasks('2026-09').map(t => t.text), ['Переехало с life-progress']);
  assert.equal(Store.get().settings.lang, 'ru');
  assert.equal(Store.get().settings.spans.month, 3);
  assert.ok(storage.has(KEY), 'переписано на новый ключ');
});

test('при нескольких старых ключах побеждает самый свежий', () => {
  const older = JSON.stringify({ periods: { '2026-01': { tasks: [{ text: 'из life-sprints' }] } } });
  const newer = JSON.stringify({ periods: { '2026-02': { tasks: [{ text: 'из life-progress' }] } } });
  const { Store } = loadApp({ [LEGACY_KEY]: older, [PREVIOUS_KEY]: newer });
  assert.equal(Store.tasks('2026-02').length, 1, 'life-progress новее life-sprints');
  assert.equal(Store.tasks('2026-01').length, 0);
});
