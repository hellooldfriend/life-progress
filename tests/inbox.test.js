/* Входящие: список без периода. Задача записана, но когда и куда — ещё не решено. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const INBOX = 'inbox';
const TODAY = '2026-08-29';

test('входящие — свой горизонт, а не период', () => {
  const { Store } = loadApp();
  assert.equal(Store.INBOX_KEY, INBOX);
  assert.equal(Store.keyHorizon(INBOX), 'inbox');
  assert.equal(Store.keyStart(INBOX), null, 'начала нет');
  assert.equal(Store.keyEnd(INBOX), null, 'конца тоже');
  assert.equal(Store.nextKey(INBOX), null, 'следующих входящих не бывает');
  assert.deepEqual(Store.children(INBOX), []);
  assert.equal(Store.periodLabel(INBOX), 'Входящие');
});

test('во входящие складываются обычные задачи, вместе с метками', () => {
  const { Store } = loadApp();
  const task = Store.addTask(INBOX, 'Посмотреть курс по финансам #финансы');

  assert.equal(task.text, 'Посмотреть курс по финансам');
  assert.equal(task.category, 'финансы');
  assert.deepEqual(Store.stats(INBOX), { done: 0, active: 1, cancelled: 0, total: 1 });
  assert.ok(Store.categories().includes('финансы'), 'метка из входящих видна в фильтрах');
});

test('разбор входящего назначает период и не считается переносом', () => {
  const { Store } = loadApp();
  const task = Store.addTask(INBOX, 'Записаться к врачу');
  const filed = Store.fileTask(INBOX, task.id, TODAY);

  assert.equal(filed.key, TODAY);
  assert.equal(Store.tasks(INBOX).length, 0, 'из входящих ушла');
  assert.deepEqual(Store.tasks(TODAY).map(t => t.text), ['Записаться к врачу']);
  assert.equal(filed.task.carryCount, 0, 'ей впервые нашли место, а не перенесли');
  assert.equal(filed.task.carriedFrom, null);
});

test('входящее можно отправить в любой горизонт', () => {
  const { Store } = loadApp();
  const day = Store.addTask(INBOX, 'День');
  const week = Store.addTask(INBOX, 'Неделя');
  const year = Store.addTask(INBOX, 'Год');

  assert.equal(Store.fileTask(INBOX, day.id, Store.periodKey('day', TODAY)).key, '2026-08-29');
  assert.equal(Store.fileTask(INBOX, week.id, Store.periodKey('week', TODAY)).key, '2026-W35');
  assert.equal(Store.fileTask(INBOX, year.id, Store.periodKey('year', TODAY)).key, '2026');
  assert.equal(Store.tasks(INBOX).length, 0);
});

test('разбор в никуда не срабатывает', () => {
  const { Store } = loadApp();
  const task = Store.addTask(INBOX, 'Идея');

  assert.equal(Store.fileTask(INBOX, task.id, 'мусор'), null);
  assert.equal(Store.fileTask(INBOX, task.id, INBOX), null, 'сам в себя не разбирается');
  assert.equal(Store.fileTask(INBOX, 'нет-такой', TODAY), null);
  assert.equal(Store.tasks(INBOX).length, 1, 'задача осталась на месте');
});

test('входящие не просрочены и не просят итогов — им нечему истечь', () => {
  const { Store, Insights } = loadApp();
  Store.addTask(INBOX, 'Лежит с прошлого года');
  Store.addTask('2026-08-20', 'Дела прошлой недели');

  assert.deepEqual(Insights.overdueItems(TODAY).map(i => i.task.text), ['Дела прошлой недели']);
  assert.equal(Insights.pendingRetros(TODAY).some(r => r.key === INBOX), false);
  assert.equal(Insights.periodsWithin('2026-08').includes(INBOX), false);
  assert.equal(Insights.hasActivity('2026-08'), true);
});

test('входящие переживают экспорт и импорт', () => {
  const first = loadApp();
  first.Store.addTask(INBOX, 'Идея на будущее');
  const backup = JSON.stringify(first.Store.get());

  const { Store } = loadApp();
  Store.replaceState(Store.parseImport(backup));
  assert.deepEqual(Store.tasks(INBOX).map(t => t.text), ['Идея на будущее']);
});

test('пустые входящие не хранятся', () => {
  const { Store } = loadApp();
  const task = Store.addTask(INBOX, 'Временная');
  Store.deleteTask(INBOX, task.id);
  assert.equal(Store.get().periods[INBOX], undefined);
});
