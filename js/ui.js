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
  const TAB_IDS = ['days', 'week', 'month', 'quarter', 'year', 'life'];
  const t = (...args) => I18N.t(...args);
  const OVERVIEW = 'overview';
  const REVIEWS = 'reviews';

  /**
   * Локальное состояние интерфейса. Курсор не сохраняется — приложение всегда
   * открывается на сегодня. Фильтр тоже: после перезагрузки спрятанные задачи
   * выглядели бы как пропавшие.
   */
  const view = { cursor: Store.today(), category: '', settingsOpen: false, singleReview: false };

  /** Задачи с раскрытой панелью шагов. Локально: раскрытие — жест, а не настройка. */
  const expanded = new Set();
  const completedOpen = new Set();

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
    more: '<svg class="ico" viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="16" cy="10" r="1.4"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 10h10m-5-5v10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    brand: '<svg class="brand__mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="m9 16 5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tick:  '<svg class="check__tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.8"/></svg>',
  };

  /* ═════════════ Мелкие блоки ═════════════ */

  /** Прогресс считается по активным задачам: отменённые в знаменатель не входят. */
  function progressOf(key) {
    const { done, active, cancelled } = Store.stats(key, view.category);
    return {
      pct: active ? Math.round(done / active * 100) : 0,
      count: `${done}/${active}`,
      title: cancelled ? t('progress.cancelled', cancelled) : '',
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
    const from = t.carriedFrom ? Store.periodLabel(t.carriedFrom.key) : '';
    const title = I18N.t('tag.carryTitle', n, from);
    if (n === 1) return tagHTML('carry', I18N.t('tag.carry', from), title);
    return tagHTML('longrun', I18N.t('tag.carryRun', n + 1, Store.keyHorizon(key)), title);
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
                    title="${esc(I18N.t('tag.parentTitle', parent.task.text, Store.periodLabel(parent.key)))}"
            >↳ ${esc(parent.task.text)}</button>`;
  }

  /** Тег с прогрессом по шагам. Он же кнопка: раскрывает панель шагов. */
  function stepsTagHTML(t) {
    const { done, active } = Store.subtaskStats(t.id);
    if (!active && !done) return '';
    return `<button class="tag tag--steps" data-act="steps"
                    title="${esc(I18N.t('tag.stepsTitle'))}">${esc(I18N.t('tag.steps', done, active))}</button>`;
  }

  /** Кнопка действия над задачей. */
  const actionHTML = (act, label, neighbour) =>
    `<button type="button" class="task__action" data-act="${act}"${neighbour ? ` data-neighbour="${esc(neighbour.id)}"` : ''}>${esc(label)}</button>`;

  const actionsHTML = actions => `<details class="task__actions">
    <summary class="task__more" aria-label="${esc(t('task.actions'))}" title="${esc(t('task.actions'))}">${ICONS.more}</summary>
    <div class="task__action-list">${actionHTML('edit', t('task.edit'))}${actions}</div>
  </details>`;

  /**
   * Строка задачи. Набор действий зависит от состояния: закрытую задачу
   * незачем переносить, а отменённую — помечать важной. Вызывающий может
   * задать свой набор через opts.actions — так делают входящие.
   */
  function taskHTML(key, t, { up, down, source, actions: customActions } = {}) {
    const cls = [
      'task',
      t.done && 'task--done',
      t.cancelled && 'task--cancelled',
      t.important && Insights.isOpen(t) && 'task--important',
    ].filter(Boolean).join(' ');

    const tags = [
      t.category ? `<button class="tag tag--category" data-filter="${esc(t.category)}"
                            title="${esc(I18N.t('tag.categoryTitle', t.category))}">#${esc(t.category)}</button>` : '',
      carryTagHTML(key, t),
      parentTagHTML(t),
      stepsTagHTML(t),
      t.cancelled ? tagHTML('cancelled', I18N.t('tag.cancelled'), I18N.t('tag.cancelledTitle')) : '',
      source ? `<button class="tag tag--source" data-goto="${source.tab}|${key}"
                        title="${esc(I18N.t('tag.openPeriod'))}">${esc(source.label)}</button>` : '',
    ].join('');

    // На дашборде задачу не двигают по списку — её разбирают: сюда, снять или удалить
    const actions = customActions !== undefined ? customActions : source ? [
      actionHTML('today', I18N.t('act.moveTo', Store.periodLabel(source.target))),
      actionHTML('cancel', I18N.t('act.cancel')),
      actionHTML('delete', I18N.t('act.delete')),
    ].join('') : [
      up ? actionHTML('up', I18N.t('act.up'), up) : '',
      down ? actionHTML('down', I18N.t('act.down'), down) : '',
      !t.done && !t.cancelled && Store.nextKey(key)      // у «жизни» следующего периода нет
        ? actionHTML('carry', I18N.t('act.moveTo', Store.periodLabel(Store.nextKey(key)))) : '',
      !t.done && !t.cancelled ? actionHTML('star', I18N.t(t.important ? 'act.unstar' : 'act.star')) : '',
      !t.cancelled ? actionHTML('steps', I18N.t('act.steps')) : '',
      t.cancelled
        ? actionHTML('cancel', I18N.t('act.restore'))
        : (!t.done ? actionHTML('cancel', I18N.t('act.cancel')) : ''),
      actionHTML('delete', I18N.t('act.delete')),
    ].join('');

    const step = !source && Store.keyHorizon(key) === 'year' && Insights.isOpen(t) ? Insights.nextStep(t.id) : null;
    const next = step ? `<button type="button" class="task__next" data-go-task="${esc(step.task.id)}">
      <span class="task__next-label">${esc(I18N.t('steps.next'))}</span>
      <span>${esc(step.task.text)}</span>
      <span class="task__next-period">${esc(Store.periodLabel(step.key))} →</span>
    </button>` : '';
    return `<li class="${cls}" data-key="${key}" data-id="${esc(t.id)}">
      <button class="check" data-act="toggle" aria-pressed="${t.done}" aria-label="${esc(I18N.t('task.done'))}">${ICONS.tick}</button>
      <span class="task__text" data-act="edit" title="${esc(I18N.t('task.edit'))}">${esc(t.text)}${tags}</span>
      ${actionsHTML(actions)}
      ${next}
    </li>`;
  }

  /**
   * Шаг цели в её списке. Живёт в своём периоде, поэтому data-key указывает туда:
   * галочка и удаление работают над настоящей задачей, а не над копией.
   */
  function stepRowHTML(stepKey, t, showParent) {
    const cls = ['task', 'task--step', t.done && 'task--done', t.cancelled && 'task--cancelled']
      .filter(Boolean).join(' ');
    return `<li class="${cls}" data-key="${stepKey}" data-id="${esc(t.id)}">
      <button class="check" data-act="toggle" aria-pressed="${t.done}" aria-label="${esc(I18N.t('task.done'))}">${ICONS.tick}</button>
      <span class="task__text" data-act="edit" title="${esc(I18N.t('task.edit'))}">${esc(t.text)}
        ${showParent ? parentTagHTML(t) : ''}
        <button class="tag tag--source" data-goto="${gotoAttr(stepKey)}"
                title="${esc(I18N.t('tag.openPeriod'))}">${esc(Store.periodLabel(stepKey))}</button>
      </span>
      ${actionsHTML(actionHTML('unlink', I18N.t('act.unlink')))}
    </li>`;
  }

  const rowsHTML = rows => rows.length ? `<ul class="tasks">${rows.join('')}</ul>` : '';

  function completedHTML(key, rows) {
    if (!rows.length) return '';
    return `<details class="completed" data-completed="${key}"${completedOpen.has(key) ? ' open' : ''}>
      <summary class="completed__toggle">${ICONS.right} ${esc(t('task.completed', rows.length))}</summary>
      ${rowsHTML(rows)}
    </details>`;
  }

  function rememberCompleted(root) {
    root.querySelectorAll('[data-completed]').forEach(el => {
      if (el.open) completedOpen.add(el.dataset.completed);
      else completedOpen.delete(el.dataset.completed);
    });
  }

  /** Панель под задачей: добавить шаг и выбрать, частью какой цели она сама является. */
  function stepPanelHTML(key, t) {
    const today = Store.today();
    const targets = FILE_TARGETS();
    const options = Store.goalCandidates(t.id).map(({ key: goalKey, task }) =>
      `<option value="${task.id}"${task.id === t.parentId ? ' selected' : ''}
       >${esc(Store.periodLabel(goalKey))} · ${esc(task.text)}</option>`).join('');

    return `<li class="steps-panel" data-key="${key}" data-id="${t.id}">
      <div class="steps-panel__row">
        <input class="add__input" data-step="${t.id}" type="text" autocomplete="off" placeholder="${esc(I18N.t('steps.placeholder'))}">
        ${targets.map(({ horizon, label }) => `<button class="task__file" data-act="step" data-to="${horizon}"
                 title="${esc(I18N.t('steps.into', Store.periodLabel(Store.periodKey(horizon, today))))}">${esc(label)}</button>`).join('')}
      </div>
      <label class="steps-panel__row steps-panel__link">
        ${esc(I18N.t('steps.parent'))}
        <select class="select" data-act="link">
          <option value="">${esc(I18N.t('steps.none'))}</option>
          ${options}
        </select>
      </label>
    </li>`;
  }

  /**
   * @param {object} [opts] compact — без стрелок порядка: в окне сравнения периодов
   *   задачи двигают между периодами, а не внутри списка, а место под иконки
   *   в узкой карточке дороже
   */
  function taskListHTML(key, placeholder, opts = {}) {
    const list = Store.orderedTasks(key, view.category);
    const own = new Set(list.map(t => t.id));
    const today = key === Store.today();
    const pinned = task => today && task.important && Insights.isOpen(task);
    // У цели показываем один уровень шагов. Более глубокие задачи остаются отдельными строками.
    const roots = new Set(list.filter(task => pinned(task) || !own.has(task.parentId)).map(task => task.id));
    const top = list.filter(task => roots.has(task.id) || !roots.has(task.parentId));
    const topIds = new Set(top.map(task => task.id));
    const sortGroup = task => task.cancelled ? 3 : task.done ? 2 : pinned(task) ? 0 : 1;
    const peers = [[], [], [], []];
    const groups = [[], [], [], []];
    top.forEach(task => peers[sortGroup(task)].push(task));

    // Важные и обычные строки могут чередоваться в сохранённом порядке.
    peers.forEach((tasks, group) => tasks.forEach((task, index) => {
      const neighbours = opts.compact ? {} : { up: tasks[index - 1], down: tasks[index + 1] };
      groups[group].push(taskHTML(key, task, neighbours) + (expanded.has(task.id) ? stepPanelHTML(key, task) : ''));
      for (const step of Store.subtasks(task.id)) {
        if (step.key === key && topIds.has(step.task.id)) continue;
        const stepGroup = step.task.cancelled ? 3 : step.task.done ? 2 : 1;
        groups[stepGroup].push(stepRowHTML(step.key, step.task, stepGroup !== group));
      }
    }));

    const body = top.length
      ? rowsHTML(groups[0].concat(groups[1])) + completedHTML(key, groups[2]) + rowsHTML(groups[3])
      : `<div class="empty">${esc(view.category ? t('empty.filtered', view.category) : t('empty'))}</div>`;

    const base = placeholder || t('add.task');
    const hint = view.category ? `${base} · #${view.category}` : base;
    return `${body}
      <form class="add" data-key="${key}">
        <input class="add__input" data-add="${key}" type="text" autocomplete="off"
               placeholder="${esc(hint)}" aria-label="${esc(hint)}">
        <button class="add__btn" type="submit" aria-label="${esc(t('task.add'))}">${ICONS.plus}</button>
      </form>`;
  }

  function summaryHTML(key, label) {
    return `<div class="summary">
      <label class="summary__label" for="sum-${key}">${esc(label)}</label>
      <textarea class="summary__input" id="sum-${key}" data-summary="${key}"
                placeholder="${esc(t('summary.placeholder'))}">${esc(Store.summary(key))}</textarea>
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
      ${taskListHTML(o.key, o.placeholder, { compact: o.compact })}
      ${o.summaryLabel ? summaryHTML(o.key, o.summaryLabel) : ''}
      ${o.excerpt ? excerptHTML(o.key) : ''}
    </section>`;
  }

  function dayCardHTML(iso) {
    const isToday = iso === Store.today();
    return cardHTML({
      key: iso,
      title: Store.periodLabel(iso),
      sub: Store.weekdayName(iso) + (isToday ? t('today.mark') : ''),
      cls: [isToday && 'card--today', Store.isWeekend(iso) && 'card--weekend'].filter(Boolean).join(' '),
      placeholder: t('add.day'),
    });
  }

  /** Карточка-обзор подпериода: заголовок кликабелен и уводит в его собственный вид. */
  const childCardHTML = (key, goTo, placeholder, excerpt, compact) => cardHTML({
    key,
    title: Store.periodLabel(key),
    sub: Store.periodSub(key),
    goTo, placeholder, excerpt, compact,
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
  const HORIZON_TEXT = horizon => ({ summary: t(`summary.${horizon}`), placeholder: t(`add.${horizon}`) });

  /** Куда разбирают входящие и кладут новые шаги: три ближайших из видимых горизонтов. */
  const FILE_TARGETS = () => Store.visibleHorizons().slice(0, 3)
    .map(horizon => ({ horizon, label: t(`target.${horizon}`) }));

  /** Ключи периодов, которые показывает текущая вкладка. */
  const spanSize = horizon => view.singleReview ? 1 : Store.spanOf(horizon);
  const spanKeys = horizon => Store.periodSpan(Store.periodKey(horizon, view.cursor), spanSize(horizon));

  /**
   * Несколько периодов рядом. Разбивки на подпериоды здесь нет — она превратила бы
   * экран в стену; зато видно загрузку соседей, а ради этого окно и открывают.
   */
  function renderSpan(horizon) {
    const keys = spanKeys(horizon);
    const { placeholder } = HORIZON_TEXT(horizon);
    return `<div class="grid span-grid">${
      keys.map(key => childCardHTML(key, horizon, placeholder, true, true)).join('')}</div>`;
  }

  function renderWeek() {
    if (spanSize('week') > 1) return renderSpan('week');
    const key = currentKey();
    const days = Store.children(key);
    return focusCardHTML(key, t('summary.week'), t('add.week')) +
      (Store.isVisible('day')
        ? `<div class="section-label">${esc(t('section.days'))}</div>` +
          `<div class="grid grid--3">${days.map(dayCardHTML).join('')}</div>`
        : '');
  }

  function renderMonth() {
    if (spanSize('month') > 1) return renderSpan('month');
    const key = currentKey();
    // Итоги недели видны и отсюда: месяц читают как сумму недель
    const weeks = Store.children(key).map(w => childCardHTML(w, 'week', t('add.childWeek'), true));
    return focusCardHTML(key, t('summary.month'), t('add.month')) +
      (Store.isVisible('week')
        ? `<div class="section-label">${esc(t('section.weeks'))}</div>` +
          `<div class="grid grid--2">${weeks.join('')}</div>`
        : '');
  }

  function renderQuarter() {
    if (spanSize('quarter') > 1) return renderSpan('quarter');
    const key = currentKey();
    const months = Store.children(key).map(m => childCardHTML(m, 'month', t('add.childMonth'), true));
    return focusCardHTML(key, t('summary.quarter'), t('add.quarter')) +
      (Store.isVisible('month')
        ? `<div class="section-label">${esc(t('section.months'))}</div>` +
          `<div class="grid grid--3">${months.join('')}</div>`
        : '');
  }

  function renderYear() {
    if (spanSize('year') > 1) return renderSpan('year');
    const key = currentKey();
    const quarters = Store.children(key).map(q => childCardHTML(q, 'quarter', t('add.childQuarter'), true));

    // Двенадцать месяцев одной сводкой: где есть задачи, а где уже записаны итоги
    const months = Array.from({ length: 12 }, (_, i) => Store.periodKey('month', `${key}-${String(i + 1).padStart(2, '0')}-01`))
      .map(mk => {
        const { done, total } = Store.stats(mk);
        const marks = [total ? `${done}/${total}` : '—'].filter(Boolean);
        return `<div class="mini mini--block">
          <div class="mini__row">
            <button class="link" data-goto="month|${mk}">${esc(Store.monthName(Store.keyStart(mk)))}</button>
            <span class="mini__count">${marks.join(' · ')}</span>
          </div>
          ${excerptHTML(mk)}
        </div>`;
      });

    return focusCardHTML(key, t('summary.year'), t('add.year')) +
      (Store.isVisible('quarter')
        ? `<div class="section-label">${esc(t('section.quarters'))}</div>` +
          `<div class="grid grid--4">${quarters.join('')}</div>`
        : '') +
      (Store.isVisible('month')
        ? `<div class="section-label">${esc(t('section.monthsOfYear'))}</div>` +
          `<div class="grid grid--2">
            <section class="card">${months.slice(0, 6).join('')}</section>
            <section class="card">${months.slice(6).join('')}</section>
          </div>`
        : '');
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
    if (days <= 1) return t('age.yesterday');
    if (days < 7) return t('age.days', days);
    if (days < 30) return t('age.weeks', Math.round(days / 7));
    return t('age.months', Math.round(days / 30));
  }

  function attentionHTML() {
    const { overdue, stuck, retros, total } = Insights.attention(Store.today());
    if (!total) {
      return `<h2 class="section-label">${esc(t('section.attention'))}</h2>` +
        `<section class="card"><div class="empty">${esc(t('attention.none'))}</div></section>`;
    }

    const blocks = [];
    if (overdue.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">${esc(t('attention.overdue'))}</h2>
          <div class="card__sub">${esc(t('attention.overdueSub'))}</div>
        </div><span class="badge">${overdue.length}</span></header>
        <ul class="tasks">${overdue.map(item =>
          attentionRowHTML(item, `${Store.periodLabel(item.key)} · ${ageLabel(item.ageDays)}`)).join('')}</ul>
      </section>`);
    }
    if (stuck.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">${esc(t('attention.stuck'))}</h2>
          <div class="card__sub">${esc(t('attention.stuckSub'))}</div>
        </div><span class="badge">${stuck.length}</span></header>
        <ul class="tasks">${stuck.map(item =>
          attentionRowHTML(item, Store.periodLabel(item.key))).join('')}</ul>
      </section>`);
    }
    if (retros.length) {
      blocks.push(`<section class="card">
        <header class="card__head"><div>
          <h2 class="card__title">${esc(t('attention.retros'))}</h2>
          <div class="card__sub">${esc(t('attention.retrosSub'))}</div>
        </div><span class="badge">${retros.length}</span></header>
        <ul class="retros">${retros.map(r => `<li class="mini">
          <span>${esc(Store.periodLabel(r.key))} <span class="card__sub">${esc(Store.periodSub(r.key))}</span></span>
          <button class="link" data-go-review="${r.key}">${esc(t('attention.write'))}</button>
        </li>`).join('')}</ul>
      </section>`);
    }

    return `<h2 class="section-label">${esc(t('section.attention'))} · ${total}</h2>
      <div class="grid grid--2">${blocks.join('')}</div>`;
  }

  /**
   * Входящие. Строка разбирается на месте: назначить период, снять или удалить.
   * Двигать по списку нечего — во входящих нет порядка, есть только «разобрать».
   */
  function inboxItemsHTML() {
    const key = Store.INBOX_KEY;
    const list = Store.orderedTasks(key, view.category);
    const today = Store.today();
    const targets = FILE_TARGETS();

    const rows = [];
    const done = [];
    const cancelled = [];
    list.forEach(task => {
      const actions = task.done || task.cancelled
        ? actionHTML('delete', t('act.delete'))
        : targets.map(({ horizon }) =>
            `<button type="button" class="task__action" data-act="file" data-to="${horizon}">
               ${esc(t('act.moveTo', Store.periodLabel(Store.periodKey(horizon, today))))}</button>`
          ).join('') + actionHTML('delete', t('act.delete'));
      const group = task.done ? done : task.cancelled ? cancelled : rows;
      group.push(taskHTML(key, task, { actions }));
    });

    return `<header class="card__head">
        <h2 class="card__title">${esc(t('section.inbox'))}</h2>
        ${list.length ? `<span class="badge">${list.length}</span>` : ''}
      </header>
      ${list.length ? rowsHTML(rows) + completedHTML(key, done) + rowsHTML(cancelled) : `<div class="empty">${esc(t('inbox.empty'))}</div>`}`;
  }

  function inboxHTML() {
    const key = Store.INBOX_KEY;
    return `<section class="card card--inbox">
        <div id="inboxItems">${inboxItemsHTML()}</div>
        <form class="add" data-key="${key}">
          <input class="add__input" data-add="${key}" type="text" autocomplete="off"
                 placeholder="${esc(t('inbox.placeholder'))}" aria-label="${esc(t('inbox.placeholder'))}">
          <button class="add__btn" type="submit" aria-label="${esc(t('inbox.capture'))}">${ICONS.plus}</button>
        </form>
      </section>`;
  }

  function renderOverview() {
    const today = Store.today();
    const keys = Insights.verticalKeys(today).filter(({ horizon }) => Store.isVisible(horizon));
    const day = keys.find(k => k.horizon === 'day');
    const rest = keys.filter(k => k.horizon !== 'day');

    const todayCard = day ? cardHTML({
      key: day.key,
      title: t('today'),
      sub: `${Store.periodLabel(day.key)}, ${Store.weekdayName(day.key)}`,
      cls: 'card--today',
      focus: true,
      placeholder: t('add.day'),
    }) : '';
    const horizons = rest.map(({ horizon, key }) =>
      childCardHTML(key, horizon, t('add.period'), true)).join('');

    return `<div class="grid overview-top${day ? ' overview-top--split' : ''}">${todayCard}${inboxHTML()}</div>` +
      (horizons ? `<h2 class="section-label">${esc(t('section.now'))}</h2>
        <div class="grid grid--3">${horizons}</div>` : '') +
      attentionHTML();
  }

  /** Цели без срока: одна карточка, без разбивки — делить жизнь на подпериоды нечего. */
  function renderLife() {
    return focusCardHTML(Store.LIFE_KEY, t('summary.life'), t('add.life'));
  }

  function renderReviews() {
    const keys = Insights.recentReviews();
    if (!keys.length) return `<div class="card empty">${esc(t('reviews.empty'))}</div>`;
    return `<div class="grid grid--2">${keys.map(key => {
      const dates = Store.periodSub(key);
      return `<article class="card review">
        <h2><button type="button" class="link card__title" data-go-review="${key}">${esc(Store.periodLabel(key))} →</button></h2>
        ${dates ? `<p class="card__sub">${esc(dates)}</p>` : ''}
        ${excerptHTML(key)}
      </article>`;
    }).join('')}</div>`;
  }

  const VIEWS = {
    overview: renderOverview,
    reviews: renderReviews,
    life: renderLife,
    days: renderDays, week: renderWeek, month: renderMonth, quarter: renderQuarter, year: renderYear,
  };

  /* ═════════════ Каркас ═════════════ */

  function renderTabs() {
    $('#tabs').innerHTML = TAB_IDS.filter(id => Store.isVisible(horizonOf(id))).map(id =>
      `<button class="tab" role="tab" data-tab="${id}" aria-selected="${id === tab()}">${esc(t(`tab.${id}`))}</button>`
    ).join('');
    $('#btnReviews').setAttribute('aria-current', String(tab() === REVIEWS));
  }

  /** Полоса настроек: чекбокс на каждый горизонт. Последний оставшийся выключить нельзя. */
  function renderSettings() {
    const box = $('#settings');
    box.hidden = !view.settingsOpen;
    if (!view.settingsOpen) return;
    const single = Store.visibleHorizons().length === 1;
    $('#settingsViews').innerHTML = `<span class="settings__label">${esc(t('settings'))}</span>` +
      Store.HORIZONS.map(h => {
        const on = Store.isVisible(h);
        const locked = on && single;
        return `<label class="chip chip--check${on ? ' chip--on' : ''}"${locked ? ` title="${esc(t('settings.last'))}"` : ''}>
          <input type="checkbox" data-visible="${h}"${on ? ' checked' : ''}${locked ? ' disabled' : ''}>
          ${esc(t(`tab.${tabForHorizon(h)}`))}
        </label>`;
      }).join('') +
      `<span class="settings__hint">${esc(t('settings.hint'))}</span>`;
  }

  /**
   * Статичная разметка index.html: подписи кнопок, подсказки, подвал, заголовок вкладки.
   * Элементы помечены data-i18n / data-i18n-title и переводятся здесь, а не в HTML.
   */
  function renderStatic() {
    document.documentElement.lang = I18N.lang;
    document.title = t('app.title');
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = t('app.description');
    $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    $$('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(el.dataset.i18nTitle));
    });
    const langSelect = $('#langSelect');
    langSelect.title = t('lang.title');
    langSelect.innerHTML = I18N.LANGS.map(code =>
      `<option value="${code}">${esc(I18N.name(code))}</option>`).join('');
    langSelect.value = I18N.lang;
    const settingsBtn = $('#btnSettings');
    settingsBtn.setAttribute('aria-expanded', String(view.settingsOpen));
  }

  /** Состояние автосохранения в файл. Где API нет — кнопки нет вовсе. */
  const FILE_LABELS = () => ({
    off:                 { text: t('file.off'),   title: t('file.offTitle') },
    'needs-permission':  { text: t('file.perm'),  title: t('file.permTitle') },
    error:               { text: t('file.error'), title: t('file.errorTitle') },
  });
  let lastFileState = { supported: false, status: 'off', fileName: '' };

  function renderFileSync(fileState) {
    lastFileState = fileState;                 // при смене языка кнопку перерисуем тем же состоянием
    const btn = $('#btnFile');
    btn.hidden = !fileState.supported;
    if (!fileState.supported) return;

    if (fileState.status === 'on') {
      btn.textContent = fileState.fileName || t('file.fallback');
      btn.title = t('file.onTitle', fileState.fileName);
      btn.classList.add('btn--on');
    } else {
      const labels = FILE_LABELS();
      const label = labels[fileState.status] || labels.off;
      btn.textContent = label.text;
      btn.title = label.title;
      btn.classList.remove('btn--on');
    }
  }

  /** Логотип — вход в обзор, он же счётчик неразобранных входящих. */
  function renderBrand() {
    const waiting = Store.orderedTasks(Store.INBOX_KEY).filter(Insights.isOpen).length;
    const brand = $('#btnBrand');
    brand.classList.toggle('brand--active', isOverview());
    brand.title = waiting ? t('overview.inbox', waiting) : t('overview');
    brand.innerHTML = ICONS.brand + esc(t('app.brand')) +
      (waiting ? `<span class="brand__badge">${waiting}</span>` : '');
  }

  /** Строка меток. Пока меток нет — её нет вовсе, чтобы не занимать место зря. */
  function renderFilters() {
    const box = $('#filters');
    if (tab() === REVIEWS) { box.hidden = true; return; }
    const list = Store.categories();
    if (!list.length) {
      box.innerHTML = '';
      box.hidden = true;
      view.category = '';
      return;
    }
    if (view.category && !list.includes(view.category)) view.category = '';   // метку стёрли вместе с задачами
    box.hidden = false;
    box.innerHTML = [{ id: '', label: t('filters.all') }, ...list.map(c => ({ id: c, label: `#${c}` }))]
      .map(c => `<button class="chip" data-filter="${esc(c.id)}"
                         aria-pressed="${c.id === view.category}">${esc(c.label)}</button>`)
      .join('');
  }

  function renderPeriodBar() {
    const isDays = tab() === 'days';
    let title, sub;
    if (tab() === REVIEWS) {
      title = t('reviews.title');
    } else if (isOverview()) {
      const today = Store.today();
      title = t('overview');
      sub = `${Store.weekdayName(today)}, ${Store.formatDate(today, true)} · ` +
            `${Store.periodLabel(Store.periodKey('week', today))}`;
    } else if (isDays) {
      const span = Store.spanOf('day');
      title = Store.formatRange(view.cursor, Store.addDays(view.cursor, span - 1), true);
      sub = t('nav.ahead', Store.spanLabel('day', span));
    } else {
      const keys = spanKeys(horizonOf(tab()));
      const first = keys[0];
      const last = keys[keys.length - 1];
      title = Store.spanTitle(first, last);
      sub = keys.length > 1
        ? Store.formatRange(Store.keyStart(first), Store.keyEnd(last), true)
        : Store.periodSub(first);
    }
    $('#periodTitle').innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    $('#btnPrev').innerHTML = ICONS.left;
    $('#btnNext').innerHTML = ICONS.right;

    // Обзор — всегда про «сейчас», у «жизни» нет соседних периодов: стрелки и окно там бессмысленны
    const timeless = isOverview() || tab() === REVIEWS || !Store.nextKey(currentKey());
    ['#btnPrev', '#btnNext', '#btnNow'].forEach(sel => { $(sel).hidden = timeless; });

    // Ширина окна — своя у каждого горизонта: «3 месяца» рядом, «4 недели» рядом
    const select = $('#spanSelect');
    select.hidden = timeless;
    if (!timeless) {
      const horizon = horizonOf(tab());
      select.innerHTML = Store.SPAN_OPTIONS[horizon]
        .map(n => `<option value="${n}">${esc(Store.spanLabel(horizon, n))}</option>`).join('');
      select.value = String(spanSize(horizon));
    }
  }

  /** Textarea итогов растёт под текст: ретроспективу не листают в окошке на три строки. */
  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.max(96, el.scrollHeight + 2)}px`;
  }

  function render() {
    // Считываем раскрытие перед заменой DOM, даже если событие toggle ещё в очереди.
    rememberCompleted($('#content'));
    renderStatic();
    renderTabs();
    renderSettings();
    renderBrand();
    renderFileSync(lastFileState);
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

  function goTo(tabId, iso, target) {
    if (!VIEWS[tabId]) return;
    if (iso) view.cursor = iso;
    view.singleReview = Boolean(target?.summary);
    Store.setSetting('horizon', tabId);
    render();
    if (target?.summary) {
      const field = $(`[data-summary="${target.summary}"]`);
      if (field) { reveal(field); return; }
    }
    if (target?.task) {
      const { key, task } = target.task;
      const row = taskRow(key, task.id);
      if (row) {
        const completed = row.closest('[data-completed]');
        if (completed) completed.open = true;
        reveal(row.querySelector('.check'));
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const taskRow = (key, id) => $$('.task').find(row => row.dataset.key === key && row.dataset.id === id);

  function reveal(element) {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'center' });
  }

  function goToTask(id) {
    const item = Store.findTask(id);
    if (!item || item.key === Store.INBOX_KEY) return;
    if (view.category && view.category !== item.task.category) view.category = '';
    goTo(tabForHorizon(Store.keyHorizon(item.key)), Store.keyStart(item.key), { task: item });
  }

  function goToReview(key) {
    const horizon = Store.keyHorizon(key);
    if (Store.RETRO_HORIZONS.includes(horizon)) goTo(horizon, Store.keyStart(key), { summary: key });
  }

  /** Шаг навигации равен тому, что видно на экране: агенда листается целыми экранами. */
  function shift(dir) {
    const current = tab();
    if (current === OVERVIEW || current === REVIEWS) return;
    if (current !== 'days' && !Store.nextKey(currentKey())) return;   // «жизнь» не листается
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

  function toggleSettings() {
    view.settingsOpen = !view.settingsOpen;
    render();
  }

  /** Скрыть или показать горизонт. Если спрятали вкладку, на которой стоим, — уходим на обзор. */
  function setVisible(horizon, value) {
    if (!Store.setVisible(horizon, value)) { render(); return; }
    if (!value && horizonOf(tab()) === horizon) { goTo(OVERVIEW); return; }
    render();
  }

  /** Смена языка: словарь, настройка и полная перерисовка. */
  function setLang(next) {
    if (Store.setLang(next)) render();
  }

  function setSpan(size) {
    view.singleReview = false;
    Store.setSpan(horizonOf(tab()), size);
    render();
  }

  /** Раскрыть или свернуть панель шагов у задачи. */
  function toggleSteps(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
  }

  /** Обновляем только входящие и метки, чтобы не стереть черновик в текущем виде. */
  function refreshInbox(task) {
    renderBrand();
    if (task.category && !$$('#filters [data-filter]').some(chip => chip.dataset.filter === task.category)) renderFilters();
    if (isOverview()) {
      const items = $('#inboxItems');
      rememberCompleted(items);
      items.innerHTML = inboxItemsHTML();
    }
  }

  /** Фильтр по метке: пустая строка — показывать всё. */
  function setCategory(category) {
    view.category = Store.normalizeCategory(category);
    render();
  }

  return {
    view, render, goTo, goToTask, goToReview, taskRow, shift, jumpToNow, setCategory, refreshInbox, toggleSteps, setSpan,
    renderFileSync, setLang, toggleSettings, setVisible,
    updateProgress, autoGrow, focusAfterRender, currentKey, esc, TAB_IDS,
  };
})();
