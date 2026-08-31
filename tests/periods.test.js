/* Ключи периодов: горизонт кодируется формой ключа, из ключа восстанавливаются границы. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const { Store } = loadApp();

test('periodKey строит ключ каждого горизонта', () => {
  assert.equal(Store.periodKey('day', '2026-08-29'), '2026-08-29');
  assert.equal(Store.periodKey('week', '2026-08-29'), '2026-W35');
  assert.equal(Store.periodKey('month', '2026-08-29'), '2026-08');
  assert.equal(Store.periodKey('quarter', '2026-08-29'), '2026-Q3');
  assert.equal(Store.periodKey('year', '2026-08-29'), '2026');
});

test('periodKey принимает Date наравне с ISO-строкой', () => {
  assert.equal(Store.periodKey('month', new Date(2026, 7, 29)), '2026-08');
});

test('ISO-неделя принадлежит году своего четверга', () => {
  // 1 января 2026 — четверг, значит неделя с 29 декабря 2025 уже первая неделя 2026
  assert.equal(Store.periodKey('week', '2025-12-29'), '2026-W01');
  assert.equal(Store.periodKey('week', '2026-01-01'), '2026-W01');
  // 2026 год начинается с четверга — в нём 53 недели, и 3 января 2027 ещё в нём
  assert.equal(Store.periodKey('week', '2026-12-31'), '2026-W53');
  assert.equal(Store.periodKey('week', '2027-01-03'), '2026-W53');
  assert.equal(Store.periodKey('week', '2027-01-04'), '2027-W01');
  // 2021 год начинается с пятницы — первые дни принадлежат 53-й неделе 2020-го
  assert.equal(Store.periodKey('week', '2021-01-01'), '2020-W53');
});

test('номер недели дополняется нулём — ключи сортируются как строки', () => {
  assert.equal(Store.periodKey('week', '2026-03-02'), '2026-W10');
  assert.equal(Store.periodKey('week', '2026-02-23'), '2026-W09');
  assert.ok('2026-W09' < '2026-W10');
});

test('квартал переключается на границе месяцев', () => {
  assert.equal(Store.periodKey('quarter', '2026-03-31'), '2026-Q1');
  assert.equal(Store.periodKey('quarter', '2026-04-01'), '2026-Q2');
  assert.equal(Store.periodKey('quarter', '2026-12-31'), '2026-Q4');
});

test('keyHorizon узнаёт горизонт по форме ключа и отсекает чужое', () => {
  assert.equal(Store.keyHorizon('2026-08-29'), 'day');
  assert.equal(Store.keyHorizon('2026-W35'), 'week');
  assert.equal(Store.keyHorizon('2026-08'), 'month');
  assert.equal(Store.keyHorizon('2026-Q3'), 'quarter');
  assert.equal(Store.keyHorizon('2026'), 'year');
  assert.equal(Store.keyHorizon('2026-Q9'), null);
  assert.equal(Store.keyHorizon('мусор'), null);
  assert.equal(Store.keyHorizon(''), null);
});

test('keyHorizon отсеивает даты, которых не существует', () => {
  // Сюда приходят ключи из импортированных файлов — форма ключа ещё не значит, что дата настоящая
  assert.equal(Store.keyHorizon('2026-13'), null, 'тринадцатого месяца нет');
  assert.equal(Store.keyHorizon('2026-00'), null);
  assert.equal(Store.keyHorizon('2026-02-31'), null, 'в феврале нет 31-го числа');
  assert.equal(Store.keyHorizon('2026-08-32'), null);
  assert.equal(Store.keyHorizon('2026-W00'), null);
  assert.equal(Store.keyHorizon('2026-W54'), null);
  assert.equal(Store.keyHorizon('2026-02-29'), null, '2026 год не високосный');
  assert.equal(Store.keyHorizon('2024-02-29'), 'day', 'а 2024-й — високосный');
});

test('keyStart и keyEnd дают границы периода', () => {
  assert.deepEqual([Store.keyStart('2026-08-29'), Store.keyEnd('2026-08-29')], ['2026-08-29', '2026-08-29']);
  assert.deepEqual([Store.keyStart('2026-W35'), Store.keyEnd('2026-W35')], ['2026-08-24', '2026-08-30']);
  assert.deepEqual([Store.keyStart('2026-08'), Store.keyEnd('2026-08')], ['2026-08-01', '2026-08-31']);
  assert.deepEqual([Store.keyStart('2026-Q3'), Store.keyEnd('2026-Q3')], ['2026-07-01', '2026-09-30']);
  assert.deepEqual([Store.keyStart('2026'), Store.keyEnd('2026')], ['2026-01-01', '2026-12-31']);
  // февраль: обычный год и високосный
  assert.equal(Store.keyEnd('2026-02'), '2026-02-28');
  assert.equal(Store.keyEnd('2024-02'), '2024-02-29');
});

test('ключ восстанавливается из собственного начала', () => {
  ['2026-08-29', '2026-W01', '2026-W53', '2026-08', '2026-Q3', '2026'].forEach(key => {
    const horizon = Store.keyHorizon(key);
    assert.equal(Store.periodKey(horizon, Store.keyStart(key)), key, `круговой обход для ${key}`);
  });
});

test('children разбивает период на подпериоды', () => {
  assert.deepEqual(Store.children('2026-W35'), [
    '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
  ]);
  assert.deepEqual(Store.children('2026-Q3'), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(Store.children('2026'), ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
  assert.deepEqual(Store.children('2026-08-29'), []);        // у дня подпериодов нет
});

test('недели месяца берутся целиком, вместе с хвостами соседних месяцев', () => {
  // 1 августа 2026 — суббота, 31 августа — понедельник: месяц задевает шесть недель
  const weeks = Store.children('2026-08');
  assert.deepEqual(weeks, ['2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35', '2026-W36']);
  // ни один день месяца не остаётся без своей недели
  const covered = new Set(weeks.flatMap(w => Store.dateRange(Store.keyStart(w), Store.keyEnd(w))));
  Store.dateRange('2026-08-01', '2026-08-31').forEach(day => assert.ok(covered.has(day), `день ${day} потерян`));
});

test('подписи периодов читаются по-человечески', () => {
  assert.equal(Store.periodLabel('2026-08-29'), '29 августа');
  assert.equal(Store.periodLabel('2026-W35'), 'Неделя 35');
  assert.equal(Store.periodLabel('2026-08'), 'Август 2026');
  assert.equal(Store.periodLabel('2026-Q3'), 'III квартал 2026');
  assert.equal(Store.periodLabel('2026'), '2026');

  assert.equal(Store.periodSub('2026-08-29'), 'суббота');
  assert.equal(Store.periodSub('2026-W35'), '24 авг — 30 авг 2026');
  assert.equal(Store.periodSub('2026-Q3'), 'июль — сентябрь');
});
