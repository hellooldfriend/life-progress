/* ============================================================
   ui.js — рендер интерфейса. Читает Store, пишет в DOM.
   Обработчики событий живут в app.js.

   Вид собирается строкой и один раз кладётся в #content. Исключения —
   чекбокс, «важное» и прогресс: их DOM правится точечно, иначе
   перерисовка съедает анимацию галочки и позицию прокрутки.
   ============================================================ */
const UI = (() => {
  'use strict';

  /**
   * Вкладки горизонтов. id 'days' — это агенда на несколько дней,
   * остальные совпадают с горизонтами. Обзора здесь нет: на него уводит
   * логотип, и в ряду вкладок он был бы вторым входом в то же место.
   */
  const TABS = [
    { id: 'days',    label: 'Дни' },
    { id: 'week',    label: 'Неделя' },
    { id: 'month',   label: 'Месяц' },
    { id: 'quarter', label: 'Квартал' },
    { id: 'year',    label: 'Год' },
  ];
  const OVERVIEW = 'overview';

  /**
   * Локальное состояние интерфейса. Курсор не сохраняется — приложение всегда
   * открывается на сегодня. Фильтр тоже: после перезагрузки спрятанные задачи
   * выглядели бы как пропавшие.
   */
  const view = { cursor: Store.today(), category: '' };

  /** Задачи с раскрытой панелью шагов. Локально: раскрытие — жест, а не настройка. */
  const expanded = new Set();

  /** Ключ периода, чьё поле ввода надо вернуть в фокус после перерисовки. */
  let pendingFocus = null;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const tab = () => {
    const saved = Store.get().settings.horizon;
    return VIEWS[saved] ? saved : OVERVIEW;
  };
  /** «Обзор» всегда про сегодня и листанию по периодам не подчиняется. */
  const isOverview = () => tab() === 'overview';
  /** Горизонт текущей вкладки: агенда «Дни» живёт на дневных периодах. */
  const horizonOf = tabId => (tabId === 'days' ? 'day' : tabId);
  /** Ключ периода, на котором стоит курсор. */
  const currentKey = () => Store.periodKey(horizonOf(tab()), view.cursor);
  /** Вкладка, на которой живёт период: день показывается в агенде «Дни». */
  const tabForHorizon = horizon => (horizon === 'day' ? 'days' : horizon);
  /** Ссылка на период задачи — для перехода к цели или к шагу. */
  const gotoAttr = key => `${tabForHorizon(Store.keyHorizon(key))}|${key}`;

  const ICONS = {
    left:  '<svg class="ico" viewBox="0 0 24 24" width="18" height="18"><path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg class="ico" viewBox="0 0 24 24" width="18" height="18"><path d="M10 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tick:  '<svg class="check__tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.8"/></svg>',
  };

  /** Единица измерения переноса — чтобы тег читался как «3-я неделя подряд». */
  const CARRY_UNITS = {
    day:     ['день', 'й'],
    week:    ['неделя', 'я'],
    month:   ['месяц', 'й'],
    quarter: ['квартал', 'й'],
    year:    ['год', 'й'],
  };

  /* ═════════════ Мелкие блоки ═════════════ */

  /** Прогресс считается по активным задачам: отменённые в знаменатель не входят. */
  function progressOf(key) {
    const { done, active, cancelled } = Store.stats(key, view.category);
    return {
      pct: active ? Math.round(done / active * 100) : 0,
      count: `${done}/${active}`,
      title: cancelled ? `Отменено задач: ${cancelled}` : '',
    };
  }

  function progressHTML(key) {
    const { pct, count, title } = progressOf(key);
    return `<div class="progress" data-prog="${key}"${title ? ` title="${esc(title)}"` : ''}>
      <div class="progress__bar"><i style="width:${pct}%"></i></div>
      <span class="progress__count">${count}</span>
    </div>`;
  }

  /** Точечное обновление прогресса — без перерисовки вида. */
  function updateProgress(key) {
    const { pct, count, title } = progressOf(key);
    $$(`[data-prog="${key}"]`).forEach(el => {
      el.querySelector('i').style.width = `${pct}%`;
      el.querySelector('.progress__count').textContent = count;
      if (title) el.title = title; else el.removeAttribute('title');
    });
  }

  const tagHTML = (kind, text, title) =>
    `<span class="tag tag--${kind}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;

  /**
   * Тег переноса. Один раз — просто «откуда приехала», дальше счётчик:
   * задача, которая едет третий день подряд, должна мозолить глаза.
   */
  function carryTagHTML(key, t) {
    const n = t.carryCount || 0;
    if (!n) return '';
    const from = t.carriedFrom ? t.carriedFrom.label : '';
    const title = `Переносится ${n}-й раз${from ? ` · последний раз из «${from}»` : ''}`;
    if (n === 1) return tagHTML('carry', from ? `перенос из «${from}»` : 'перенос', title);
    const [unit, suffix] = CARRY_UNITS[Store.keyHorizon(key)] || ['период', 'й'];
    return tagHTML('longrun', `${n + 1}-${suffix} ${unit} подряд`, title);
  }

  /**
   * Тег «часть цели» на шаге. Ведёт в период цели: с недели должно быть видно
   * не только что делать, но и ради чего.
   */
  function parentTagHTML(t) {
    if (!t.parentId) return '';
    const parent = Store.findTask(t.parentId);
    if (!parent) return '';
    return `<button class="tag tag--parent" data-goto="${gotoAttr(parent.key)}"
                    title="Часть цели «${esc(parent.task.text)}» · ${esc(Store.periodLabel(parent.key))}"
            >↳ ${esc(parent.task.text)}</button>`;
  }

  /** Тег с прогрессом по шагам. Он же кнопка: раскрывает панель шагов. */
  function stepsTagHTML(t) {
    const { done, active } = Store.subtaskStats(t.id);
    if (!active && !done) return '';
    return `<button class="tag tag--steps" data-act="steps"
                    title="Шаги цели">шаги ${done}/${active}</button>`;
  }

  /** Кнопка действия над задачей. */
  const actionHTML = (act, glyph, title, extraClass) =>
    `<button class="task__icon${extraClass ? ` ${extraClass}` : ''}" data-act="${act}"
             title="${esc(title)}" aria-label="${esc(title)}">${glyph}</button>`;

  /**
   * Строка задачи. Набор действий зависит от состояния: закрытую задачу
   * незачем переносить, а отменённую — помечать важной. Вызывающий может
   * задать свой набор через opts.actions — так делают входящие.
   */
  function taskHTML(key, t, { canUp, canDown, source, actions: customActions } = {}) {
    const cls = [
      'task',
      key === Store.INBOX_KEY && 'task--inbox',
      t.done && 'task--done',
      t.cancelled && 'task--cancelled',
      t.important && !t.cancelled && 'task--important',
    ].filter(Boolean).join(' ');

    const tags = [
      t.category ? `<button class="tag tag--category" data-filter="${esc(t.category)}"
                            title="Показать только «${esc(t.category)}»">#${esc(t.category)}</button>` : '',
      carryTagHTML(key, t),
      parentTagHTML(t),
      stepsTagHTML(t),
      t.cancelled ? tagHTML('cancelled', 'отменена', 'Задача снята — в прогресс не считается') : '',
      source ? `<button class="tag tag--source" data-goto="${source.tab}|${key}"
                        title="Открыть период">${esc(source.label)}</button>` : '',
    ].join('');

    // На дашборде задачу не двигают по списку — её разбирают: сюда, снять или удалить
    const actions = customActions !== undefined ? customActions : source ? [
      actionHTML('today', '⇥', `Перенести: ${Store.periodLabel(source.target)}`),
      actionHTML('cancel', '⊘', 'Отменить — не буду делать'),
      actionHTML('delete', '✕', 'Удалить'),
    ].join('') : [
      canUp ? actionHTML('up', '↑', 'Выше') : '',
      canDown ? actionHTML('down', '↓', 'Ниже') : '',
      !t.done && !t.cancelled
        ? actionHTML('carry', '→', `Перенести: ${Store.periodLabel(Store.nextKey(key))}`) : '',
      !t.done && !t.cancelled ? actionHTML('star', '★', 'Важное', 'task__icon--star') : '',
      !t.cancelled ? actionHTML('steps', '⊞', 'Шаги и цель') : '',
      t.cancelled
        ? actionHTML('cancel', '↺', 'Вернуть в работу')
        : (!t.done ? actionHTML('cancel', '⊘', 'Отменить — не буду делать') : ''),
      actionHTML('delete', '✕', 'Удалить'),
    ].join('');

    return `<li class="${cls}" data-key="${key}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-pressed="${t.done}" aria-label="Выполнено">${ICONS.tick}</button>
      <span class="task__text" data-act="edit" title="Изменить">${esc(t.text)}${tags}</span>
      <span class="task__actions">${actions}</span>
    </li>`;
  }

  /**
   * Шаг цели в её списке. Живёт в своём периоде, поэтому data-key указывает туда:
   * галочка и удаление работают над настоящей задачей, а не над копией.
   */
  function stepRowHTML(stepKey, t) {
    const cls = ['task', 'task--step', t.done && 'task--done', t.cancelled && 'task--cancelled']
      .filter(Boolean).join(' ');
    return `<li class="${cls}" data-key="${stepKey}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-pressed="${t.done}" aria-label="Выполнено">${ICONS.tick}</button>
      <span class="task__text" data-act="edit" title="Изменить">${esc(t.text)}
        <button class="tag tag--source" data-goto="${gotoAttr(stepKey)}"
                title="Открыть период">${esc(Store.periodLabel(stepKey))}</button>
      </span>
      <span class="task__actions">
        ${actionHTML('unlink', '⤫', 'Убрать из шагов — задача останется в своём периоде')}
      </span>
    </li>`;
  }

  /** Панель под задачей: добавить шаг и выбрать, частью какой цели она сама является. */
  function stepPanelHTML(key, t) {
    const today = Store.today();
    const targets = [
      { horizon: 'day', label: 'сегодня' },
      { horizon: 'week', label: 'неделя' },
      { horizon: 'month', label: 'месяц' },
    ];
    const options = Store.goalCandidates(t.id).map(({ key: goalKey, task }) =>
      `<option value="${task.id}"${task.id === t.parentId ? ' selected' : ''}
       >${esc(Store.periodLabel(goalKey))} · ${esc(task.text)}</option>`).join('');

    return `<li class="steps-panel" data-key="${key}" data-id="${t.id}">
      <div class="steps-panel__row">
        <input class="add__input" data-step="${t.id}" type="text" autocomplete="off" placeholder="новый шаг…">
        ${targets.map(({ horizon, label }) => `<button class="task__file" data-act="step" data-to="${horizon}"
                 title="Шаг в период: ${esc(Store.periodLabel(Store.periodKey(horizon, today)))}">${label}</button>`).join('')}
      </div>
      <label class="steps-panel__row steps-panel__link">
        часть цели
        <select class="select" data-act="link">
          <option value="">— сама по себе</option>
          ${options}
        </select>
      </label>
    </li>`;
  }

  function taskListHTML(key, placeholder) {
    const list = Store.orderedTasks(key, view.category);
    // Шаг, лежащий в том же периоде, что и цель, показывается один раз — под целью
    const own = new Set(list.map(t => t.id));
    const top = list.filter(t => !(t.parentId && own.has(t.parentId)));
    // Двигать задачу можно только внутри своей группы: выше закрытых она всё равно не поднимется
    const sameGroup = (a, b) => a && b && !!a.done === !!b.done && !!a.cancelled === !!b.cancelled;

    const rows = top.map((t, i) => taskHTML(key, t, {
      canUp: sameGroup(t, top[i - 1]),
      canDown: sameGroup(t, top[i + 1]),
    }) +
      Store.subtasks(t.id).map(step => stepRowHTML(step.key, step.task)).join('') +
      (expanded.has(t.id) ? stepPanelHTML(key, t) : '')).join('');

    const body = top.length
      ? `<ul class="tasks">${rows}</ul>`
      : `<div class="empty">${view.category ? `нет задач с меткой #${esc(view.category)}` : 'пусто'}</div>`;

    const hint = view.category ? `${placeholder || 'новая задача'} · #${view.category}` : (placeholder || 'новая задача');
    return `${body}
      <form class="add" data-key="${key}">
        <input class="add__input" data-add="${key}" type="text" autocomplete="off"
               placeholder="${esc(hint)}">
        <button class="add__btn" type="submit" aria-label="Добавить">+</button>
      </form>`;
  }

  function summaryHTML(key, label) {
    return `<div class="summary">
      <label class="summary__label" for="sum-${key}">${esc(label)}</label>
      <textarea class="summary__input" id="sum-${key}" data-summary="${key}"
                placeholder="Что произошло, что получилось, важные события…">${esc(Store.summary(key))}</textarea>
    </div>`;
  }

  /** Начало итогов подпериода — чтобы в обзоре было видно, что там уже записано. */
  function excerptHTML(key) {
    const text = Store.summary(key).trim();
    if (!text) return '';
    return `<div class="excerpt">${esc(text.length > 180 ? `${text.slice(0, 180)}…` : text)}</div>`;
  }

  /**
   * Карточка периода.
   * @param {object} o { key, title, sub, goTo, focus, summaryLabel, excerpt, cls, placeholder }
   */
  function cardHTML(o) {
    const title = o.goTo
      ? `<button class="link card__title" data-goto="${o.goTo}|${o.key}">${esc(o.title)}</button>`
      : `<h2 class="card__title">${esc(o.title)}</h2>`;
    const cls = ['card', o.focus && 'card--focus', o.cls].filter(Boolean).join(' ');
    return `<section class="${cls}">
      <header class="card__head">
        <div>${title}${o.sub ? `<div class="card__sub">${esc(o.sub)}</div>` : ''}</div>
        ${progressHTML(o.key)}
      </header>
      ${taskListHTML(o.key, o.placeholder)}
      ${o.summaryLabel ? summaryHTML(o.key, o.summaryLabel) : ''}
      ${o.excerpt ? excerptHTML(o.key) : ''}
    </section>`;
  }

  function dayCardHTML(iso) {
    const isToday = iso === Store.today();
    return cardHTML({
      key: iso,
      title: Store.periodLabel(iso),
      sub: Store.weekdayName(iso) + (isToday ? ' · сегодня' : ''),
      cls: [isToday && 'card--today', Store.isWeekend(iso) && 'card--weekend'].filter(Boolean).join(' '),
      placeholder: 'задача на день',
    });
  }

  /** Карточка-обзор подпериода: заголовок кликабелен и уводит в его собственный вид. */
  const childCardHTML = (key, goTo, placeholder, excerpt) => cardHTML({
    key,
    title: Store.periodLabel(key),
    sub: Store.periodSub(key),
    goTo, placeholder, excerpt,
  });

  /** Главная карточка вида: задачи периода и его итоги. */
  const focusCardHTML = (key, summaryLabel, placeholder) => cardHTML({
    key,
    title: Store.periodLabel(key),
    sub: Store.periodSub(key),
    focus: true, summaryLabel, placeholder,
  });

  /* ═════════════ Виды ═════════════ */

  function renderDays() {
    const days = Store.dateRange(view.cursor, Store.addDays(view.cursor, Store.spanOf('day') - 1));
    return `<div class="grid grid--3">${days.map(dayCardHTML).join('')}</div>`;
  }

  /** Подписи горизонта: что писать в поле ввода и в блоке итогов. */
  const HORIZON_TEXT = {
    week:    { summary: 'Итоги недели',   placeholder: 'цель или задача на неделю' },
    month:   { summary: 'Итоги месяца',   placeholder: 'цель или задача на месяц' },
    quarter: { summary: 'Итоги квартала', placeholder: 'цель или задача на квартал' },
    year:    { summary: 'Итоги года',     placeholder: 'цель или задача на год' },
  };

  /** Ключи периодов, которые показывает текущая вкладка. */
  const spanKeys = horizon =>
    Store.periodSpan(Store.periodKey(horizon, view.cursor), Store.spanOf(horizon));

  /**
   * Несколько периодов рядом. Разбивки на подпериоды здесь нет — она превратила бы
   * экран в стену; зато видно загрузку соседей, а ради этого окно и открывают.
   */
  function renderSpan(horizon) {
    const keys = spanKeys(horizon);
    const cols = keys.length > 2 ? 'grid--3' : 'grid--2';
    const { placeholder } = HORIZON_TEXT[horizon];
    return `<div class="grid ${cols}">${
      keys.map(key => childCardHTML(key, horizon, placeholder, true)).join('')}</div>`;
  }

  function renderWeek() {
    if (Store.spanOf('week') > 1) return renderSpan('week');
    const key = currentKey();
    const days = Store.children(key);
    return focusCardHTML(key, 'Итоги недели', 'цель или задача на неделю') +
      '<div class="section-label">Дни недели</div>' +
      `<div class="grid grid--3">${days.map(dayCardHTML).join('')}</div>`;
  }

  function renderMonth() {
    if (Store.spanOf('month') > 1) return renderSpan('month');
    const key = currentKey();
    const weeks = Store.children(key).map(w => childCardHTML(w, 'week', 'задача на неделю'));
    return focusCardHTML(key, 'Итоги месяца', 'цель или задача на месяц') +
      '<div class="section-label">Недели месяца</div>' +
      `<div class="grid grid--2">${weeks.join('')}</div>`;
  }

  function renderQuarter() {
    if (Store.spanOf('quarter') > 1) return renderSpan('quarter');
    const key = currentKey();
    const months = Store.children(key).map(m => childCardHTML(m, 'month', 'задача на месяц', true));
    return focusCardHTML(key, 'Итоги квартала', 'цель или задача на квартал') +
      '<div class="section-label">Месяцы квартала</div>' +
      `<div class="grid grid--3">${months.join('')}</div>`;
  }

  function renderYear() {
    if (Store.spanOf('year') > 1) return renderSpan('year');
    const key = currentKey();
    const quarters = Store.children(key).map(q => childCardHTML(q, 'quarter', 'задача на квартал', true));

    // Двенадцать месяцев одной сводкой: где есть задачи, а где уже записаны итоги
    const months = Array.from({ length: 12 }, (_, i) => Store.periodKey('month', `${key}-${String(i + 1).padStart(2, '0')}-01`))
      .map(mk => {
        const { done, total } = Store.stats(mk);
        const marks = [total ? `${done}/${total}` : '—', Store.summary(mk).trim() && 'итоги'].filter(Boolean);
        return `<div class="mini">
          <button class="link" data-goto="month|${mk}">${esc(Store.monthName(Store.keyStart(mk)))}</button>
          <span class="mini__count">${marks.join(' · ')}</span>
        </div>`;
      });

    return focusCardHTML(key, 'Итоги года', 'цель или задача на год') +
      '<div class="section-label">Кварталы</div>' +
      `<div class="grid grid--4">${quarters.join('')}</div>` +
      '<div class="section-label">Месяцы</div>' +
      `<div class="grid grid--2">
        <section class="card">${months.slice(0, 6).join('')}</section>
        <section class="card">${months.slice(6).join('')}</section>
      </div>`;
  }

  /* ═════════════ Обзор ═════════════ */

  /** Строка задачи в разборе хвостов: откуда она и куда её можно двинуть. */
  function attentionRowHTML(item, note) {
    const target = Store.periodKey(item.horizon, Store.today());
    return taskHTML(item.key, item.task, {
      source: { tab: tabForHorizon(item.horizon), label: note, target },
    });
  }

  /** «Висит 3 дня» — понятнее, чем дата периода, который кончился. */
  function ageLabel(days) {
    if (days <= 1) return 'вчера';
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.round(days / 7)} нед. назад`;
    return `${Math.round(days / 30)} мес. назад`;
  }

  function attentionHTML() {
    const { overdue, stuck, retros, total } = Insights.attention(Store.today());
    if (!total) {
      return '<div class="section-label">Разгрести</div>' +
        '<section class="card"><div class="empty">хвостов нет — всё разобрано</div></section>';
    }

    const blocks = [];
    if (overdue.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">Просрочено</h2>
          <div class="card__sub">период кончился, задача осталась</div>
        </div><span class="badge">${overdue.length}</span></header>
        <ul class="tasks">${overdue.map(item =>
          attentionRowHTML(item, `${Store.periodLabel(item.key)} · ${ageLabel(item.ageDays)}`)).join('')}</ul>
      </section>`);
    }
    if (stuck.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">Залипло</h2>
          <div class="card__sub">переезжает из периода в период — разрезать или снять</div>
        </div><span class="badge">${stuck.length}</span></header>
        <ul class="tasks">${stuck.map(item =>
          attentionRowHTML(item, Store.periodLabel(item.key))).join('')}</ul>
      </section>`);
    }
    if (retros.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">Итоги не записаны</h2>
          <div class="card__sub">период закончился, ретроспектива пустая</div>
        </div><span class="badge">${retros.length}</span></header>
        <ul class="retros">${retros.map(r => `<li class="mini">
          <span>${esc(Store.periodLabel(r.key))} <span class="card__sub">${esc(Store.periodSub(r.key))}</span></span>
          <button class="link" data-goto="${r.horizon}|${r.key}">написать →</button>
        </li>`).join('')}</ul>
      </section>`);
    }

    return `<div class="section-label">Разгрести · ${total}</div>
      <div class="grid grid--2">${blocks.join('')}</div>`;
  }

  /**
   * Входящие. Строка разбирается на месте: назначить период, снять или удалить.
   * Двигать по списку нечего — во входящих нет порядка, есть только «разобрать».
   */
  function inboxHTML() {
    const key = Store.INBOX_KEY;
    const list = Store.orderedTasks(key, view.category);
    const today = Store.today();
    const targets = [
      { horizon: 'day', label: 'сегодня' },
      { horizon: 'week', label: 'неделя' },
      { horizon: 'month', label: 'месяц' },
    ];

    const rows = list.map(t => {
      const actions = t.done || t.cancelled
        ? actionHTML('delete', '✕', 'Удалить')
        : targets.map(({ horizon, label }) =>
            `<button class="task__file" data-act="file" data-to="${horizon}"
                     title="Перенести: ${esc(Store.periodLabel(Store.periodKey(horizon, today)))}">${label}</button>`
          ).join('') + actionHTML('delete', '✕', 'Удалить');
      return taskHTML(key, t, { actions });
    }).join('');

    return `<div class="section-label">Входящие${list.length ? ` · ${list.length}` : ''}</div>
      <section class="card">
        ${list.length ? `<ul class="tasks">${rows}</ul>` : '<div class="empty">пусто — всё разобрано</div>'}
        <form class="add" data-key="${key}">
          <input class="add__input" data-add="${key}" type="text" autocomplete="off"
                 placeholder="пришло в голову — записать и разобрать потом">
          <button class="add__btn" type="submit" aria-label="Записать">+</button>
        </form>
      </section>`;
  }

  function renderOverview() {
    const today = Store.today();
    const [day, ...rest] = Insights.verticalKeys(today);

    const todayCard = cardHTML({
      key: day.key,
      title: 'Сегодня',
      sub: `${Store.periodLabel(day.key)}, ${Store.weekdayName(day.key)}`,
      focus: true,
      placeholder: 'задача на день',
    });
    const horizons = rest.map(({ horizon, key }) =>
      childCardHTML(key, horizon, `цель на этот период`)).join('');

    return inboxHTML() +
      '<div class="section-label">Сейчас</div>' +
      todayCard +
      `<div class="grid grid--4 grid--gap-top">${horizons}</div>` +
      attentionHTML();
  }

  const VIEWS = {
    overview: renderOverview,
    days: renderDays, week: renderWeek, month: renderMonth, quarter: renderQuarter, year: renderYear,
  };

  /* ═════════════ Каркас ═════════════ */

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(t =>
      `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab()}">${t.label}</button>`
    ).join('');
  }

  /** Логотип — вход в обзор, он же счётчик неразобранных входящих. */
  function renderBrand() {
    const waiting = Store.orderedTasks(Store.INBOX_KEY).filter(Insights.isOpen).length;
    const brand = $('#btnBrand');
    brand.classList.toggle('brand--active', isOverview());
    brand.title = waiting ? `Обзор · во входящих: ${waiting}` : 'Обзор';
    brand.innerHTML = 'life&nbsp;progress' +
      (waiting ? `<span class="brand__badge">${waiting}</span>` : '');
  }

  /** Строка меток. Пока меток нет — её нет вовсе, чтобы не занимать место зря. */
  function renderFilters() {
    const list = Store.categories();
    const box = $('#filters');
    if (!list.length) {
      box.innerHTML = '';
      box.hidden = true;
      view.category = '';
      return;
    }
    if (view.category && !list.includes(view.category)) view.category = '';   // метку стёрли вместе с задачами
    box.hidden = false;
    box.innerHTML = [{ id: '', label: 'все' }, ...list.map(c => ({ id: c, label: `#${c}` }))]
      .map(c => `<button class="chip" data-filter="${esc(c.id)}"
                         aria-pressed="${c.id === view.category}">${esc(c.label)}</button>`)
      .join('');
  }

  function renderPeriodBar() {
    const isDays = tab() === 'days';
    let title, sub;
    if (isOverview()) {
      const today = Store.today();
      title = 'Обзор';
      sub = `${Store.weekdayName(today)}, ${Store.formatDate(today, true)} · ` +
            `${Store.periodLabel(Store.periodKey('week', today))}`;
    } else if (isDays) {
      const span = Store.spanOf('day');
      title = Store.formatRange(view.cursor, Store.addDays(view.cursor, span - 1), true);
      sub = `${Store.spanLabel('day', span)} вперёд`;
    } else {
      const keys = spanKeys(horizonOf(tab()));
      const first = keys[0];
      const last = keys[keys.length - 1];
      title = Store.spanTitle(first, last);
      sub = keys.length > 1
        ? Store.formatRange(Store.keyStart(first), Store.keyEnd(last), true)
        : Store.periodSub(first);
    }
    $('#periodTitle').innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
    $('#btnPrev').innerHTML = ICONS.left;
    $('#btnNext').innerHTML = ICONS.right;

    // Обзор всегда про «сейчас» — стрелки и «Сейчас» на нём бессмысленны
    ['#btnPrev', '#btnNext', '#btnNow'].forEach(sel => { $(sel).hidden = isOverview(); });

    // Ширина окна — своя у каждого горизонта: «3 месяца» рядом, «4 недели» рядом
    const select = $('#spanSelect');
    select.hidden = isOverview();
    if (!isOverview()) {
      const horizon = horizonOf(tab());
      select.innerHTML = Store.SPAN_OPTIONS[horizon]
        .map(n => `<option value="${n}">${esc(Store.spanLabel(horizon, n))}</option>`).join('');
      select.value = String(Store.spanOf(horizon));
    }
  }

  /** Textarea итогов растёт под текст: ретроспективу не листают в окошке на три строки. */
  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.max(96, el.scrollHeight + 2)}px`;
  }

  function render() {
    renderTabs();
    renderBrand();
    renderPeriodBar();
    renderFilters();
    $('#content').innerHTML = VIEWS[tab()]();
    $$('.summary__input').forEach(autoGrow);

    if (pendingFocus) {
      const input = $(`[data-add="${pendingFocus}"]`);
      if (input) input.focus();
      pendingFocus = null;
    }
  }

  /* ═════════════ Навигация ═════════════ */

  function goTo(tabId, iso) {
    if (!VIEWS[tabId]) return;
    if (iso) view.cursor = iso;
    Store.setSetting('horizon', tabId);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Шаг навигации равен тому, что видно на экране: агенда листается целыми экранами. */
  function shift(dir) {
    const current = tab();
    if (current === 'overview')     return;
    if (current === 'days')         view.cursor = Store.addDays(view.cursor, dir * Store.spanOf('day'));
    else if (current === 'week')    view.cursor = Store.addDays(view.cursor, dir * 7);
    else if (current === 'month')   view.cursor = Store.addMonths(view.cursor, dir);
    else if (current === 'quarter') view.cursor = Store.addMonths(view.cursor, dir * 3);
    else                            view.cursor = Store.addMonths(view.cursor, dir * 12);
    render();
  }

  function jumpToNow() {
    view.cursor = Store.today();
    render();
  }

  /** Ключ периода, куда добавлять задачу после отправки формы. */
  const focusAfterRender = key => { pendingFocus = key; };

  /** Горизонт открытой вкладки — по нему выбирается ширина окна. */
  const currentHorizon = () => horizonOf(tab());

  /** Раскрыть или свернуть панель шагов у задачи. */
  function toggleSteps(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
  }

  /** Записать во входящие с любой вкладки: уводит на обзор и ставит курсор в поле. */
  function captureToInbox() {
    focusAfterRender(Store.INBOX_KEY);
    if (isOverview()) render(); else goTo(OVERVIEW);
  }

  /** Фильтр по метке: пустая строка — показывать всё. */
  function setCategory(category) {
    view.category = Store.normalizeCategory(category);
    render();
  }

  return {
    view, render, goTo, shift, jumpToNow, setCategory, captureToInbox, toggleSteps, currentHorizon,
    updateProgress, autoGrow, focusAfterRender, currentKey, esc, TABS,
  };
})();
