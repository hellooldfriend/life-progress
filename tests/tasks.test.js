/* Задачи и итоги: CRUD, прогресс, уборка пустых периодов. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, seedTasks } = require('./helpers/load');

const KEY = '2026-08-29';

test('addTask заводит задачу и возвращает её', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Купить матрас');

  assert.equal(task.text, 'Купить матрас');
  assert.equal(task.done, false);
  assert.equal(task.important, false);
  assert.ok(task.id);
  assert.deepEqual(Store.tasks(KEY).map(t => t.text), ['Купить матрас']);
});

test('addTask обрезает пробелы и отказывается от пустого текста', () => {
  const { Store } = loadApp();
  assert.equal(Store.addTask(KEY, '   Спортзал  ').text, 'Спортзал');
  assert.equal(Store.addTask(KEY, '   '), null);
  assert.equal(Store.tasks(KEY).length, 1);
});

test('задачу нельзя завести на ключ, который не является периодом', () => {
  const { Store } = loadApp();
  assert.equal(Store.addTask('когда-нибудь', 'Выучить испанский'), null);
  assert.equal(Store.get().periods['когда-нибудь'], undefined);
});

test('порядок задач сохраняется — список не пересобирается при отметках', () => {
  const { Store } = loadApp();
  seedTasks(Store, KEY, ['Первая', 'Вторая', 'Третья']);
  const second = Store.tasks(KEY)[1];
  Store.toggleTask(KEY, second.id);

  assert.deepEqual(Store.tasks(KEY).map(t => t.text), ['Первая', 'Вторая', 'Третья']);
});

test('toggleTask переключает выполнение и проставляет время закрытия', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Разобрать почту');

  const done = Store.toggleTask(KEY, task.id);
  assert.equal(done.done, true);
  assert.ok(done.doneAt, 'время закрытия проставлено');

  const undone = Store.toggleTask(KEY, task.id);
  assert.equal(undone.done, false);
  assert.equal(undone.doneAt, null, 'снятие галочки стирает время закрытия');
});

test('toggleImportant переключает важность', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Позвонить в сервис');
  assert.equal(Store.toggleImportant(KEY, task.id).important, true);
  assert.equal(Store.toggleImportant(KEY, task.id).important, false);
});

test('updateTask меняет текст, а пустой текст удаляет задачу', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Черновик');

  assert.equal(Store.updateTask(KEY, task.id, { text: '  Готовый текст ' }).text, 'Готовый текст');
  assert.equal(Store.updateTask(KEY, task.id, { text: '   ' }), null);
  assert.equal(Store.tasks(KEY).length, 0);
});

test('операции с несуществующей задачей ничего не ломают', () => {
  const { Store } = loadApp();
  Store.addTask(KEY, 'Единственная');

  assert.equal(Store.updateTask(KEY, 'нет-такой', { done: true }), null);
  assert.equal(Store.toggleTask(KEY, 'нет-такой'), null);
  assert.equal(Store.deleteTask(KEY, 'нет-такой'), false);
  assert.equal(Store.deleteTask('2026-01-01', 'нет-такой'), false);
  assert.equal(Store.tasks(KEY).length, 1);
});

test('stats считает прогресс периода', () => {
  const { Store } = loadApp();
  seedTasks(Store, KEY, ['Раз', { text: 'Два', done: true }, { text: 'Три', done: true }]);

  assert.deepEqual(Store.stats(KEY), { done: 2, active: 3, cancelled: 0, total: 3 });
  assert.deepEqual(Store.stats('2026-08-30'), { done: 0, active: 0, cancelled: 0, total: 0 },
    'пустой период не падает');
});

test('задачи разных горизонтов живут в своих периодах', () => {
  const { Store } = loadApp();
  Store.addTask('2026-08-29', 'День');
  Store.addTask('2026-W35', 'Неделя');
  Store.addTask('2026-08', 'Месяц');
  Store.addTask('2026-Q3', 'Квартал');
  Store.addTask('2026', 'Год');

  assert.deepEqual(Store.tasks('2026-08-29').map(t => t.text), ['День']);
  assert.deepEqual(Store.tasks('2026').map(t => t.text), ['Год']);
  assert.equal(Object.keys(Store.get().periods).length, 5);
});

test('итоги пишутся и переживают сохранение', () => {
  const { Store } = loadApp();
  Store.setSummary('2026-08', 'Август 2026: ездили на дачу, купили матрас.');

  assert.match(Store.summary('2026-08'), /купили матрас/);
  assert.equal(Store.summary('2026-09'), '', 'у периода без итогов — пустая строка');
});

test('период без задач и итогов не хранится', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'Временная');
  assert.ok(Store.get().periods[KEY]);

  Store.deleteTask(KEY, task.id);
  assert.equal(Store.get().periods[KEY], undefined, 'пустой период вычищен при сохранении');

  Store.setSummary('2026-08', 'важное');
  assert.ok(Store.get().periods['2026-08'], 'период с одними итогами остаётся');
});

test('подписчики onChange узнают об изменениях', () => {
  const { Store } = loadApp();
  let calls = 0;
  const off = Store.onChange(() => { calls++; });

  Store.addTask(KEY, 'Раз');
  assert.equal(calls, 1);

  off();
  Store.addTask(KEY, 'Два');
  assert.equal(calls, 1, 'после отписки не вызывается');
});
