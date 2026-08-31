/* Метки: задаются прямо в тексте, живут на задаче, собираются в список фильтров. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const KEY = '2026-08-29';

test('parseTaskInput отделяет метку от текста', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.parseTaskInput('купить билеты #работа'), { text: 'купить билеты', category: 'работа' });
  assert.deepEqual(Store.parseTaskInput('#жизнь сходить к врачу'), { text: 'сходить к врачу', category: 'жизнь' });
  assert.deepEqual(Store.parseTaskInput('позвонить #работа в сервис'), { text: 'позвонить в сервис', category: 'работа' });
  assert.deepEqual(Store.parseTaskInput('просто задача'), { text: 'просто задача', category: '' });
});

test('метка приводится к нижнему регистру, вторая игнорируется', () => {
  const { Store } = loadApp();
  assert.equal(Store.parseTaskInput('отчёт #Работа').category, 'работа');
  assert.equal(Store.parseTaskInput('отчёт #работа #жизнь').category, 'работа', 'берём первую');
  assert.equal(Store.parseTaskInput('отчёт #работа #жизнь').text, 'отчёт #жизнь', 'вторая остаётся текстом');
});

test('решётка внутри слова меткой не считается', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.parseTaskInput('задача C#'), { text: 'задача C#', category: '' });
  assert.deepEqual(Store.parseTaskInput('дом №5'), { text: 'дом №5', category: '' });
});

test('одна метка без текста задачей не становится', () => {
  const { Store } = loadApp();
  assert.equal(Store.parseTaskInput('#работа').text, '');
  assert.equal(Store.addTask(KEY, '#работа'), null);
});

test('addTask ставит метку из текста и метку по умолчанию', () => {
  const { Store } = loadApp();
  assert.equal(Store.addTask(KEY, 'отчёт #работа').category, 'работа');
  assert.equal(Store.addTask(KEY, 'погулять', 'жизнь').category, 'жизнь', 'метка активного фильтра');
  assert.equal(Store.addTask(KEY, 'отчёт #работа', 'жизнь').category, 'работа', 'явная метка сильнее фильтра');
  assert.equal(Store.addTask(KEY, 'без метки').category, '');
});

test('правка текста добавляет и снимает метку', () => {
  const { Store } = loadApp();
  const task = Store.addTask(KEY, 'отчёт #работа');

  assert.equal(Store.updateTask(KEY, task.id, { text: 'отчёт #жизнь' }).category, 'жизнь');
  assert.equal(Store.updateTask(KEY, task.id, { text: 'отчёт' }).category, '', 'убрали метку из строки — снялась');
});

test('taskInputValue возвращает строку для поля правки', () => {
  const { Store } = loadApp();
  const withTag = Store.addTask(KEY, 'отчёт #работа');
  const plain = Store.addTask(KEY, 'погулять');

  assert.equal(Store.taskInputValue(withTag), 'отчёт #работа');
  assert.equal(Store.taskInputValue(plain), 'погулять');
  // круговой обход: то, что показали в поле, разбирается обратно в ту же задачу
  const parsed = Store.parseTaskInput(Store.taskInputValue(withTag));
  assert.deepEqual(parsed, { text: withTag.text, category: withTag.category });
});

test('categories собирает метки со всех периодов и сортирует', () => {
  const { Store } = loadApp();
  Store.addTask('2026-08-29', 'отчёт #работа');
  Store.addTask('2026-W35', 'спорт #жизнь');
  Store.addTask('2026-08', 'бюджет #жизнь');
  Store.addTask('2026', 'без метки');

  assert.deepEqual(Store.categories(), ['жизнь', 'работа']);
});

test('фильтр по метке сужает и список, и прогресс', () => {
  const { Store } = loadApp();
  Store.addTask(KEY, 'отчёт #работа');
  Store.addTask(KEY, 'созвон #работа');
  Store.addTask(KEY, 'спорт #жизнь');
  Store.toggleTask(KEY, Store.tasks(KEY)[0].id);

  assert.deepEqual(Store.stats(KEY), { done: 1, active: 3, cancelled: 0, total: 3 });
  assert.deepEqual(Store.stats(KEY, 'работа'), { done: 1, active: 2, cancelled: 0, total: 2 });
  assert.deepEqual(Store.stats(KEY, 'жизнь'), { done: 0, active: 1, cancelled: 0, total: 1 });
  assert.deepEqual(Store.orderedTasks(KEY, 'жизнь').map(t => t.text), ['спорт']);
});
