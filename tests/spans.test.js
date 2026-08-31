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

test('склонение числительных', () => {
  const { Store } = loadApp();
  const days = n => Store.plural(n, 'день', 'дня', 'дней');
  assert.deepEqual([1, 2, 5, 11, 14, 21, 22, 30].map(days),
    ['день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней']);

  assert.equal(Store.spanLabel('week', 1), '1 неделя');
  assert.equal(Store.spanLabel('week', 2), '2 недели');
  assert.equal(Store.spanLabel('week', 4), '4 недели');
  assert.equal(Store.spanLabel('month', 3), '3 месяца');
  assert.equal(Store.spanLabel('quarter', 4), '4 квартала');
  assert.equal(Store.spanLabel('year', 2), '2 года');
  assert.equal(Store.spanLabel('year', 5), '5 лет');
  assert.equal(Store.spanLabel('day', 30), '30 дней');
});

test('заголовок окна схлопывает повторы', () => {
  const { Store } = loadApp();
  assert.equal(Store.spanTitle('2026-W35', '2026-W37'), 'Неделя 35 — 37', 'общее начало');
  assert.equal(Store.spanTitle('2026-09', '2026-11'), 'Сентябрь — Ноябрь 2026', 'общий год');
  assert.equal(Store.spanTitle('2026-Q3', '2026-Q4'), 'III — IV квартал 2026', 'общий хвост в два слова');
  assert.equal(Store.spanTitle('2026', '2028'), '2026 — 2028');
  assert.equal(Store.spanTitle('2026-12', '2027-02'), 'Декабрь 2026 — Февраль 2027', 'разные годы — год дважды');
  assert.equal(Store.spanTitle('2026-09', '2026-09'), 'Сентябрь 2026', 'окно в один период');
});
