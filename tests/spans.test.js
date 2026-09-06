/* Окна: сколько периодов горизонта показывать рядом, чтобы видеть соседей. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

test('periodSpan набирает подряд идущие периоды', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.periodSpan('2026-09', 3), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(Store.periodSpan('2026-W35', 2), ['2026-W35', '2026-W36']);
  assert.deepEqual(Store.periodSpan('2026-Q4', 2), ['2026-Q4', '2027-Q1'], 'через границу года');
  assert.deepEqual(Store.periodSpan('2026-12', 2), ['2026-12', '2027-01']);
  assert.deepEqual(Store.periodSpan('2026', 3), ['2026', '2027', '2028']);
});

test('окно из одного периода — это сам период', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.periodSpan('2026-09', 1), ['2026-09']);
  assert.deepEqual(Store.periodSpan('2026-09', 0), ['2026-09'], 'ноль тоже даёт один');
});

test('у входящих соседей нет — окно не растёт', () => {
  const { Store } = loadApp();
  assert.deepEqual(Store.periodSpan('inbox', 3), ['inbox']);
});

test('ширина окна хранится по горизонтам и проверяется', () => {
  const { Store } = loadApp();
  assert.equal(Store.spanOf('month'), 1, 'по умолчанию один период');
  assert.equal(Store.spanOf('day'), 14, 'кроме агенды дней');

  assert.equal(Store.setSpan('month', 3), true);
  assert.equal(Store.spanOf('month'), 3);
  assert.equal(Store.spanOf('week'), 1, 'соседний горизонт не тронут');

  assert.equal(Store.setSpan('month', 5), false, '5 месяцев в списке нет');
  assert.equal(Store.setSpan('week', 'мусор'), false);
  assert.equal(Store.setSpan('никакой', 2), false);
  assert.equal(Store.spanOf('month'), 3, 'после отказа значение прежнее');
});

test('английские числительные: единственное и множественное', () => {
  const { Store } = loadApp();
  const days = n => Store.plural(n, 'day', 'days', 'days');
  assert.deepEqual([1, 2, 5, 11, 21].map(days), ['day', 'days', 'days', 'days', 'days'],
    '21 day — русская ловушка, в английском 21 days');

  assert.equal(Store.spanLabel('week', 1), '1 week');
  assert.equal(Store.spanLabel('week', 4), '4 weeks');
  assert.equal(Store.spanLabel('month', 3), '3 months');
  assert.equal(Store.spanLabel('year', 1), '1 year');
  assert.equal(Store.spanLabel('day', 30), '30 days');
});

test('заголовок окна схлопывает повторы', () => {
  const { Store } = loadApp();
  assert.equal(Store.spanTitle('2026-W35', '2026-W37'), 'Week 35 — 37', 'общее начало');
  assert.equal(Store.spanTitle('2026-09', '2026-11'), 'September — November 2026', 'общий год');
  assert.equal(Store.spanTitle('2026-Q3', '2026-Q4'), 'Q3 — Q4 2026', 'общий год у кварталов');
  assert.equal(Store.spanTitle('2026', '2028'), '2026 — 2028');
  assert.equal(Store.spanTitle('2026-12', '2027-02'), 'December 2026 — February 2027', 'разные годы — год дважды');
  assert.equal(Store.spanTitle('2026-09', '2026-09'), 'September 2026', 'окно в один период');
});
