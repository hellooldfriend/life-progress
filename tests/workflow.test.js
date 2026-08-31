/* Жизненный цикл задачи: отмена, порядок показа, ручная сортировка, перенос. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, seedTasks } = require('./helpers/load');

const KEY = '2026-08-29';
const texts = list => list.map(t => t.text);

/* ───────────── Отмена ───────────── */

test('отменённая задача остаётся видимой, но уходит из прогресса', () => {
  const { Store } = loadApp();
  const [, second] = seedTasks(Store, KEY, ['Отчёт', 'Ремонт крыши', 'Спорт']);
  Store.toggleCancelled(KEY, second.id);

  assert.equal(Store.taskById(KEY, second.id).cancelled, true);
  assert.ok(Store.taskById(KEY, second.id).cancelledAt, 'время отмены проставлено');
  assert.equal(Store.tasks(KEY).length, 3, 'из периода не исчезла');
  assert.deepEqual(Store.stats(KEY), { done: 0, active: 2, cancelled: 1, total: 3 });
});

test('отмена и выполнение гасят друг друга', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Спорный пункт');

  Store.toggleTask(KEY, task.id);
  const cancelled = Store.updateTask(KEY, task.id, { cancelled: true });
  assert.equal(cancelled.done, false, 'отмена снимает галочку');
  assert.equal(cancelled.doneAt, null);

  const done = Store.updateTask(KEY, task.id, { done: true });
  assert.equal(done.cancelled, false, 'выполнение снимает отмену');
  assert.equal(done.cancelledAt, null);
});

test('отменённые не считаются выполненными даже в битых данных', () => {
  const { Store } = loadApp({
    'life-progress:v1': JSON.stringify({
      periods: { [KEY]: { tasks: [{ text: 'И то и другое', done: true, cancelled: true }] } },
    }),
  });
  const task = Store.tasks(KEY)[0];
  assert.equal(task.done, true);
  assert.equal(task.cancelled, false, 'закрытие сильнее отмены');
});

/* ───────────── Порядок показа ───────────── */

test('выполненные уезжают вниз, отменённые — в самый низ', () => {
  const { Store } = loadApp();
  const [first, , third, fourth] = seedTasks(Store, KEY, ['Раз', 'Два', 'Три', 'Четыре']);
  Store.toggleTask(KEY, first.id);
  Store.toggleCancelled(KEY, third.id);

  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Два', 'Четыре', 'Раз', 'Три']);
  assert.deepEqual(texts(Store.tasks(KEY)), ['Раз', 'Два', 'Три', 'Четыре'], 'ручной порядок не тронут');
  assert.equal(fourth.text, 'Четыре');
});

test('снятая галочка возвращает задачу на своё место', () => {
  const { Store } = loadApp();
  const [first] = seedTasks(Store, KEY, ['Раз', 'Два', 'Три']);

  Store.toggleTask(KEY, first.id);
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Два', 'Три', 'Раз']);

  Store.toggleTask(KEY, first.id);
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Раз', 'Два', 'Три'], 'вернулась в начало, а не в конец');
});

/* ───────────── Ручной порядок ───────────── */

test('moveTask двигает задачу вверх и вниз', () => {
  const { Store } = loadApp();
  const [, second] = seedTasks(Store, KEY, ['Раз', 'Два', 'Три']);

  assert.equal(Store.moveTask(KEY, second.id, -1), true);
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Два', 'Раз', 'Три']);

  assert.equal(Store.moveTask(KEY, second.id, 1), true);
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Раз', 'Два', 'Три']);
});

test('moveTask упирается в границы списка', () => {
  const { Store } = loadApp();
  const [first, , third] = seedTasks(Store, KEY, ['Раз', 'Два', 'Три']);

  assert.equal(Store.moveTask(KEY, first.id, -1), false);
  assert.equal(Store.moveTask(KEY, third.id, 1), false);
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Раз', 'Два', 'Три']);
});

