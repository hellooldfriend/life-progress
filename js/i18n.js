/* ============================================================
   i18n.js — словарь интерфейса. Английский по умолчанию, русский рядом.

   Всё, что зависит от языка, живёт здесь: не только подписи кнопок,
   но и имена месяцев, порядок «день — месяц» в датах, склонение
   числительных, форма порядковых («3rd» / «3-я»). Store и UI
   спрашивают словарь через t() и сами про язык ничего не знают.

   Значение в словаре — строка или функция от примитивов; функция
   нужна там, где языки расходятся не словами, а структурой фразы.
   ============================================================ */
const I18N = (() => {
  'use strict';

  const en = {
    /* ── приложение ── */
    'app.title': 'Doozy — planning from a day to a year',
    'app.description': 'Personal and work planning across horizons: day, week, month, quarter, year. Tasks and reviews. Local, no backend.',
    'app.brand': 'doozy',
    'lang.name': 'English',
    'lang.title': 'Interface language',

    /* ── шапка и навигация ── */
    'tab.days': 'Days', 'tab.week': 'Week', 'tab.month': 'Month', 'tab.quarter': 'Quarter', 'tab.year': 'Year',
    'tabs.aria': 'Planning horizon',
    'overview': 'Overview',
    'overview.inbox': n => `Overview · inbox: ${n}`,
    'nav.prev': 'Previous period (←)', 'nav.next': 'Next period (→)',
    'nav.today': 'Today', 'nav.todayTitle': 'Back to the current period (t)',
    'nav.span': 'How many periods to show side by side',
    'nav.ahead': label => `${label} ahead`,
    'export': 'Export', 'export.title': 'Download all data as JSON',
    'import': 'Import', 'import.title': 'Load data from JSON',
    'footer': `Data lives in this browser (localStorage). “File” turns on autosave to a JSON file on disk —
      put it in a synced folder and your data travels between machines.<br />
      “Inbox” on the overview is for thoughts without a date: write it down now, pick a period later.
      Click the logo for the overview.<br />
      A label goes right in the text: “buy tickets #work”. Click a label to filter by it.<br />
      Click a task’s text to edit. ★ — important, → — move to the next period,
      ⊘ — cancel (stays visible, leaves the progress), ↑ ↓ — order.<br />
      ⊞ — break a goal into steps: a step lives in its own period, the link shows on both sides.<br />
      Keys: ← → — neighbouring period, t — back to now, i — capture to inbox.`,

    /* ── даты ── */
    'months.short': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    'months.long': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    'weekdays': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    /** Короткая дата: «Aug 29», с годом — «Aug 29, 2026». */
    'fmt.date': (day, mon, year) => `${en['months.short'][mon]} ${day}${year ? `, ${year}` : ''}`,
    'label.day': (day, mon) => `${en['months.long'][mon]} ${day}`,
    'label.week': n => `Week ${n}`,
    'label.month': (mon, year) => `${en['months.long'][mon]} ${year}`,
    'label.quarter': (q, year) => `Q${q} ${year}`,
    'label.inbox': 'Inbox',
    'sub.inbox': 'came to mind — sort out later',
    'sub.month': q => `Q${q}`,
    'sub.quarter': (m1, m2) => `${en['months.long'][m1]} — ${en['months.long'][m2]}`,
    'sub.year': 'whole year',
    'span.words': {
      day: ['day', 'days', 'days'], week: ['week', 'weeks', 'weeks'], month: ['month', 'months', 'months'],
      quarter: ['quarter', 'quarters', 'quarters'], year: ['year', 'years', 'years'],
    },
    'plural': (n, one, few, many) => (n === 1 ? one : many),
    'ordinal': n => {
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
      return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
    },

    /* ── задачи ── */
    'task.done': 'Done', 'task.edit': 'Edit', 'task.add': 'Add',
    'act.moveTo': period => `Move to: ${period}`,
    'act.cancel': 'Cancel — not going to do it', 'act.restore': 'Bring back to work', 'act.delete': 'Delete',
    'act.up': 'Move up', 'act.down': 'Move down', 'act.star': 'Important', 'act.steps': 'Steps and goal',
    'act.unlink': 'Remove from steps — the task stays in its period',
    'tag.carry': from => (from ? `moved from “${from}”` : 'moved'),
    'tag.carryRun': (n, horizon) => `${en.ordinal(n)} ${en['span.words'][horizon]?.[0] || 'period'} in a row`,
    'tag.carryTitle': (n, from) => `Moved ${en.ordinal(n)} time${from ? ` · last from “${from}”` : ''}`,
    'tag.cancelled': 'cancelled', 'tag.cancelledTitle': 'Dropped — not counted in progress',
    'tag.steps': (done, active) => `steps ${done}/${active}`, 'tag.stepsTitle': 'Steps of the goal',
    'tag.parentTitle': (text, period) => `Part of goal “${text}” · ${period}`,
    'tag.categoryTitle': c => `Show only “${c}”`,
    'tag.openPeriod': 'Open period',
    'progress.cancelled': n => `Cancelled tasks: ${n}`,

    /* ── списки и формы ── */
    'empty': 'empty', 'empty.filtered': c => `no tasks with #${c}`,
    'add.task': 'new task', 'add.day': 'task for the day',
    'add.week': 'goal or task for the week', 'add.month': 'goal or task for the month',
    'add.quarter': 'goal or task for the quarter', 'add.year': 'goal or task for the year',
    'add.childWeek': 'task for the week', 'add.childMonth': 'task for the month', 'add.childQuarter': 'task for the quarter',
    'add.period': 'goal for this period',
    'summary.placeholder': 'What happened, what worked out, notable events…',
    'summary.week': 'Week review', 'summary.month': 'Month review',
    'summary.quarter': 'Quarter review', 'summary.year': 'Year review',
    'section.days': 'Days of the week', 'section.weeks': 'Weeks of the month',
    'section.months': 'Months of the quarter', 'section.quarters': 'Quarters', 'section.monthsOfYear': 'Months',
    'mini.review': 'review',
    'today': 'Today', 'today.mark': ' · today',
    'target.day': 'today', 'target.week': 'week', 'target.month': 'month',
    'target.quarter': 'quarter', 'target.year': 'year',
    'filters.all': 'all',
    'settings': 'Views', 'settings.title': 'Show or hide horizons',
    'settings.hint': 'Hidden horizons leave the tabs, the overview and the breakdowns. Tasks in them stay.',
    'settings.last': 'At least one horizon must stay visible',

    /* ── цели и шаги ── */
    'steps.placeholder': 'new step…', 'steps.into': period => `Step into: ${period}`,
    'steps.parent': 'part of goal', 'steps.none': '— on its own',

    /* ── обзор ── */
    'section.inbox': 'Inbox', 'inbox.placeholder': 'came to mind — write it down, sort out later',
    'inbox.empty': 'empty — all sorted', 'inbox.capture': 'Capture',
    'section.now': 'Now', 'section.attention': 'Sort out', 'attention.none': 'no loose ends — all sorted',
    'attention.overdue': 'Overdue', 'attention.overdueSub': 'the period ended, the task stayed',
    'attention.stuck': 'Stuck', 'attention.stuckSub': 'keeps moving from period to period — split it or drop it',
    'attention.retros': 'Reviews missing', 'attention.retrosSub': 'the period ended, the review is empty',
    'attention.write': 'write →',
    'age.yesterday': 'yesterday',
    'age.days': n => `${n} days ago`, 'age.weeks': n => `${n} ${en.plural(n, 'week', '', 'weeks')} ago`,
    'age.months': n => `${n} ${en.plural(n, 'month', '', 'months')} ago`,

    /* ── файл ── */
    'file.off': 'File', 'file.offTitle': 'Turn on autosave to a file on disk',
    'file.perm': 'Grant access', 'file.permTitle': 'The browser forgot the file permission — click to restore',
    'file.error': 'File: error', 'file.errorTitle': 'Could not write the file — click to pick again',
    'file.onTitle': name => `Autosave is on: ${name}. Click to turn off`, 'file.fallback': 'file',
    'file.description': 'Doozy backup',
    'msg.importFail': err => `Could not read the file: ${err}`,
    'msg.importConfirm': n => `Replace current data with the imported file?\nPeriods in file: ${n}.\nCurrent data will be overwritten.`,
    'msg.readFail': 'Could not read the file.',
    'msg.disconnect': 'Turn off autosave to file?\nData stays in the browser, the file stays on disk.',
    'msg.fileHasData': n => `The file already has data (periods: ${n}).\nOK — load it into the app, current data will be replaced.\nCancel — keep current data and overwrite the file.`,
    'err.notBackup': 'This file does not look like a Doozy backup',
    'err.horizon': h => `Unknown horizon: ${h}`,
  };

  const ru = {
    'app.title': 'Doozy — планирование от дня до года',
    'app.description': 'Личное и рабочее планирование по горизонтам: день, неделя, месяц, квартал, год. Задачи и итоги. Локально, без бэкенда.',
    'app.brand': 'doozy',
    'lang.name': 'Русский',
    'lang.title': 'Язык интерфейса',

    'tab.days': 'Дни', 'tab.week': 'Неделя', 'tab.month': 'Месяц', 'tab.quarter': 'Квартал', 'tab.year': 'Год',
    'tabs.aria': 'Горизонт планирования',
    'overview': 'Обзор',
    'overview.inbox': n => `Обзор · во входящих: ${n}`,
    'nav.prev': 'Предыдущий период (←)', 'nav.next': 'Следующий период (→)',
    'nav.today': 'Сейчас', 'nav.todayTitle': 'Вернуться к текущему периоду (t)',
    'nav.span': 'Сколько периодов показывать рядом',
    'nav.ahead': label => `${label} вперёд`,
    'export': 'Экспорт', 'export.title': 'Скачать все данные в JSON',
    'import': 'Импорт', 'import.title': 'Загрузить данные из JSON',
    'footer': `Данные хранятся в этом браузере (localStorage). «Файл» включает автосохранение в JSON на диске —
      положите его в синхронизируемую папку, и данные поедут между машинами.<br />
      «Входящие» на обзоре — для мыслей без времени: записать сейчас, период назначить потом.
      Клик по логотипу — обзор.<br />
      Метка задаётся прямо в тексте: «купить билеты #работа». Клик по метке — фильтр по ней.<br />
      Клик по тексту задачи — правка. ★ — важное, → — перенести в следующий период,
      ⊘ — отменить (задача остаётся видна, но уходит из прогресса), ↑ ↓ — порядок.<br />
      ⊞ — разбить цель на шаги: шаг живёт в своём периоде, а связь видна с обеих сторон.<br />
      Клавиши: ← → — соседний период, t — вернуться к текущему, i — записать во входящие.`,

    'months.short': ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    'months.long': ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    'months.gen': ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    'weekdays': ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
    'fmt.date': (day, mon, year) => `${day} ${ru['months.short'][mon]}${year ? ` ${year}` : ''}`,
    'label.day': (day, mon) => `${day} ${ru['months.gen'][mon]}`,
    'label.week': n => `Неделя ${n}`,
    'label.month': (mon, year) => `${ru['months.long'][mon]} ${year}`,
    'label.quarter': (q, year) => `${['I', 'II', 'III', 'IV'][q - 1]} квартал ${year}`,
    'label.inbox': 'Входящие',
    'sub.inbox': 'пришло в голову — разобрать',
    'sub.month': q => `квартал ${['I', 'II', 'III', 'IV'][q - 1]}`,
    'sub.quarter': (m1, m2) => `${ru['months.long'][m1].toLowerCase()} — ${ru['months.long'][m2].toLowerCase()}`,
    'sub.year': 'год целиком',
    'span.words': {
      day: ['день', 'дня', 'дней'], week: ['неделя', 'недели', 'недель'], month: ['месяц', 'месяца', 'месяцев'],
      quarter: ['квартал', 'квартала', 'кварталов'], year: ['год', 'года', 'лет'],
    },
    'plural': (n, one, few, many) => {
      const mod10 = Math.abs(n) % 10;
      const mod100 = Math.abs(n) % 100;
      if (mod10 === 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
      return many;
    },
    /** Порядковое согласуется с родом слова: «3-я неделя», «3-й день». */
    'ordinal': (n, horizon) => `${n}-${horizon === 'week' ? 'я' : 'й'}`,

    'task.done': 'Выполнено', 'task.edit': 'Изменить', 'task.add': 'Добавить',
    'act.moveTo': period => `Перенести: ${period}`,
    'act.cancel': 'Отменить — не буду делать', 'act.restore': 'Вернуть в работу', 'act.delete': 'Удалить',
    'act.up': 'Выше', 'act.down': 'Ниже', 'act.star': 'Важное', 'act.steps': 'Шаги и цель',
    'act.unlink': 'Убрать из шагов — задача останется в своём периоде',
    'tag.carry': from => (from ? `перенос из «${from}»` : 'перенос'),
    'tag.carryRun': (n, horizon) => `${ru.ordinal(n, horizon)} ${ru['span.words'][horizon]?.[0] || 'период'} подряд`,
    'tag.carryTitle': (n, from) => `Переносится ${n}-й раз${from ? ` · последний раз из «${from}»` : ''}`,
    'tag.cancelled': 'отменена', 'tag.cancelledTitle': 'Задача снята — в прогресс не считается',
    'tag.steps': (done, active) => `шаги ${done}/${active}`, 'tag.stepsTitle': 'Шаги цели',
    'tag.parentTitle': (text, period) => `Часть цели «${text}» · ${period}`,
    'tag.categoryTitle': c => `Показать только «${c}»`,
    'tag.openPeriod': 'Открыть период',
    'progress.cancelled': n => `Отменено задач: ${n}`,

    'empty': 'пусто', 'empty.filtered': c => `нет задач с меткой #${c}`,
    'add.task': 'новая задача', 'add.day': 'задача на день',
    'add.week': 'цель или задача на неделю', 'add.month': 'цель или задача на месяц',
    'add.quarter': 'цель или задача на квартал', 'add.year': 'цель или задача на год',
    'add.childWeek': 'задача на неделю', 'add.childMonth': 'задача на месяц', 'add.childQuarter': 'задача на квартал',
    'add.period': 'цель на этот период',
    'summary.placeholder': 'Что произошло, что получилось, важные события…',
    'summary.week': 'Итоги недели', 'summary.month': 'Итоги месяца',
    'summary.quarter': 'Итоги квартала', 'summary.year': 'Итоги года',
    'section.days': 'Дни недели', 'section.weeks': 'Недели месяца',
    'section.months': 'Месяцы квартала', 'section.quarters': 'Кварталы', 'section.monthsOfYear': 'Месяцы',
    'mini.review': 'итоги',
    'today': 'Сегодня', 'today.mark': ' · сегодня',
    'target.day': 'сегодня', 'target.week': 'неделя', 'target.month': 'месяц',
    'target.quarter': 'квартал', 'target.year': 'год',
    'filters.all': 'все',
    'settings': 'Виды', 'settings.title': 'Показать или скрыть горизонты',
    'settings.hint': 'Скрытый горизонт уходит из вкладок, обзора и разбивок. Задачи в нём остаются.',
    'settings.last': 'Хотя бы один горизонт должен остаться',

    'steps.placeholder': 'новый шаг…', 'steps.into': period => `Шаг в период: ${period}`,
    'steps.parent': 'часть цели', 'steps.none': '— сама по себе',

    'section.inbox': 'Входящие', 'inbox.placeholder': 'пришло в голову — записать и разобрать потом',
    'inbox.empty': 'пусто — всё разобрано', 'inbox.capture': 'Записать',
    'section.now': 'Сейчас', 'section.attention': 'Разгрести', 'attention.none': 'хвостов нет — всё разобрано',
    'attention.overdue': 'Просрочено', 'attention.overdueSub': 'период кончился, задача осталась',
    'attention.stuck': 'Залипло', 'attention.stuckSub': 'переезжает из периода в период — разрезать или снять',
    'attention.retros': 'Итоги не записаны', 'attention.retrosSub': 'период закончился, ретроспектива пустая',
    'attention.write': 'написать →',
    'age.yesterday': 'вчера',
    'age.days': n => `${n} дн. назад`, 'age.weeks': n => `${n} нед. назад`, 'age.months': n => `${n} мес. назад`,

    'file.off': 'Файл', 'file.offTitle': 'Включить автосохранение в файл на диске',
    'file.perm': 'Дать доступ', 'file.permTitle': 'Браузер забыл разрешение на файл — нажмите, чтобы вернуть',
    'file.error': 'Файл: сбой', 'file.errorTitle': 'Не удалось записать файл — нажмите, чтобы выбрать заново',
    'file.onTitle': name => `Автосохранение включено: ${name}. Нажмите, чтобы отключить`, 'file.fallback': 'файл',
    'file.description': 'Бэкап Doozy',
    'msg.importFail': err => `Не удалось прочитать файл: ${err}`,
    'msg.importConfirm': n => `Заменить текущие данные на импортируемые?\nВ файле периодов: ${n}.\nТекущие данные будут перезаписаны.`,
    'msg.readFail': 'Не удалось прочитать файл.',
    'msg.disconnect': 'Отключить автосохранение в файл?\nДанные останутся в браузере, файл — на диске.',
    'msg.fileHasData': n => `В файле уже есть данные (периодов: ${n}).\nOK — загрузить их в приложение, текущие будут заменены.\nОтмена — оставить текущие данные и перезаписать файл.`,
    'err.notBackup': 'Файл не похож на бэкап Doozy',
    'err.horizon': h => `Неизвестный горизонт: ${h}`,
  };

  const DICT = { en, ru };
  const LANGS = Object.keys(DICT);
  const DEFAULT = 'en';
  let lang = DEFAULT;

  /** Строка или результат функции по ключу; нет в текущем языке — берём английский, нет нигде — сам ключ. */
  function t(key, ...args) {
    const value = DICT[lang][key] !== undefined ? DICT[lang][key] : DICT[DEFAULT][key];
    if (value === undefined) return key;
    return typeof value === 'function' ? value(...args) : value;
  }

  function setLang(next) {
    if (!DICT[next]) return false;
    lang = next;
    return true;
  }

  /** Самоназвание языка — для списка выбора: «English», «Русский». */
  const name = code => (DICT[code] ? DICT[code]['lang.name'] : code);

  return { t, setLang, name, get lang() { return lang; }, LANGS, DEFAULT };
})();
