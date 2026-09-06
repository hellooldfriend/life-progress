/* Словарь: английский по умолчанию, русский со своими склонениями и порядком дат. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

test('по умолчанию английский, язык сохраняется в настройках', () => {
  const { Store, I18N } = loadApp();
  assert.equal(I18N.lang, 'en');
  assert.equal(Store.lang(), 'en');
  assert.equal(Store.get().settings.lang, 'en');

  assert.equal(Store.setLang('ru'), true);
  assert.equal(I18N.lang, 'ru', 'словарь переключился вместе с настройкой');
  assert.equal(Store.get().settings.lang, 'ru');
  assert.equal(Store.setLang('de'), false, 'неизвестный язык не принимается');
  assert.equal(Store.lang(), 'ru');
});

test('язык переживает перезапуск', () => {
  const first = loadApp();
  first.Store.setLang('ru');
  const { I18N, Store } = loadApp({ 'doozy:v1': first.storage.getItem('doozy:v1') });
  assert.equal(I18N.lang, 'ru');
  assert.equal(Store.periodLabel('2026-08'), 'Август 2026');
});

test('данные без языка получают английский', () => {
  const { I18N } = loadApp({ 'doozy:v1': JSON.stringify({ periods: {}, settings: { horizon: 'days' } }) });
  assert.equal(I18N.lang, 'en');
});

test('русские подписи периодов', () => {
  const { Store } = loadApp();
  Store.setLang('ru');
  assert.equal(Store.periodLabel('2026-08-29'), '29 августа');
  assert.equal(Store.periodLabel('2026-W35'), 'Неделя 35');
  assert.equal(Store.periodLabel('2026-08'), 'Август 2026');
  assert.equal(Store.periodLabel('2026-Q3'), 'III квартал 2026');
  assert.equal(Store.periodLabel('inbox'), 'Входящие');
  assert.equal(Store.periodSub('2026-08-29'), 'суббота');
  assert.equal(Store.periodSub('2026-08'), 'квартал III');
  assert.equal(Store.periodSub('2026-Q3'), 'июль — сентябрь');
  assert.equal(Store.formatRange('2026-08-24', '2026-08-30', true), '24 авг — 30 авг 2026');
  assert.equal(Store.formatRange('2026-12-28', '2027-01-03'), '28 дек 2026 — 3 янв 2027');
});

test('русское склонение числительных', () => {
  const { Store } = loadApp();
  Store.setLang('ru');
  const days = n => Store.plural(n, 'день', 'дня', 'дней');
  assert.deepEqual([1, 2, 5, 11, 14, 21, 22, 30].map(days),
    ['день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней']);
  assert.equal(Store.spanLabel('week', 2), '2 недели');
  assert.equal(Store.spanLabel('quarter', 4), '4 квартала');
  assert.equal(Store.spanLabel('year', 5), '5 лет');
});

test('русские заголовки окна схлопывают повторы', () => {
  const { Store } = loadApp();
  Store.setLang('ru');
  assert.equal(Store.spanTitle('2026-W35', '2026-W37'), 'Неделя 35 — 37');
  assert.equal(Store.spanTitle('2026-09', '2026-11'), 'Сентябрь — Ноябрь 2026');
  assert.equal(Store.spanTitle('2026-Q3', '2026-Q4'), 'III — IV квартал 2026', 'общий хвост в два слова');
});

test('порядковые: 3rd week in a row / 3-я неделя подряд', () => {
  const { I18N } = loadApp();
  assert.equal(I18N.t('tag.carryRun', 3, 'week'), '3rd week in a row');
  assert.equal(I18N.t('tag.carryRun', 2, 'day'), '2nd day in a row');
  assert.equal(I18N.t('tag.carryRun', 11, 'day'), '11th day in a row');
  assert.equal(I18N.t('tag.carryRun', 22, 'month'), '22nd month in a row');
  I18N.setLang('ru');
  assert.equal(I18N.t('tag.carryRun', 3, 'week'), '3-я неделя подряд');
  assert.equal(I18N.t('tag.carryRun', 4, 'day'), '4-й день подряд');
});

test('неизвестный ключ возвращает сам себя, а не падает', () => {
  const { I18N } = loadApp();
  assert.equal(I18N.t('нет.такого'), 'нет.такого');
});

test('у каждого языка есть самоназвание для селекта', () => {
  const { I18N } = loadApp();
  assert.deepEqual(I18N.LANGS.map(I18N.name), ['English', 'Русский']);
  assert.equal(I18N.name('xx'), 'xx', 'неизвестный код возвращается как есть');
  assert.equal(I18N.DEFAULT, 'en');
});
