/* ============================================================
   Загрузчик приложения для тестов.

   Исходники — обычные скрипты для браузера, без экспортов: в проекте
   нет сборки, и заводить её ради тестов не хочется. Поэтому склеиваем
   их в тело одной функции и возвращаем модули наружу. Каждый вызов
   loadApp() создаёт свежий Store со своим localStorage — тесты не
   протекают друг в друга.

   ui.js и app.js работают с DOM и здесь не грузятся: вся логика,
   которую есть смысл проверять, живёт в store.js.
   ============================================================ */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SOURCES = ['js/i18n.js', 'js/store.js', 'js/insights.js'];

/** Минимальная замена localStorage: обычный объект в памяти. */
function memoryStorage(seed) {
  const data = new Map(Object.entries(seed || {}));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    has: key => data.has(key),
    get size() { return data.size; },
  };
}

let factorySource = null;

function buildFactorySource() {
  if (factorySource) return factorySource;
  const parts = SOURCES.map(file => `// ── ${file}\n${fs.readFileSync(path.join(ROOT, file), 'utf8')}`);
  factorySource =
    '(function (localStorage, console, document, URL, Blob) {\n' +
    parts.join('\n') +
    '\nreturn { I18N, Store, Insights };\n})';
  return factorySource;
}

/**
 * Поднимает приложение в чистом контексте.
 *
 * @param {object} [seed] содержимое localStorage до старта — для тестов миграции
 * @returns {{I18N: object, Store: object, Insights: object, storage: object}}
 */
function loadApp(seed) {
  const storage = memoryStorage(seed);
  // exportJSON трогает DOM — в тестах не вызывается, но заглушки дешевле, чем падение
  const documentStub = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  const urlStub = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };

  const factory = vm.runInThisContext(buildFactorySource(), { filename: 'app-bundle.js' });
  const app = factory(storage, console, documentStub, urlStub, class Blob {});

  app.Store.load();
  return { ...app, storage };
}

/**
 * Наполняет период задачами из компактного описания.
 *
 * @param {object} Store
 * @param {string} key ключ периода
 * @param {Array<string|{text:string,done?:boolean,important?:boolean}>} items
 */
function seedTasks(Store, key, items) {
  return items.map(item => {
    const spec = typeof item === 'string' ? { text: item } : item;
    const task = Store.addTask(key, spec.text);
    if (spec.done) Store.updateTask(key, task.id, { done: true });
    if (spec.important) Store.updateTask(key, task.id, { important: true });
    return Store.taskById(key, task.id);
  });
}

module.exports = { loadApp, seedTasks, memoryStorage };
