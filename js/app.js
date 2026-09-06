/* ============================================================
   app.js — обработчики событий и старт приложения.
   Рендер живёт в ui.js, данные — в store.js.

   Всё внутри #content работает на делегировании: вид перерисовывается
   целиком, и вешать слушатели на каждую задачу было бы бессмысленно.
   ============================================================ */
(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const content = $('#content');
  const t = (...args) => I18N.t(...args);

  $('#btnSettings').addEventListener('click', () => UI.toggleSettings());
  $('#settings').addEventListener('change', e => {
    const box = e.target.closest('[data-visible]');
    if (box) UI.setVisible(box.dataset.visible, box.checked);
  });

  $('#langSelect').addEventListener('change', e => UI.setLang(e.target.value));

  /* ═════════════ Вкладки и навигация по времени ═════════════ */

  $('#btnBrand').addEventListener('click', () => UI.goTo('overview'));

  $('#tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (btn) UI.goTo(btn.dataset.tab);
  });

  $('#btnPrev').addEventListener('click', () => UI.shift(-1));
  $('#btnNext').addEventListener('click', () => UI.shift(1));
  $('#btnNow').addEventListener('click', () => UI.jumpToNow());

  $('#filters').addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (chip) UI.setCategory(chip.dataset.filter);
  });

  // Ширина окна: сколько периодов текущего горизонта показывать рядом
  $('#spanSelect').addEventListener('change', e => {
    Store.setSpan(UI.currentHorizon(), Number(e.target.value));
    UI.render();
  });

  /* ═════════════ Задачи ═════════════ */

  content.addEventListener('click', e => {
    const jump = e.target.closest('[data-goto]');
    if (jump) {
      const [tabId, key] = jump.dataset.goto.split('|');
      UI.goTo(tabId, Store.keyStart(key));
      return;
    }

    // Метка внутри задачи включает фильтр. Проверяется раньше data-act:
    // тег лежит внутри текста, а текст по клику уходит в правку
    const tag = e.target.closest('[data-filter]');
    if (tag) {
      UI.setCategory(tag.dataset.filter);
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    // Кнопки панели шагов лежат вне строки задачи, но знают её ключ и id
    const li = btn.closest('.task, .steps-panel');
    if (!li) return;
    const { key, id } = li.dataset;

    switch (btn.dataset.act) {
      case 'toggle': {
        const task = Store.toggleTask(key, id);
        if (!task) return;
        // Сделал сразу — входящее не остаётся во входящих, а ложится в сегодняшний день
        if (key === Store.INBOX_KEY && task.done) {
          Store.fileTask(key, id, Store.periodKey('day', Store.today()));
        }
        // Сначала докручиваем галочку на месте, и только потом задача уезжает вниз:
        // мгновенная перерисовка съела бы анимацию
        li.classList.toggle('task--done', task.done);
        btn.setAttribute('aria-pressed', String(task.done));
        UI.updateProgress(key);
        renderAfterAnimation();
        break;
      }
      case 'star': {
        const task = Store.toggleImportant(key, id);
        if (task) li.classList.toggle('task--important', task.important);
        break;
      }
      case 'cancel':
        Store.toggleCancelled(key, id);
        UI.render();
        break;
      case 'carry':
        Store.carryTask(key, id);
        UI.render();
        break;
      case 'today':
        // Разбор хвостов: задача переезжает в текущий период своего горизонта
        Store.carryTask(key, id, Store.periodKey(Store.keyHorizon(key), Store.today()));
        UI.render();
        break;
      case 'file':
        // Разбор входящего: ему впервые назначается период
        Store.fileTask(key, id, Store.periodKey(btn.dataset.to, Store.today()));
        UI.render();
        break;
      case 'up':
        Store.moveTask(key, id, -1);
        UI.render();
        break;
      case 'down':
        Store.moveTask(key, id, 1);
        UI.render();
        break;
      case 'steps':
        UI.toggleSteps(id);
        break;
      case 'unlink':
        // Убираем из шагов, но не из жизни: задача остаётся в своём периоде
        Store.setParent(key, id, null);
        UI.render();
        break;
      case 'step': {
        // Новый шаг заводится сразу в выбранном периоде и привязывается к цели
        const input = btn.closest('.steps-panel').querySelector('[data-step]');
        const stepKey = Store.periodKey(btn.dataset.to, Store.today());
        const step = Store.addTask(stepKey, input.value, UI.view.category);
        if (step) Store.setParent(stepKey, step.id, id);
        UI.render();
        break;
      }
      case 'delete':
        Store.deleteTask(key, id);
        UI.render();
        break;
      case 'edit':
        startEdit(li.querySelector('.task__text'), key, id);
        break;
    }
  });

  /** Перерисовка после анимации галочки. Быстрые клики подряд не копят таймеры. */
  const ANIMATION_MS = 220;
  let animationTimer = null;
  function renderAfterAnimation() {
    clearTimeout(animationTimer);
    animationTimer = setTimeout(() => {
      // Правка задачи важнее: не выдёргиваем поле из-под рук
      if (!content.querySelector('.task__edit')) UI.render();
    }, ANIMATION_MS);
  }

  /**
   * Правка задачи на месте: текст подменяется полем ввода.
   * Enter и потеря фокуса сохраняют, Escape отменяет, пустая строка удаляет задачу.
   */
  function startEdit(span, key, id) {
    const task = Store.taskById(key, id);
    if (!task) return;

    const input = document.createElement('input');
    input.className = 'task__edit';
    input.value = Store.taskInputValue(task);   // вместе с меткой: её правят там же, в строке
    span.replaceWith(input);
    input.focus();
    input.select();

    let closed = false;
    const finish = commit => {
      if (closed) return;
      closed = true;
      if (commit) Store.updateTask(key, id, { text: input.value });
      UI.render();
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')       { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ═════════════ Добавление задач ═════════════ */

  function submitAdd(input) {
    if (!input || !input.value.trim()) return;
    const key = input.dataset.add;
    Store.addTask(key, input.value, UI.view.category);   // фильтр включён — метка проставляется сама
    UI.focusAfterRender(key);      // курсор остаётся в том же поле: задачи добавляют пачками
    UI.render();
  }

  content.addEventListener('submit', e => {
    const form = e.target.closest('.add');
    if (!form) return;
    e.preventDefault();
    submitAdd(form.querySelector('.add__input'));
  });

  // Enter обрабатываем и напрямую: в песочницах (iframe без allow-forms)
  // неявная отправка формы не срабатывает
  content.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.add__input');
    if (!input) return;
    e.preventDefault();
    // В панели шагов Enter кладёт шаг в сегодняшний день — самый частый выбор
    if (input.dataset.step) input.closest('.steps-panel').querySelector('[data-to="day"]').click();
    else submitAdd(input);
  });

  /* ═════════════ Итоги ═════════════ */

  content.addEventListener('change', e => {
    const select = e.target.closest('[data-act="link"]');
    if (!select) return;
    const panel = select.closest('.steps-panel');
    Store.setParent(panel.dataset.key, panel.dataset.id, select.value);
    UI.render();
  });

  content.addEventListener('input', e => {
    const textarea = e.target.closest('.summary__input');
    if (!textarea) return;
    UI.autoGrow(textarea);
    Store.setSummary(textarea.dataset.summary, textarea.value);   // без перерисовки: фокус остаётся в поле
  });

  /* ═════════════ Экспорт и импорт ═════════════ */

  $('#btnExport').addEventListener('click', () => Store.exportJSON());

  const fileInput = $('#fileImport');
  $('#btnImport').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';                                          // тот же файл можно выбрать повторно
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let next;
      try {
        next = Store.parseImport(reader.result);
      } catch (err) {
        alert(t('msg.importFail', err.message));
        return;
      }
      const count = Object.keys(next.periods).length;
      if (!confirm(t('msg.importConfirm', count))) return;
      Store.replaceState(next);
      UI.render();
    };
    reader.onerror = () => alert(t('msg.readFail'));
    reader.readAsText(file);
  });

  /* ═════════════ Автосохранение в файл ═════════════ */

  /**
   * Кнопка меняет смысл вместе со статусом: подключить, вернуть разрешение,
   * отключить. Всё — из обработчика клика: без жеста пользователя браузер
   * не покажет ни выбор файла, ни запрос разрешения.
   */
  $('#btnFile').addEventListener('click', async () => {
    const { status } = FileSync.state();

    if (status === 'on') {
      if (confirm(t('msg.disconnect'))) {
        await FileSync.disconnect();
      }
      return;
    }
    if (status === 'needs-permission') {
      await FileSync.grantPermission();
      return;
    }

    const loaded = await FileSync.connect(existing => {
      return confirm(t('msg.fileHasData', Object.keys(existing.periods).length));
    });
    if (loaded) UI.render();
  });

  /* ═════════════ Горячие клавиши ═════════════ */

  document.addEventListener('keydown', e => {
    const typing = /^(input|textarea|select)$/i.test(document.activeElement.tagName);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'ArrowLeft')       { e.preventDefault(); UI.shift(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); UI.shift(1); }
    else if (e.key === 't' || e.key === 'е') { e.preventDefault(); UI.jumpToNow(); }
    else if (e.key === 'i' || e.key === 'ш') { e.preventDefault(); UI.captureToInbox(); }
  });

  /* ═════════════ Старт ═════════════ */

  Store.load();
  FileSync.init(UI.renderFileSync);
  UI.goTo('overview');   // приложение открывается на обзоре, дальше вкладка держится до перезагрузки
})();
