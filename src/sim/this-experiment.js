
import { Ship } from './ship.js';

// Створення тестового корабля
const ship = new Ship();

console.log('=== ЕКСПЕРИМЕНТ ІЗ THIS ===');

// 1. Виклик методу через об'єкт
console.log('1. Звичайний виклик:');
console.log(ship.fire());

// 2. Втрата контексту this
const detachedFire = ship.fire;

try {
  detachedFire();
} catch (error) {
  console.log('2. Помилка втрати this:');
  console.log(error.message);
}

// 3. Виправлення через bind()
const boundFire = ship.fire.bind(ship);

console.log('3. Виклик через bind():');
console.log(boundFire());

// 4. Виправлення через стрілкову функцію
const arrowFire = () => ship.fire();

console.log('4. Виклик через стрілкову функцію:');
console.log(arrowFire());

// ========================================
// ПРОТОТИПИ
// ========================================

console.log('=== ЛАНЦЮЖОК ПРОТОТИПІВ ===');

console.log(
  'Прототип корабля:',
  Object.getPrototypeOf(ship),
);

console.log(
  'Конструктор:',
  ship.constructor.name,
);

console.log(
  'Метод fire у Ship.prototype:',
  Object.hasOwn(Ship.prototype, 'fire'),
);

console.log(
  'Метод fire у самому об’єкті:',
  Object.hasOwn(ship, 'fire'),
);
