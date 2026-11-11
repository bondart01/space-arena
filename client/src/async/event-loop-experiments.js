
/* global console, setTimeout, queueMicrotask, requestAnimationFrame */

// Експеримент 1. Синхронний код і Promise
export function experiment1() {
  console.log('1. Start');

  Promise.resolve().then(() => {
    console.log('2. Promise');
  });

  console.log('3. End');
}

// Експеримент 2. Promise і setTimeout
export function experiment2() {
  console.log('A. Start');

  setTimeout(() => {
    console.log('D. Timeout');
  }, 0);

  Promise.resolve().then(() => {
    console.log('C. Promise');
  });

  console.log('B. End');
}

// Експеримент 3. async/await
export async function experiment3() {
  console.log('1. Before await');

  await Promise.resolve();

  console.log('3. After await');
}

export function runExperiment3() {
  experiment3();

  console.log('2. Outside async');
}

// Експеримент 4. Вкладені завдання
export function experiment4() {
  console.log('A. Start');

  Promise.resolve().then(() => {
    console.log('C. First microtask');

    queueMicrotask(() => {
      console.log('D. Nested microtask');
    });

    setTimeout(() => {
      console.log('E. Timeout inside Promise');
    }, 0);
  });

  console.log('B. End');
}

// Експеримент 5. requestAnimationFrame
export function experiment5() {
  console.log('A. Start');

  requestAnimationFrame(() => {
    console.log('D. Animation frame');
  });

  Promise.resolve().then(() => {
    console.log('C. Promise');
  });

  console.log('B. End');
}
