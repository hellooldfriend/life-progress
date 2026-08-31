/* Цели и шаги: связь идёт через периоды — цель в сентябре, шаг на этой неделе. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load');

const MONTH = '2026-09';
const WEEK = '2026-W36';      // 31 августа — 6 сентября, начинается раньше 1 сентября
const DAY = '2026-09-01';

/** Цель на сентябрь и три шага в разных периодах. */
function withGoal() {
  const app = loadApp();
  const { Store } = app;
  const goal = Store.addTask(MONTH, 'Обновить права');
  const medical = Store.addTask(WEEK, 'Получить медсправку');
  const shrink = Store.addTask(DAY, 'Справка от психиатра');
  Store.setParent(WEEK, medical.id, goal.id);
  Store.setParent(DAY, shrink.id, goal.id);
  return { ...app, goal, medical, shrink };
}

test('findTask достаёт задачу из любого периода по одному id', () => {
  const { Store, goal, medical } = withGoal();
  assert.deepEqual(
    [Store.findTask(goal.id).key, Store.findTask(medical.id).key],
    [MONTH, WEEK],
  );
  assert.equal(Store.findTask('нет-такой'), null);
});

test('шаги цели собираются из разных периодов и идут по времени', () => {
  const { Store, goal } = withGoal();
  const steps = Store.subtasks(goal.id);

  assert.deepEqual(steps.map(s => s.task.text), ['Получить медсправку', 'Справка от психиатра']);
  assert.deepEqual(steps.map(s => s.key), [WEEK, DAY], 'неделя 36 начинается 31 августа — раньше дня');
});

test('входящие среди шагов идут последними — у них нет времени', () => {
  const { Store, goal } = withGoal();
  const idea = Store.addTask('inbox', 'Узнать про автошколу');
  Store.setParent('inbox', idea.id, goal.id);

  assert.deepEqual(Store.subtasks(goal.id).map(s => s.key), [WEEK, DAY, 'inbox']);
});

test('прогресс цели считается по шагам, снятые в знаменатель не идут', () => {
  const { Store, goal, medical, shrink } = withGoal();
  assert.deepEqual(Store.subtaskStats(goal.id), { done: 0, active: 2, cancelled: 0, total: 2 });

  Store.toggleTask(WEEK, medical.id);
  assert.deepEqual(Store.subtaskStats(goal.id), { done: 1, active: 2, cancelled: 0, total: 2 });

  Store.toggleCancelled(DAY, shrink.id);
  assert.deepEqual(Store.subtaskStats(goal.id), { done: 1, active: 1, cancelled: 1, total: 2 });
  assert.deepEqual(Store.subtaskStats('нет-такой'), { done: 0, active: 0, cancelled: 0, total: 0 });
});

test('шаг остаётся обычной задачей своего периода', () => {
  const { Store, medical } = withGoal();
  // шаг считается в прогрессе недели, а цель — в прогрессе сентября: двойного учёта нет
  assert.deepEqual(Store.stats(WEEK), { done: 0, active: 1, cancelled: 0, total: 1 });
  assert.deepEqual(Store.stats(MONTH), { done: 0, active: 1, cancelled: 0, total: 1 });
  assert.equal(Store.tasks(WEEK)[0].id, medical.id);
});

test('связь переживает перенос цели в другой период', () => {
  const { Store, goal } = withGoal();
  const moved = Store.carryTask(MONTH, goal.id);      // цель уехала в октябрь

  assert.equal(moved.key, '2026-10');
  assert.equal(Store.subtasks(goal.id).length, 2, 'шаги остались на местах и связь цела');
  assert.equal(Store.findTask(goal.id).key, '2026-10');
});

test('связь переживает планирование шага в другой горизонт', () => {
  const { Store, goal, medical } = withGoal();
  const filed = Store.fileTask(WEEK, medical.id, DAY);

  assert.equal(filed.key, DAY);
  assert.equal(filed.task.parentId, goal.id);
  assert.equal(filed.task.carryCount, 0, 'планирование — не перенос');
  assert.equal(Store.subtasks(goal.id).length, 2);
});

