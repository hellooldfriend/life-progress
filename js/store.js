/* ============================================================
   store.js — модель данных, персистентность, утилиты дат и периодов.
   Единственный модуль, который знает про localStorage.

   Даты всюду — ISO-строки 'YYYY-MM-DD' в местном времени
   (та же конвенция, что в проекте sprint-progress).

   Форма состояния:
   {
     version: 2,
     settings: { horizon: 'days'|'week'|'month'|'quarter'|'year', range: 7|14|30 },
     periods: {
       'inbox':      { tasks: [...], summary: '' },   // входящие: периода ещё нет
       '2026-08-29': { tasks: [...], summary: '' },   // день
       '2026-W35':   { tasks: [...], summary: '' },   // неделя, ISO
       '2026-08':    { tasks: [...], summary: '' },   // месяц
       '2026-Q3':    { tasks: [...], summary: '' },   // квартал
       '2026':       { tasks: [...], summary: '' }    // год
     }
   }

   Входящие живут в той же мапе намеренно: это обычный список задач,
   которому просто не назначено время. Так все операции над задачами
   работают в нём без единой строчки нового кода. Границ у него нет,
   поэтому keyStart/keyEnd/nextKey возвращают null, и он сам собой
   выпадает из просрочки и напоминаний об итогах.

   Ключ периода сам кодирует горизонт — по нему всегда понятно,
   к чему относится список задач. Новый горизонт = новый формат ключа,
   остальной код не меняется.

   task: {
     id, text,
     category: '',                       // метка вида #работа, задаётся прямо в тексте
     parentId: null,                     // шаг большой цели: ссылка на задачу в другом периоде
     done, doneAt,
     important,
     cancelled, cancelledAt,             // «не буду делать» — уходит из прогресса, но остаётся видна
     carriedFrom: { key } | null,        // откуда переехала; подпись — periodLabel(key)
     carryCount,                         // сколько раз переезжала подряд
     createdAt
   }

   Связь «цель → шаги» — это parentId, а не вложенный список: цель лежит
   в сентябре, шаг — на этой неделе, и жить в одном массиве они не могут.
   Ссылка идёт только по id, без периода: иначе перенос цели в другой месяц
   рвал бы все связи. Найти задачу по id умеет findTask.

   Выполненные и отменённые задачи не пересобирают массив: порядок в нём
   ручной, а вниз они уезжают только при показе (orderedTasks).
   ============================================================ */
