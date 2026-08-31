/* ============================================================
   insights.js — выборки для дашборда. Чистые запросы к Store,
   без DOM: поэтому проверяются тестами в node, как metrics.js
   в проекте sprint-progress.

   Правило, по которому сюда что-то попадает: если по числу или строке
   нельзя принять решение прямо на дашборде — им здесь не место.
   ============================================================ */
const Insights = (() => {
  'use strict';

  /** Задача, которая ещё чего-то ждёт: не закрыта и не снята. */
  const isOpen = task => !task.done && !task.cancelled;

  /** Сколько раз задача должна переехать, чтобы это стало проблемой. */
  const STUCK_FROM = 2;

  const periodKeys = () => Object.keys(Store.get().periods);

  /* ═════════════ Вертикальный срез «сейчас» ═════════════ */

  /**
   * Ключи текущих периодов всех горизонтов — от дня к году.
   * Это и есть исходный вопрос «что у меня на день / неделю / месяц / квартал / год».
   */
  function verticalKeys(today) {
    const now = today || Store.today();
    return Store.HORIZONS.map(horizon => ({ horizon, key: Store.periodKey(horizon, now) }));
  }

  /* ═════════════ Разбор хвостов ═════════════ */

  /**
   * Незакрытые задачи в периодах, которые уже кончились.
   * Правило одно для всех горизонтов: период закончился раньше сегодня.
   *
   * @returns {Array<{key, task, horizon, end, ageDays}>} сначала самые старые
   */
  function overdueItems(today) {
    const now = today || Store.today();
    const out = [];
    periodKeys().forEach(key => {
      const end = Store.keyEnd(key);
      if (!end || end >= now) return;
      Store.tasks(key).filter(isOpen).forEach(task => out.push({
        key, task,
        horizon: Store.keyHorizon(key),
        end,
        ageDays: Store.diffDays(end, now),
      }));
    });
    return out.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
  }

  /**
   * Задачи, которые переезжают из периода в период. Такая задача либо не нужна,
   * либо слишком крупная — и то и другое требует решения, а не ещё одного переноса.
   *
   * @returns {Array<{key, task, horizon, carryCount}>} сначала самые залежавшиеся
   */
  function stuckItems(minCarry, today) {
    const limit = minCarry === undefined ? STUCK_FROM : minCarry;
    const out = [];
    periodKeys().forEach(key => {
      Store.tasks(key).forEach(task => {
        if (isOpen(task) && (task.carryCount || 0) >= limit) {
          out.push({ key, task, horizon: Store.keyHorizon(key), carryCount: task.carryCount });
        }
      });
    });
    return out.sort((a, b) => b.carryCount - a.carryCount);
  }

  /** Ключи периодов, которые начинаются внутри заданного. */
  function periodsWithin(key) {
    const start = Store.keyStart(key);
    const end = Store.keyEnd(key);
    if (!start) return [];
    return periodKeys().filter(k => {
      const s = Store.keyStart(k);
      return s && s >= start && s <= end;
    });
  }

  /** Было ли в периоде хоть что-то: задачи в нём самом или в его днях и неделях. */
  const hasActivity = key => periodsWithin(key).some(k => Store.tasks(k).length > 0);

  /**
   * Периоды, которые закончились без итогов. Берётся только последний
   * завершившийся период каждого горизонта и только если в нём что-то было:
   * напоминать про пустой позапрошлый квартал — шум, а не забота.
   *
   * @returns {Array<{key, horizon}>}
   */
  function pendingRetros(today) {
    const now = today || Store.today();
    return Store.RETRO_HORIZONS
      .map(horizon => ({ horizon, key: Store.nextKey(Store.periodKey(horizon, now), -1) }))
      .filter(({ key }) => key && !Store.summary(key).trim() && hasActivity(key));
  }

  /**
   * Всё, что требует решения, одним вызовом. Задача, попавшая и в просрочку,
   * и в залипшие, показывается один раз — в просрочке: она острее.
   */
  function attention(today) {
    const now = today || Store.today();
    const overdue = overdueItems(now);
    const seen = new Set(overdue.map(item => item.task.id));
    const stuck = stuckItems(STUCK_FROM, now).filter(item => !seen.has(item.task.id));
    const retros = pendingRetros(now);
    return { overdue, stuck, retros, total: overdue.length + stuck.length + retros.length };
  }

  return {
    STUCK_FROM, isOpen,
    verticalKeys, overdueItems, stuckItems, pendingRetros, periodsWithin, hasActivity, attention,
  };
})();
