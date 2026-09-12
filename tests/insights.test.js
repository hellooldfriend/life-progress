/* Выборки дашборда: что показывать в «Сейчас» и что требует решения. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const TODAY = '2026-08-29';   // суббота, неделя 35, III квартал
const textsOf = list => list.map(i => i.task.text);

test('вертикальный срез даёт по одному ключу на горизонт', () => {
  const { Insights } = loadApp();
  assert.deepEqual(Insights.verticalKeys(TODAY), [
    { horizon: 'day',     key: '2026-08-29' },
    { horizon: 'week',    key: '2026-W35' },
    { horizon: 'month',   key: '2026-08' },
    { horizon: 'quarter', key: '2026-Q3' },
    { horizon: 'year',    key: '2026' },
    { horizon: 'life',    key: 'life' },
  ]);
});

/* ───────────── Просрочка ───────────── */

test('в просрочку попадают только незакрытые задачи закончившихся периодов', () => {
  const { Store, Insights } = loadApp();
  const old = Store.addTask('2026-08-27', 'Позвонить в сервис');
  const closed = Store.addTask('2026-08-27', 'Уже сделал');
  const dropped = Store.addTask('2026-08-27', 'Передумал');
  Store.toggleTask('2026-08-27', closed.id);
  Store.toggleCancelled('2026-08-27', dropped.id);
  Store.addTask(TODAY, 'Сегодняшняя');
  Store.addTask('2026-09-01', 'Будущая');

  const overdue = Insights.overdueItems(TODAY);
  assert.deepEqual(textsOf(overdue), ['Позвонить в сервис']);
  assert.equal(overdue[0].task.id, old.id);
  assert.equal(overdue[0].ageDays, 2, 'период кончился два дня назад');
});

test('сегодняшний день не просрочен, вчерашний — да', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-08-28', 'Вчера');
  Store.addTask(TODAY, 'Сегодня');

  assert.deepEqual(textsOf(Insights.overdueItems(TODAY)), ['Вчера']);
});

test('просрочка ловит любой горизонт, не только дни', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-08-24', 'День');       // прошлый понедельник
  Store.addTask('2026-W34', 'Неделя');       // прошлая неделя
  Store.addTask('2026-07', 'Месяц');         // прошлый месяц
  Store.addTask('2026-Q2', 'Квартал');
  Store.addTask('2025', 'Год');
  Store.addTask('2026-W35', 'Текущая неделя');
  Store.addTask('2026', 'Текущий год');

  const overdue = Insights.overdueItems(TODAY);
  assert.deepEqual(textsOf(overdue), ['Год', 'Квартал', 'Месяц', 'Неделя', 'День'],
    'сначала самые старые');
  assert.deepEqual(overdue.map(i => i.horizon), ['year', 'quarter', 'month', 'week', 'day']);
});

/* ───────────── Залипшие ───────────── */

test('залипшими считаются задачи, переехавшие дважды и больше', () => {
  const { Store, Insights } = loadApp();
  const fresh = Store.addTask(TODAY, 'Свежая');
  const once = Store.addTask('2026-08-28', 'Переехала раз');
  const twice = Store.addTask('2026-08-27', 'Переехала дважды');
  Store.carryTask('2026-08-28', once.id);                       // → 29-е, carryCount 1
  Store.carryTask('2026-08-27', twice.id);                      // → 28-е
  Store.carryTask('2026-08-28', twice.id);                      // → 29-е, carryCount 2

  const stuck = Insights.stuckItems(undefined, TODAY);
  assert.deepEqual(textsOf(stuck), ['Переехала дважды']);
  assert.equal(stuck[0].carryCount, 2);
  assert.ok(fresh && once);
});

test('закрытая или снятая задача залипшей не считается', () => {
  const { Store, Insights } = loadApp();
  const task = Store.addTask('2026-08-26', 'Ремонт крыши');
  Store.carryTask('2026-08-26', task.id);
  Store.carryTask('2026-08-27', task.id);
  assert.equal(Insights.stuckItems(undefined, TODAY).length, 1);

  Store.toggleCancelled('2026-08-28', task.id);
  assert.equal(Insights.stuckItems(undefined, TODAY).length, 0, 'снятая уже не требует решения');
});

test('одна задача не показывается дважды — просрочка важнее залипания', () => {
  const { Store, Insights } = loadApp();
  const task = Store.addTask('2026-08-25', 'Ремонт крыши');
  Store.carryTask('2026-08-25', task.id);
  Store.carryTask('2026-08-26', task.id);   // осела в 27-м, carryCount 2, период прошёл

  const { overdue, stuck, total } = Insights.attention(TODAY);
  assert.deepEqual(textsOf(overdue), ['Ремонт крыши']);
  assert.deepEqual(stuck, []);
  assert.equal(total, 1);
});

/* ───────────── Ненаписанные итоги ───────────── */

test('напоминание про итоги приходит только по последнему периоду и только если в нём что-то было', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-08-20', 'Что-то делал в августе');   // активность в прошлой неделе и месяце

  const retros = Insights.pendingRetros(TODAY);
  const keys = retros.map(r => r.key);
  assert.ok(keys.includes('2026-W34'), 'прошлая неделя');
  assert.ok(keys.includes('2026-08') === false, 'август ещё не кончился');
  assert.ok(keys.includes('2026-07') === false, 'позапрошлый месяц не трогаем');
  assert.deepEqual(retros.map(r => r.horizon), ['week']);
});

test('написанные итоги напоминание снимают', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-08-20', 'Дела прошлой недели');
  assert.equal(Insights.pendingRetros(TODAY).length, 1);

  Store.setSummary('2026-W34', 'Неделя вышла спокойной.');
  assert.equal(Insights.pendingRetros(TODAY).length, 0);
});

test('пустые периоды не напоминают о себе', () => {
  const { Store, Insights } = loadApp();
  Store.addTask(TODAY, 'Только сегодня');
  assert.deepEqual(Insights.pendingRetros(TODAY), [], 'в прошлом ничего не было — не о чем писать');
});

test('итоги месяца, квартала и года просятся, когда период кончился с активностью', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2025-12-30', 'Дела прошлого года');
  const keys = Insights.pendingRetros('2026-01-05').map(r => r.key);

  assert.deepEqual(keys, ['2026-W01', '2025-12', '2025-Q4', '2025'],
    'прошлая неделя, декабрь, IV квартал и весь 2025-й');
});

test('periodsWithin собирает вложенные периоды', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-08-05', 'День августа');
  Store.addTask('2026-W32', 'Неделя августа');
  Store.addTask('2026-08', 'Месяц');
  Store.addTask('2026-09-01', 'Сентябрь');

  const within = Insights.periodsWithin('2026-08').sort();
  assert.deepEqual(within, ['2026-08', '2026-08-05', '2026-W32']);
  assert.equal(Insights.hasActivity('2026-08'), true);
  assert.equal(Insights.hasActivity('2026-10'), false);
});

test('на чистом состоянии дашборду показывать нечего', () => {
  const { Insights } = loadApp();
  assert.deepEqual(Insights.attention(TODAY), { overdue: [], stuck: [], retros: [], total: 0 });
});
