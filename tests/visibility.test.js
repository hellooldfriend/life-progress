/* Видимость горизонтов: кто планирует неделями, кварталы прячет — задачи при этом никуда не деваются. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

test('по умолчанию видны все горизонты', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.visibleHorizons(), ['day', 'week', 'month', 'quarter', 'year', 'life']);
  assert.equal(Store.isVisible('quarter'), true);
});

test('горизонт прячется и возвращается', () => {
  const { Store } = loadApp();
  assert.equal(Store.setVisible('quarter', false), true);
  assert.equal(Store.isVisible('quarter'), false);
  assert.deepEqual(Store.visibleHorizons(), ['day', 'week', 'month', 'year', 'life']);
  assert.equal(Store.setVisible('quarter', true), true);
  assert.equal(Store.isVisible('quarter'), true);
  assert.equal(Store.setVisible('decade', false), false, 'чужой горизонт не принимается');
});

test('последний видимый горизонт спрятать нельзя', () => {
  const { Store } = loadApp();
  ['day', 'week', 'quarter', 'year', 'life'].forEach(h => Store.setVisible(h, false));
  assert.deepEqual(Store.visibleHorizons(), ['month']);
  assert.equal(Store.setVisible('month', false), false);
  assert.equal(Store.isVisible('month'), true, 'остался на месте');
});

test('задачи спрятанного горизонта остаются в данных и в просрочке', () => {
  const { Store, Insights } = loadApp();
  Store.addTask('2026-Q2', 'Цель квартала');
  Store.setVisible('quarter', false);
  assert.equal(Store.tasks('2026-Q2').length, 1);
  assert.deepEqual(Insights.overdueItems('2026-08-31').map(i => i.task.text), ['Цель квартала'],
    'спрятать вкладку — не значит забыть про задачу');
});

test('видимость переживает перезапуск, а мусор заменяется значениями по умолчанию', () => {
  const first = loadApp();
  first.Store.setVisible('day', false);
  const { Store } = loadApp({ 'doozy:v1': first.storage.getItem('doozy:v1') });
  assert.equal(Store.isVisible('day'), false);

  const junk = loadApp({ 'doozy:v1': JSON.stringify({ periods: {}, settings: { visible: { day: 'нет', week: 0 } } }) });
  assert.equal(junk.Store.isVisible('day'), true, 'не-булево игнорируется');
  assert.equal(junk.Store.isVisible('week'), true);

  const none = loadApp({ 'doozy:v1': JSON.stringify({ periods: {}, settings: {
    visible: { day: false, week: false, month: false, quarter: false, year: false, life: false } } }) });
  assert.deepEqual(none.Store.visibleHorizons(), ['day', 'week', 'month', 'quarter', 'year', 'life'],
    'всё скрыто — это тупик, сбрасываем');
});
