/* «Жизнь»: цели без срока. Не входящие — это решённое, а не сырьё; и не период — границ нет. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const LIFE = 'life';
const TODAY = '2026-09-12';

test('жизнь — горизонт без границ', () => {
  const { Store } = loadApp();
  assert.equal(Store.LIFE_KEY, LIFE);
  assert.equal(Store.keyHorizon(LIFE), 'life');
  assert.equal(Store.periodKey('life', TODAY), LIFE, 'в любой день ключ один и тот же');
  assert.equal(Store.keyStart(LIFE), null);
  assert.equal(Store.keyEnd(LIFE), null);
  assert.equal(Store.nextKey(LIFE), null, 'следующей жизни нет — переносить некуда');
  assert.deepEqual(Store.children(LIFE), []);
  assert.deepEqual(Store.periodSpan(LIFE, 3), [LIFE], 'окно не растёт');
  assert.equal(Store.periodLabel(LIFE), 'Life');
  assert.ok(Store.HORIZONS.includes('life'), 'полноценный горизонт, а не особый случай');
});

test('цель без срока живёт годами и не считается просроченной', () => {
  const { Store, Insights } = loadApp();
  Store.addTask(LIFE, 'Earn 30 million');
  Store.addTask('2025', 'Дела прошлого года');

  assert.deepEqual(Insights.overdueItems(TODAY).map(i => i.task.text), ['Дела прошлого года'],
    'у жизни нет конца, значит нечему истечь');
  assert.equal(Insights.pendingRetros(TODAY).some(r => r.key === LIFE), false, 'итоги жизни не просятся');
  assert.deepEqual(Store.stats(LIFE), { done: 0, active: 1, cancelled: 0, total: 1 });
});

test('жизнь стоит в вертикальном срезе последней и её можно спрятать', () => {
  const { Store, Insights } = loadApp();
  const keys = Insights.verticalKeys(TODAY);
  assert.deepEqual(keys[keys.length - 1], { horizon: 'life', key: LIFE });

  assert.equal(Store.setVisible('life', false), true);
  assert.equal(Store.visibleHorizons().includes('life'), false);
  assert.equal(Store.tasks(LIFE).length, 0);
  Store.addTask(LIFE, 'Осталась в данных');
  assert.equal(Store.tasks(LIFE).length, 1, 'скрытая вкладка не трогает задачи');
});

test('цель жизни — первый кандидат в родители для годовой цели', () => {
  const { Store } = loadApp();
  Store.addTask('2026-09-12', 'День');
  Store.addTask('2026', 'Год');
  const life = Store.addTask(LIFE, 'Earn 30 million');
  Store.addTask('2026-Q4', 'Квартал');

  assert.deepEqual(Store.goalCandidates().map(c => c.task.text), ['Earn 30 million', 'Год', 'Квартал', 'День'],
    'от крупного горизонта к мелкому, жизнь крупнее года');

  const yearly = Store.addTask('2026', 'Накопить первые 5 млн');
  Store.setParent('2026', yearly.id, life.id);
  assert.deepEqual(Store.subtasks(life.id).map(s => s.key), ['2026']);
  assert.deepEqual(Store.subtaskStats(life.id), { done: 0, active: 1, cancelled: 0, total: 1 });
});

test('старые настройки без жизни получают её включённой', () => {
  const { Store } = loadApp({ 'doozy:v1': JSON.stringify({ periods: {}, settings: {
    spans: { day: 7, week: 1, month: 1, quarter: 1, year: 1 },
    visible: { day: true, week: true, month: true, quarter: false, year: true },
  } }) });
  assert.equal(Store.isVisible('life'), true);
  assert.equal(Store.isVisible('quarter'), false, 'остальные настройки не тронуты');
  assert.equal(Store.spanOf('life'), 1);
});

test('в словаре жизнь есть на обоих языках', () => {
  const { Store, I18N } = loadApp();
  assert.equal(I18N.t('tab.life'), 'Life');
  Store.setLang('ru');
  assert.equal(Store.periodLabel(LIFE), 'Жизнь');
  assert.equal(Store.periodSub(LIFE), 'цели на годы вперёд — без срока');
  assert.equal(I18N.t('summary.life'), 'Заметки');
});