const Store = (() => {
  'use strict';

  const KEY = 'doozy:v1';
  /** Ключи прежних имён приложения — читаем, чтобы данные пережили переименование. */
  const LEGACY_KEYS = ['life-progress:v1', 'life-sprints/v1'];

  const HORIZONS = ['day', 'week', 'month', 'quarter', 'year'];

  /**
   * Сколько периодов горизонта показывать рядом. Один — привычный вид
   * с разбивкой на подпериоды, несколько — соседи бок о бок: без них
   * не решить, куда переносить задачу.
   */
  const SPAN_OPTIONS = {
    day:     [7, 14, 30],
    week:    [1, 2, 4],
    month:   [1, 2, 3],
    quarter: [1, 2, 4],
    year:    [1, 2, 3],
  };
  const DEFAULT_SPANS = { day: 14, week: 1, month: 1, quarter: 1, year: 1 };
  /** Какие горизонты показывать. Кто планирует неделями, кварталы ему только мешают. */
  const DEFAULT_VISIBLE = { day: true, week: true, month: true, quarter: true, year: true };
  /** Ключ входящих: «когда-нибудь, но записать надо сейчас». */
  const INBOX_KEY = 'inbox';
  /** Горизонты, у которых есть блок «Итоги»: ретроспектива нужна от недели и выше. */
  const RETRO_HORIZONS = ['week', 'month', 'quarter', 'year'];


  /* ═════════════ Утилиты дат ═════════════ */

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function toISODate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function parseDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function addDays(iso, n) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }
  function addMonths(iso, n) {
    const d = parseDate(iso);
    // Считаем от первого числа: иначе 31 января + 1 месяц уехало бы в март
    return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
  }
  /** Календарных дней между двумя датами (b - a). */
  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  const today = () => toISODate(new Date());

  /** Список дат включительно. */
  function dateRange(startDate, endDate) {
    const out = [];
    const total = Math.max(0, diffDays(startDate, endDate));
    for (let i = 0; i <= total; i++) out.push(addDays(startDate, i));
    return out;
  }

  // Всё языковое — имена месяцев, порядок «день — месяц», склонения — живёт в I18N.
  // Store лишь знает, какие числа туда передать.
  const t = (...args) => I18N.t(...args);

  /** Склонение при числе по правилам текущего языка: 1 неделя, 2 недели, 5 недель. */
  const plural = (n, one, few, many) => t('plural', n, one, few, many);

  /** Подпись для выбора ширины окна: «3 месяца», «14 дней». */
  function spanLabel(horizon, n) {
    const words = t('span.words')[horizon] || t('span.words').day;
    return `${n} ${plural(n, ...words)}`;
  }

  /**
   * Заголовок для нескольких периодов сразу. Повторы схлопываются:
   * «Неделя 35 — 37», «Сентябрь — Ноябрь 2026», «III — IV квартал 2026».
   */
  function spanTitle(firstKey, lastKey) {
    if (firstKey === lastKey) return periodLabel(firstKey);
    const a = periodLabel(firstKey).split(' ');
    const b = periodLabel(lastKey).split(' ');

    let tail = 0;                                  // общий хвост убираем слева: год пишем один раз
    while (a.length > 1 && a[a.length - 1] === b[b.length - 1 - tail]) { a.pop(); tail++; }
    if (!tail) {                                   // общее начало убираем справа: «Неделя 35 — 37»
      while (b.length > 1 && a[0] === b[0]) b.shift();
    }
    return `${a.join(' ')} — ${b.join(' ')}`;
  }

  /** Месяц в именительном падеже: «Август». */
  const monthName = iso => t('months.long')[parseDate(iso).getMonth()];

  function formatDate(iso, withYear) {
    const d = parseDate(iso);
    return t('fmt.date', d.getDate(), d.getMonth(), withYear ? d.getFullYear() : null);
  }
  /**
   * Диапазон дат. Когда концы в разных годах, год печатается с обеих сторон:
   * «28 дек — 3 янв 2027» читается так, будто декабрь тоже из 2027-го.
   * withYear=true просит показать год всегда — в планировании на годы вперёд
   * «24 авг — 30 авг» без года читается плохо.
   */
  function formatRange(a, b, withYear) {
    const sameYear = parseDate(a).getFullYear() === parseDate(b).getFullYear();
    return `${formatDate(a, !sameYear)} — ${formatDate(b, withYear || !sameYear)}`;
  }

  /** 0 = понедельник … 6 = воскресенье. */
  const weekday = iso => (parseDate(iso).getDay() + 6) % 7;
  const weekdayName = iso => t('weekdays')[weekday(iso)];
  const isWeekend = iso => weekday(iso) > 4;
  /** Понедельник недели, в которую попадает дата. */
  const weekStart = iso => addDays(iso, -weekday(iso));
  const quarterOf = iso => Math.floor(parseDate(iso).getMonth() / 3) + 1;

  /**
   * Номер ISO-недели и её год. Неделя принадлежит тому году,
   * на который приходится её четверг, поэтому 1 января бывает 53-й неделей
   * прошлого года — это не ошибка, а стандарт.
   */
  function isoWeek(iso) {
    const thursday = parseDate(addDays(weekStart(iso), 3));
    const year = thursday.getFullYear();
    // Неделя с 4 января — всегда первая неделя года
    const firstThursday = parseDate(addDays(weekStart(`${year}-01-04`), 3));
    const week = 1 + Math.round((thursday - firstThursday) / 604800000);
    return { year, week };
  }

  /* ═════════════ Категории ═════════════ */

  /** Первая метка вида #работа. Пробелов внутри метки нет — иначе её не отделить от текста. */
  const CATEGORY_RE = /(?:^|\s)#([^\s#]{1,24})/;

  const normalizeCategory = value =>
    String(value || '').trim().toLowerCase().replace(/^#/, '').split(/\s+/)[0] || '';

  /**
   * Делит введённую строку на текст и метку: «купить билеты #работа».
   * Метка может стоять где угодно, из текста она вырезается.
   *
   * @returns {{text: string, category: string}}
   */
  function parseTaskInput(raw) {
    const value = String(raw ?? '');
    const match = CATEGORY_RE.exec(value);
    const text = (match ? value.replace(match[0], ' ') : value).replace(/\s+/g, ' ').trim();
    return { text, category: match ? normalizeCategory(match[1]) : '' };
  }

  /** Обратное преобразование — то, что показывать в поле правки. */
  const taskInputValue = task => (task.category ? `${task.text} #${task.category}` : task.text);

  /** Все метки, которые реально используются, — из них собирается строка фильтров. */
  function categories() {
    const found = new Set();
    Object.keys(state.periods).forEach(key => {
      state.periods[key].tasks.forEach(t => { if (t.category) found.add(t.category); });
    });
    return [...found].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  const byCategory = (list, category) =>
    (category ? list.filter(t => t.category === category) : list);

  /* ═════════════ Ключи периодов ═════════════ */

  const KEY_SHAPES = [
    ['inbox',   /^inbox$/],
    ['day',     /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/],
    ['week',    /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/],
    ['quarter', /^\d{4}-Q[1-4]$/],
    ['month',   /^\d{4}-(0[1-9]|1[0-2])$/],
    ['year',    /^\d{4}$/],
  ];

  /**
   * Горизонт ключа. Заодно это единственная проверка «наш ли это ключ»:
   * через неё проходят и импортированные файлы, поэтому 13-й месяц
   * и 31 февраля должны отсеиваться здесь.
   *
   * @returns {string|null} null, если ключ не наш
   */
  function keyHorizon(key) {
    const value = String(key);
    const found = KEY_SHAPES.find(([, re]) => re.test(value));
    if (!found) return null;
    // Формат допускает 2026-02-31 — проверяем обратным преобразованием
    if (found[0] === 'day' && toISODate(parseDate(value)) !== value) return null;
    return found[0];
  }

  /** Ключ периода, в который попадает дата. */
  function periodKey(horizon, date) {
    const iso = typeof date === 'string' ? date : toISODate(date);
    switch (horizon) {
      case 'day':   return iso;
      case 'week': {
        const { year, week } = isoWeek(iso);
        return `${year}-W${String(week).padStart(2, '0')}`;
      }
      case 'month':   return iso.slice(0, 7);
      case 'quarter': return `${iso.slice(0, 4)}-Q${quarterOf(iso)}`;
      case 'year':    return iso.slice(0, 4);
      default:        throw new Error(t('err.horizon', horizon));
    }
  }

  /** Первый день периода. */
  function keyStart(key) {
    const horizon = keyHorizon(key);
    const year = Number(String(key).slice(0, 4));
    switch (horizon) {
      case 'day':   return key;
      case 'week': {
        const week = Number(String(key).slice(6));
        return addDays(weekStart(`${year}-01-04`), (week - 1) * 7);
      }
      case 'month':   return `${key}-01`;
      case 'quarter': return toISODate(new Date(year, (Number(key.slice(6)) - 1) * 3, 1));
      case 'year':    return `${year}-01-01`;
      default:        return null;
    }
  }

  /** Последний день периода. */
  function keyEnd(key) {
    const horizon = keyHorizon(key);
    const start = keyStart(key);
    if (!start) return null;
    switch (horizon) {
      case 'day':     return start;
      case 'week':    return addDays(start, 6);
      case 'month':   return addDays(addMonths(start, 1), -1);
      case 'quarter': return addDays(addMonths(start, 3), -1);
      case 'year':    return `${start.slice(0, 4)}-12-31`;
      default:        return null;
    }
  }

  /**
   * Ключи подпериодов: неделя → дни, месяц → недели, квартал → месяцы, год → кварталы.
   * Недели месяца берутся целиком, включая «хвосты» соседних месяцев:
   * неделя неделима, и задача с 31 августа не должна пропадать из обзора.
   */
  function children(key) {
    const horizon = keyHorizon(key);
    const start = keyStart(key);
    if (!start) return [];
    switch (horizon) {
      case 'week':
        return dateRange(start, keyEnd(key));
      case 'month': {
        const out = [];
        for (let d = weekStart(start); d <= keyEnd(key); d = addDays(d, 7)) out.push(periodKey('week', d));
        return out;
      }
      case 'quarter':
        return [0, 1, 2].map(i => periodKey('month', addMonths(start, i)));
      case 'year':
        return [1, 2, 3, 4].map(q => `${start.slice(0, 4)}-Q${q}`);
      default:
        return [];
    }
  }

  /**
   * Соседний период того же горизонта. Сюда переносится задача,
   * которую не успели закрыть.
   */
  function nextKey(key, step = 1) {
    const horizon = keyHorizon(key);
    if (!horizon) return null;
    const start = keyStart(key);
    switch (horizon) {
      case 'day':     return periodKey('day', addDays(start, step));
      case 'week':    return periodKey('week', addDays(start, 7 * step));
      case 'month':   return periodKey('month', addMonths(start, step));
      case 'quarter': return periodKey('quarter', addMonths(start, 3 * step));
      case 'year':    return periodKey('year', addMonths(start, 12 * step));
      default:        return null;
    }
  }

  /**
   * Окно из нескольких подряд идущих периодов, начиная с заданного.
   *
   * @returns {string[]} ключи периодов
   */
  function periodSpan(key, count) {
    const out = [key];
    for (let i = 1; i < Math.max(1, count); i++) {
      const next = nextKey(out[out.length - 1]);
      if (!next) break;
      out.push(next);
    }
    return out;
  }

  /** Заголовок периода: «Август 2026», «Неделя 35», «III квартал 2026». */
  function periodLabel(key) {
    const start = keyStart(key);
    switch (keyHorizon(key)) {
      case 'inbox':   return t('label.inbox');
      case 'day':     return t('label.day', parseDate(key).getDate(), parseDate(key).getMonth());
      case 'week':    return t('label.week', Number(String(key).slice(6)));
      case 'month':   return t('label.month', parseDate(start).getMonth(), start.slice(0, 4));
      case 'quarter': return t('label.quarter', Number(key.slice(6)), key.slice(0, 4));
      case 'year':    return String(key);
      default:        return String(key);
    }
  }

  /** Подпись под заголовком: день недели, диапазон дат, состав квартала. */
  function periodSub(key) {
    const horizon = keyHorizon(key);
    const start = keyStart(key);
    switch (horizon) {
      case 'inbox':   return t('sub.inbox');
      case 'day':     return weekdayName(key);
      case 'week':    return formatRange(start, keyEnd(key), true);
      case 'month':   return t('sub.month', quarterOf(start));
      case 'quarter': {
        const m = parseDate(start).getMonth();
        return t('sub.quarter', m, m + 2);
      }
      case 'year':    return t('sub.year');
      default:        return '';
    }
  }

  /* ═════════════ Состояние ═════════════ */

  function emptyState() {
    return {
      version: 3,
      settings: {
        horizon: 'overview', lang: I18N.DEFAULT,
        spans: { ...DEFAULT_SPANS }, visible: { ...DEFAULT_VISIBLE },
      },
      periods: {},
    };
  }

  let state = null;

  /**
   * Приводит любой объект — из localStorage, из импортированного файла,
   * из первой версии приложения — к рабочей форме. Мусор молча отбрасывается:
   * лучше открыть приложение без части данных, чем не открыть вовсе.
   *
   * @returns {object|null} null, если это вообще не похоже на наш бэкап
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.periods || typeof raw.periods !== 'object') return null;

    const next = emptyState();
    // В v1 настройки лежали в ui, в v2 — в settings; читаем оба
    const settings = raw.settings || raw.ui || {};
    if (typeof settings.horizon === 'string') next.settings.horizon = settings.horizon;
    else if (typeof settings.view === 'string') next.settings.horizon = settings.view;

    if (I18N.LANGS.includes(settings.lang)) next.settings.lang = settings.lang;

    const spans = settings.spans && typeof settings.spans === 'object' ? settings.spans : {};
    HORIZONS.forEach(horizon => {
      const value = Number(spans[horizon]);
      if (SPAN_OPTIONS[horizon].includes(value)) next.settings.spans[horizon] = value;
    });
    const visible = settings.visible && typeof settings.visible === 'object' ? settings.visible : {};
    HORIZONS.forEach(horizon => {
      if (typeof visible[horizon] === 'boolean') next.settings.visible[horizon] = visible[horizon];
    });
    // Спрятать всё нельзя: остаться без единой вкладки — это не настройка, а тупик
    if (!HORIZONS.some(h => next.settings.visible[h])) next.settings.visible = { ...DEFAULT_VISIBLE };

    // До появления окон настройка была одна — количество дней в агенде
    if (spans.day === undefined && SPAN_OPTIONS.day.includes(Number(settings.range))) {
      next.settings.spans.day = Number(settings.range);
    }

    Object.keys(raw.periods).forEach(key => {
      if (!keyHorizon(key)) return;                    // чужой ключ — не наш период
      const p = raw.periods[key] || {};
      const tasks = (Array.isArray(p.tasks) ? p.tasks : [])
        .filter(t => t && typeof t.text === 'string' && t.text.trim())
        .map(t => ({
          id:          String(t.id || uid()),
          text:        t.text,
          category:    normalizeCategory(t.category),
          parentId:    t.parentId ? String(t.parentId) : null,
          // Закрытая и отменённая одновременно — противоречие: закрытие сильнее
          done:        !!t.done,
          doneAt:      t.done ? (t.doneAt || null) : null,
          important:   !!t.important,
          cancelled:   !!t.cancelled && !t.done,
          cancelledAt: !t.done && t.cancelled ? (t.cancelledAt || null) : null,
          carriedFrom: t.carriedFrom && t.carriedFrom.key ? { key: String(t.carriedFrom.key) } : null,
          carryCount:  Number.isFinite(+t.carryCount) && +t.carryCount > 0 ? Math.floor(+t.carryCount) : 0,
          createdAt:   t.createdAt || new Date().toISOString(),
        }));
      const summary = typeof p.summary === 'string' ? p.summary : '';
      if (tasks.length || summary.trim()) next.periods[key] = { tasks, summary };
    });

    // Ссылка на несуществующую цель — после правки файла руками такое бывает.
    // Оставлять её нельзя: тег «часть цели» вёл бы в пустоту
    const ids = new Set();
    Object.keys(next.periods).forEach(key => next.periods[key].tasks.forEach(t => ids.add(t.id)));
    Object.keys(next.periods).forEach(key => next.periods[key].tasks.forEach(t => {
      if (t.parentId && !ids.has(t.parentId)) t.parentId = null;
    }));
    return next;
  }

  function load() {
    try {
      const raw = [KEY, ...LEGACY_KEYS].map(k => localStorage.getItem(k)).find(Boolean);
      if (raw) state = normalize(JSON.parse(raw));
    } catch (err) {
      console.warn('[store] не удалось прочитать localStorage:', err);
    }
    if (!state) {                  // первый запуск или битые данные — начинаем с чистого листа
      state = emptyState();
    }
    I18N.setLang(state.settings.lang);
    save();                        // сразу переносим данные на актуальный ключ и версию
    return state;
  }

  /** Подписчики на изменение состояния. */
  const listeners = [];

  /** @returns {Function} функция отписки */
  function onChange(listener) {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function save() {
    // Пустые периоды не храним: пользователь щёлкнул по чужой карточке — файл не растёт
    Object.keys(state.periods).forEach(key => {
      const p = state.periods[key];
      if (!p.tasks.length && !p.summary.trim()) delete state.periods[key];
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[store] не удалось сохранить:', err);
      return false;
    }
    listeners.forEach(fn => {
      try { fn(state); } catch (err) { console.error('[store] подписчик упал:', err); }
    });
    return true;
  }

  const get = () => state;

  function setSetting(name, value) {
    state.settings[name] = value;
    save();
  }

  /** Язык интерфейса: словарь и настройка меняются вместе, иначе они разъедутся после перезагрузки. */
  const lang = () => I18N.lang;
  function setLang(next) {
    if (!I18N.setLang(next)) return false;
    state.settings.lang = next;
    save();
    return true;
  }

  /* ───────────── Видимость горизонтов ───────────── */

  const isVisible = horizon => state.settings.visible[horizon] !== false;
  const visibleHorizons = () => HORIZONS.filter(isVisible);

  /** @returns {boolean} применилось ли; последний видимый горизонт спрятать нельзя */
  function setVisible(horizon, value) {
    if (!HORIZONS.includes(horizon)) return false;
    if (!value && visibleHorizons().length === 1 && isVisible(horizon)) return false;
    state.settings.visible[horizon] = !!value;
    save();
    return true;
  }

  /** Сколько периодов горизонта показывать рядом. */
  const spanOf = horizon => state.settings.spans[horizon] || DEFAULT_SPANS[horizon] || 1;

  function setSpan(horizon, value) {
    const options = SPAN_OPTIONS[horizon];
    if (!options || !options.includes(Number(value))) return false;
    state.settings.spans[horizon] = Number(value);
    save();
    return true;
  }

  /* ═════════════ Периоды ═════════════ */

  /** @param {boolean} [create] завести период, если его ещё нет */
  function period(key, create) {
    let p = state.periods[key];
    if (!p && create) p = state.periods[key] = { tasks: [], summary: '' };
    return p || null;
  }

  const tasks = key => (state.periods[key] ? state.periods[key].tasks : []);
  const summary = key => (state.periods[key] ? state.periods[key].summary : '');
  const taskById = (key, id) => tasks(key).find(t => t.id === id) || null;

  /** Группа задачи при показе: сначала активные, потом закрытые, в самом низу отменённые. */
  const rank = task => (task.cancelled ? 2 : task.done ? 1 : 0);

  /**
   * Порядок показа. Ручной порядок хранится в самом массиве и не меняется —
   * иначе отметка галочки перетасовывала бы список под руками.
   */
  function orderedTasks(key, category) {
    return byCategory(tasks(key), category)
      .map((task, index) => ({ task, index }))
      .sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index)
      .map(x => x.task);
  }

  /**
   * Прогресс периода. Отменённые задачи из знаменателя уходят: снятие скоупа —
   * это решение, а не невыполнение, и портить им проценты нечестно.
   *
   * @param {string} [category] считать только задачи этой метки
   */
  function stats(key, category) {
    const list = byCategory(tasks(key), category);
    const cancelled = list.filter(t => t.cancelled).length;
    return {
      done: list.filter(t => t.done && !t.cancelled).length,
      active: list.length - cancelled,
      cancelled,
      total: list.length,
    };
  }

  function setSummary(key, text) {
    period(key, true).summary = String(text);
    save();
  }

  /* ═════════════ Цели и шаги ═════════════ */

  /**
   * Задача по id — где угодно в состоянии. Ссылка на цель хранится без периода,
   * поэтому искать приходится перебором; задач тут сотни, а не миллионы.
   *
   * @returns {{key: string, task: object}|null}
   */
  function findTask(id) {
    const keys = Object.keys(state.periods);
    for (const key of keys) {
      const task = state.periods[key].tasks.find(t => t.id === id);
      if (task) return { key, task };
    }
    return null;
  }

  /** Цепочка целей вверх от задачи — она же защита от закольцовывания. */
  function ancestorIds(id) {
    const out = [];
    const seen = new Set([id]);
    let current = findTask(id);
    while (current && current.task.parentId && !seen.has(current.task.parentId)) {
      seen.add(current.task.parentId);
      out.push(current.task.parentId);
      current = findTask(current.task.parentId);
    }
    return out;
  }

  /**
   * Шаги цели — они живут в своих периодах, поэтому возвращаются вместе с ключами.
   * Порядок — по времени периода: ближайшее раньше, входящие в конце.
   *
   * @returns {Array<{key: string, task: object}>}
   */
  function subtasks(parentId) {
    if (!parentId) return [];
    const out = [];
    Object.keys(state.periods).forEach(key => {
      state.periods[key].tasks.forEach(task => {
        if (task.parentId === parentId) out.push({ key, task });
      });
    });
    return out.sort((a, b) => {
      const sa = keyStart(a.key) || '9999-99-99';   // у входящих начала нет — они в конце
      const sb = keyStart(b.key) || '9999-99-99';
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }

  /** Прогресс цели по её шагам. Снятые шаги из знаменателя уходят, как везде. */
  function subtaskStats(parentId) {
    const list = subtasks(parentId).map(item => item.task);
    const cancelled = list.filter(t => t.cancelled).length;
    return {
      done: list.filter(t => t.done && !t.cancelled).length,
      active: list.length - cancelled,
      cancelled,
      total: list.length,
    };
  }

  /**
   * Сделать задачу шагом цели. Пустой parentId отвязывает.
   * Кольца запрещены: цель не может стать шагом собственного шага.
   *
   * @returns {object|null} задача, либо null если связь невозможна
   */
  function setParent(key, id, parentId) {
    const task = taskById(key, id);
    if (!task) return null;
    if (!parentId) {
      task.parentId = null;
      save();
      return task;
    }
    if (parentId === id) return null;
    if (!findTask(parentId)) return null;
    if (ancestorIds(parentId).includes(id)) return null;   // цель уже под этой задачей

    task.parentId = parentId;
    save();
    return task;
  }

  /**
   * Задачи, к которым имеет смысл привязываться: незакрытые, кроме самой задачи
   * и её собственных шагов. Сначала крупные горизонты — цели обычно там.
   *
   * @returns {Array<{key: string, task: object}>}
   */
  function goalCandidates(excludeId) {
    const order = ['year', 'quarter', 'month', 'week', 'day', 'inbox'];
    const banned = new Set([excludeId, ...descendantIds(excludeId)]);
    const out = [];
    Object.keys(state.periods).forEach(key => {
      state.periods[key].tasks.forEach(task => {
        if (!task.done && !task.cancelled && !banned.has(task.id)) out.push({ key, task });
      });
    });
    return out.sort((a, b) => {
      const ha = order.indexOf(keyHorizon(a.key));
      const hb = order.indexOf(keyHorizon(b.key));
      return ha - hb || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
  }

  /** Все потомки задачи, на любую глубину. */
  function descendantIds(id) {
    if (!id) return [];
    const out = [];
    const queue = [id];
    while (queue.length) {
      subtasks(queue.shift()).forEach(({ task }) => {
        if (!out.includes(task.id)) { out.push(task.id); queue.push(task.id); }
      });
    }
    return out;
  }

  /* ═════════════ Задачи ═════════════ */

  /**
   * @param {string} raw текст, возможно с меткой: «купить билеты #работа»
   * @param {string} [defaultCategory] метка по умолчанию — активный фильтр
   * @returns {object|null} созданная задача, либо null для пустого текста
   */
  function addTask(key, raw, defaultCategory) {
    const { text, category } = parseTaskInput(raw);
    if (!text || !keyHorizon(key)) return null;
    const task = {
      id: uid(),
      text,
      category: category || normalizeCategory(defaultCategory),
      parentId: null,
      done: false, doneAt: null,
      important: false,
      cancelled: false, cancelledAt: null,
      carriedFrom: null, carryCount: 0,
      createdAt: new Date().toISOString(),
    };
    period(key, true).tasks.push(task);
    save();
    return task;
  }

  /**
   * Правка задачи. patch.text разбирается вместе с меткой: стёрли #работу
   * из строки — метка снимается, дописали — ставится.
   *
   * Закрытая и отменённая одновременно — противоречие, поэтому флаги гасят друг друга.
   */
  function updateTask(key, id, patch) {
    const task = taskById(key, id);
    if (!task) return null;

    if (patch.text !== undefined) {
      const { text, category } = parseTaskInput(patch.text);
      if (!text) { deleteTask(key, id); return null; }    // стёрли текст — стёрли задачу
      task.text = text;
      task.category = category;
    }
    if (patch.category !== undefined) task.category = normalizeCategory(patch.category);
    if (patch.done !== undefined) {
      task.done = !!patch.done;
      task.doneAt = task.done ? new Date().toISOString() : null;
      if (task.done) { task.cancelled = false; task.cancelledAt = null; }
    }
    if (patch.cancelled !== undefined) {
      task.cancelled = !!patch.cancelled;
      task.cancelledAt = task.cancelled ? new Date().toISOString() : null;
      if (task.cancelled) { task.done = false; task.doneAt = null; }
    }
    if (patch.important !== undefined) task.important = !!patch.important;
    save();
    return task;
  }

  const toggleTask      = (key, id) => updateTask(key, id, { done:      !(taskById(key, id) || {}).done });
  const toggleImportant = (key, id) => updateTask(key, id, { important: !(taskById(key, id) || {}).important });
  const toggleCancelled = (key, id) => updateTask(key, id, { cancelled: !(taskById(key, id) || {}).cancelled });

  /**
   * Двигает задачу в ручном порядке на соседнюю позицию.
   * Границы своей группы не пересекает: активная задача не «ныряет»
   * под закрытые, которые всё равно показываются ниже.
   *
   * @param {number} dir -1 вверх, +1 вниз
   * @returns {boolean} двинулась ли задача
   */
  function moveTask(key, id, dir) {
    const p = period(key);
    if (!p) return false;
    const ordered = orderedTasks(key);
    const index = ordered.findIndex(t => t.id === id);
    if (index === -1) return false;

    const task = ordered[index];
    const neighbour = ordered[index + dir];
    if (!neighbour || rank(neighbour) !== rank(task)) return false;

    const from = p.tasks.indexOf(task);
    const to = p.tasks.indexOf(neighbour);
    [p.tasks[from], p.tasks[to]] = [p.tasks[to], p.tasks[from]];
    save();
    return true;
  }

  /**
   * Переносит незакрытую задачу в другой период — по умолчанию в следующий
   * того же горизонта. Копии в исходном периоде не остаётся: две одинаковые
   * строки в двух днях — это не память о переносе, а путаница. Память живёт
   * в самой задаче: carriedFrom говорит откуда, carryCount — сколько раз подряд.
   *
   * @param {string} [targetKey] куда перенести; с дашборда это «сегодня»
   * @returns {{key: string, task: object}|null} null, если переносить нечего
   */
  function carryTask(key, id, targetKey) {
    const task = taskById(key, id);
    if (!task || task.done) return null;
    const target = targetKey || nextKey(key);
    if (!target || target === key || !keyHorizon(target)) return null;

    period(key).tasks = period(key).tasks.filter(t => t.id !== id);
    const moved = {
      ...task,
      cancelled: false, cancelledAt: null,               // перенос — это не отмена
      carriedFrom: { key },      // подпись считается при показе — на текущем языке
      carryCount: (task.carryCount || 0) + 1,
    };
    period(target, true).tasks.push(moved);
    save();
    return { key: target, task: moved };
  }

  /**
   * Запланировать задачу в период: разобрать входящее или спустить шаг цели
   * с месяца на неделю. Это не перенос — задачу не «не сделали», ей выбрали
   * место, поэтому счётчик переносов не растёт и тега «перенос из…» нет.
   *
   * @returns {{key: string, task: object}|null} null, если планировать нечего
   */
  function fileTask(fromKey, id, targetKey) {
    const task = taskById(fromKey, id);
    if (!task || !keyHorizon(targetKey) || targetKey === fromKey || targetKey === INBOX_KEY) return null;

    period(fromKey).tasks = period(fromKey).tasks.filter(t => t.id !== id);
    period(targetKey, true).tasks.push(task);
    save();
    return { key: targetKey, task };
  }

  function deleteTask(key, id) {
    const p = period(key);
    if (!p) return false;
    const before = p.tasks.length;
    p.tasks = p.tasks.filter(t => t.id !== id);
    // Шаги удалённой цели остаются в своих периодах, но перестают быть шагами:
    // задача сама по себе — не потеря, ссылка в пустоту — потеря
    subtasks(id).forEach(({ task }) => { task.parentId = null; });
    save();
    return p.tasks.length < before;
  }

  /* ═════════════ Экспорт / импорт ═════════════ */

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doozy-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Нормализованное состояние из текста файла либо ошибка. */
  function parseImport(text) {
    const next = normalize(JSON.parse(text));
    if (!next) throw new Error(t('err.notBackup'));
    return next;
  }

  function replaceState(next) {
    state = next;
    save();
  }

  return {
    HORIZONS, RETRO_HORIZONS, SPAN_OPTIONS, INBOX_KEY,
    // утилиты дат
    uid, toISODate, parseDate, addDays, addMonths, diffDays, today, dateRange,
    formatDate, formatRange, monthName, weekday, weekdayName, isWeekend, weekStart, quarterOf, isoWeek,
    plural, spanLabel, spanTitle,
    // периоды
    periodKey, keyHorizon, keyStart, keyEnd, nextKey, periodSpan, children, periodLabel, periodSub,
    // категории
    parseTaskInput, taskInputValue, normalizeCategory, categories,
    // состояние
    load, save, onChange, get, setSetting, lang, setLang, spanOf, setSpan,
    isVisible, visibleHorizons, setVisible,
    period, tasks, summary, taskById, orderedTasks, stats, setSummary,
    // цели и шаги
    findTask, subtasks, subtaskStats, setParent, goalCandidates, descendantIds, ancestorIds,
    // задачи
    addTask, updateTask, toggleTask, toggleImportant, toggleCancelled, moveTask, carryTask, fileTask, deleteTask,
    // данные
    exportJSON, parseImport, replaceState,
  };
})();