test('setParent привязывает и отвязывает', () => {
  const { Store, goal } = withGoal();
  const extra = Store.addTask(DAY, 'Съездить в ГИБДД');

  assert.equal(Store.setParent(DAY, extra.id, goal.id).parentId, goal.id);
  assert.equal(Store.subtasks(goal.id).length, 3);

  assert.equal(Store.setParent(DAY, extra.id, null).parentId, null, 'пустая цель отвязывает');
  assert.equal(Store.subtasks(goal.id).length, 2);
  assert.equal(Store.tasks(DAY).length, 2, 'отвязанная задача осталась в своём периоде');
});

test('кольца не собираются', () => {
  const { Store, goal, medical } = withGoal();

  assert.equal(Store.setParent(MONTH, goal.id, goal.id), null, 'сама себе цель');
  assert.equal(Store.setParent(MONTH, goal.id, medical.id), null, 'цель не может стать шагом своего шага');
  assert.equal(Store.setParent(WEEK, medical.id, 'нет-такой'), null, 'цели не существует');
  assert.equal(Store.findTask(goal.id).task.parentId, null);
});

test('вложенность глубже одного уровня разрешена, но кольцо через неё не собрать', () => {
  const { Store, goal, medical, shrink } = withGoal();
  const step = Store.addTask(DAY, 'Записаться в поликлинику');
  Store.setParent(DAY, step.id, medical.id);          // шаг шага

  assert.deepEqual(Store.ancestorIds(step.id), [medical.id, goal.id]);
  assert.deepEqual(Store.descendantIds(goal.id).sort(), [medical.id, shrink.id, step.id].sort());
  assert.equal(Store.setParent(MONTH, goal.id, step.id), null, 'кольцо через внука');
});

test('удаление цели не оставляет шаги со ссылкой в пустоту', () => {
  const { Store, goal, medical, shrink } = withGoal();
  Store.deleteTask(MONTH, goal.id);

  assert.equal(Store.taskById(WEEK, medical.id).parentId, null);
  assert.equal(Store.taskById(DAY, shrink.id).parentId, null);
  assert.equal(Store.tasks(WEEK).length, 1, 'сам шаг остался: он живёт в своём периоде');
});

test('импорт чинит ссылку на несуществующую цель', () => {
  const { Store } = loadApp();
  const broken = JSON.stringify({
    periods: {
      [WEEK]: { tasks: [{ id: 'a1', text: 'Шаг без цели', parentId: 'потерянная-цель' }] },
      [MONTH]: { tasks: [{ id: 'a2', text: 'Цель', parentId: null }] },
    },
  });
  const parsed = Store.parseImport(broken);
  assert.equal(parsed.periods[WEEK].tasks[0].parentId, null, 'битая ссылка снята');
  assert.equal(parsed.periods[MONTH].tasks[0].parentId, null);
});

test('в кандидаты на цель не попадают ни сама задача, ни её потомки, ни закрытые', () => {
  const { Store, goal, medical, shrink } = withGoal();
  Store.toggleTask(DAY, shrink.id);                   // закрытая — не цель

  const ids = Store.goalCandidates(goal.id).map(c => c.task.id);
  assert.equal(ids.includes(goal.id), false, 'сама задача');
  assert.equal(ids.includes(medical.id), false, 'собственный шаг');
  assert.equal(ids.includes(shrink.id), false, 'закрытая задача');

  const forStep = Store.goalCandidates(medical.id).map(c => c.task.id);
  assert.equal(forStep.includes(goal.id), true, 'своя цель в списке остаётся');
});

test('кандидаты идут от крупных горизонтов к мелким', () => {
  const { Store } = loadApp();
  Store.addTask('2026-09-01', 'День');
  Store.addTask('2026', 'Год');
  Store.addTask('2026-09', 'Месяц');
  Store.addTask('2026-Q3', 'Квартал');

  assert.deepEqual(Store.goalCandidates().map(c => c.task.text), ['Год', 'Квартал', 'Месяц', 'День']);
});