test('задача не ныряет под выполненные — там своя группа', () => {
  const { Store } = loadApp();
  const [first, second] = seedTasks(Store, KEY, ['Раз', 'Два', 'Три']);
  Store.toggleTask(KEY, first.id);       // «Раз» уехал вниз, наверху остались «Два» и «Три»

  assert.equal(Store.moveTask(KEY, second.id, -1), false, '«Два» уже первый среди активных');
  const third = Store.orderedTasks(KEY)[1];
  assert.equal(Store.moveTask(KEY, third.id, 1), false, 'ниже только закрытая задача');
  assert.deepEqual(texts(Store.orderedTasks(KEY)), ['Два', 'Три', 'Раз']);
});

test('moveTask переживает несуществующую задачу и пустой период', () => {
  const { Store } = loadApp();
  Store.addTask(KEY, 'Единственная');
  assert.equal(Store.moveTask(KEY, 'нет-такой', 1), false);
  assert.equal(Store.moveTask('2026-09-09', 'нет-такой', 1), false);
});

/* ───────────── Перенос ───────────── */

test('nextKey знает следующий период каждого горизонта', () => {
  const { Store } = loadApp();
  assert.equal(Store.nextKey('2026-08-29'), '2026-08-30');
  assert.equal(Store.nextKey('2026-08-31'), '2026-09-01');
  assert.equal(Store.nextKey('2026-W35'), '2026-W36');
  assert.equal(Store.nextKey('2026-W53'), '2027-W01', 'через границу года');
  assert.equal(Store.nextKey('2026-08'), '2026-09');
  assert.equal(Store.nextKey('2026-12'), '2027-01');
  assert.equal(Store.nextKey('2026-Q4'), '2027-Q1');
  assert.equal(Store.nextKey('2026'), '2027');
  assert.equal(Store.nextKey('мусор'), null);
});

test('перенос уносит задачу в следующий период и помнит откуда', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Позвонить в сервис #работа');
  const moved = Store.carryTask(KEY, task.id);

  assert.equal(moved.key, '2026-08-30');
  assert.equal(Store.tasks(KEY).length, 0, 'копии в исходном дне не осталось');
  assert.deepEqual(texts(Store.tasks('2026-08-30')), ['Позвонить в сервис']);
  assert.equal(moved.task.category, 'работа', 'метка едет с задачей');
  assert.equal(moved.task.carryCount, 1);
  assert.deepEqual(moved.task.carriedFrom, { key: KEY, label: '29 августа' });
});

test('повторные переносы копятся в счётчике', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Ремонт крыши');

  const first = Store.carryTask(KEY, task.id);
  const second = Store.carryTask(first.key, task.id);
  const third = Store.carryTask(second.key, task.id);

  assert.equal(third.key, '2026-09-01');
  assert.equal(third.task.carryCount, 3);
  assert.equal(third.task.carriedFrom.label, '31 августа', 'помнит последний переезд');
});

test('перенос снимает отмену, но выполненную задачу не трогает', () => {
  const { Store } = loadApp();
  const cancelled = Store.addTask(KEY, 'Передумал, но нужно');
  Store.toggleCancelled(KEY, cancelled.id);
  assert.equal(Store.carryTask(KEY, cancelled.id).task.cancelled, false);

  const done = Store.addTask(KEY, 'Уже сделано');
  Store.toggleTask(KEY, done.id);
  assert.equal(Store.carryTask(KEY, done.id), null, 'закрытую задачу переносить некуда');
  assert.equal(Store.tasks(KEY).length, 1);
});

test('перенос недели ведёт в неделю, а не в тот же день', () => {
  const { Store } = loadApp();
  const task = Store.addTask('2026-W35', 'Закрыть спринт');
  const moved = Store.carryTask('2026-W35', task.id);

  assert.equal(moved.key, '2026-W36');
  assert.equal(moved.task.carriedFrom.label, 'Неделя 35');
});
