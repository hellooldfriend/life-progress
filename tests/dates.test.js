/* Утилиты дат: всё считается в местном времени, без сдвига через UTC. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const { Store } = loadApp();

test('toISODate не съезжает на сутки из-за часового пояса', () => {
  // Полночь по местному времени в UTC-плюсовых зонах превращается во «вчера»,
  // если считать через toISOString — проверяем, что этого не происходит
  assert.equal(Store.toISODate(new Date(2026, 7, 13, 0, 30)), '2026-08-13');
  assert.equal(Store.toISODate(new Date(2026, 7, 13, 23, 30)), '2026-08-13');
  assert.equal(Store.toISODate(new Date(2026, 0, 1)), '2026-01-01');
});

test('parseDate читает YYYY-MM-DD как местную дату', () => {
  const d = Store.parseDate('2026-08-13');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 13);
});

test('addDays переходит через границы месяца и года', () => {
  assert.equal(Store.addDays('2026-08-30', 3), '2026-09-02');
  assert.equal(Store.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(Store.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(Store.addDays('2026-08-13', 0), '2026-08-13');
});

test('addMonths считает от первого числа и не проскакивает короткий месяц', () => {
  // 31 января + 1 месяц в наивной реализации уезжает в март — здесь нет
  assert.equal(Store.addMonths('2026-01-31', 1), '2026-02-01');
  assert.equal(Store.addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(Store.addMonths('2026-01-15', -1), '2025-12-01');
  assert.equal(Store.addMonths('2026-08-01', 12), '2027-08-01');
});

test('diffDays считает календарные сутки в обе стороны', () => {
  assert.equal(Store.diffDays('2026-08-10', '2026-08-23'), 13);
  assert.equal(Store.diffDays('2026-08-23', '2026-08-10'), -13);
  assert.equal(Store.diffDays('2026-08-10', '2026-08-10'), 0);
});

test('dateRange отдаёт даты включительно', () => {
  const range = Store.dateRange('2026-08-29', '2026-09-01');
  assert.deepEqual(range, ['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01']);
  assert.deepEqual(Store.dateRange('2026-08-29', '2026-08-29'), ['2026-08-29']);
});

test('день недели считается от понедельника', () => {
  assert.equal(Store.weekday('2026-08-24'), 0);              // понедельник
  assert.equal(Store.weekday('2026-08-30'), 6);              // воскресенье
  assert.equal(Store.weekdayName('2026-08-29'), 'суббота');
  assert.equal(Store.isWeekend('2026-08-28'), false);
  assert.equal(Store.isWeekend('2026-08-29'), true);
  assert.equal(Store.weekStart('2026-08-29'), '2026-08-24');
  assert.equal(Store.weekStart('2026-08-24'), '2026-08-24'); // понедельник — сам себе начало
});

test('formatRange показывает год, когда о нём просят или когда концы в разных годах', () => {
  assert.equal(Store.formatRange('2026-08-24', '2026-08-30'), '24 авг — 30 авг');
  assert.equal(Store.formatRange('2026-08-24', '2026-08-30', true), '24 авг — 30 авг 2026');
  assert.equal(Store.formatRange('2026-12-28', '2027-01-03'), '28 дек 2026 — 3 янв 2027');
});
