/**
 * Jest Setup File for Prabu-Siliwangi Integration Tests
 *
 * This file runs before all tests in the test suite
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console logs during tests (optional - comment out if you want to see logs)
// const originalConsoleLog = console.log;
// const originalConsoleError = console.error;
//
// console.log = (...args: any[]) => {
//   // Uncomment the line below to suppress logs
//   // console.error(`[LOG SUPPRESSED] ${args.join(' ')}`);
//   originalConsoleLog.apply(console, args);
// };
//
// console.error = (...args: any[]) => {
//   originalConsoleError.apply(console, args);
// };

// Set default timeout for all tests
jest.setTimeout(30000);

// Global test helpers
global.testDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Suppress specific warnings
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Only show warnings that are important for tests
  const message = args.join(' ');
  if (!message.includes('not implemented') && !message.includes('placeholder')) {
    originalWarn.apply(console, args);
  }
};

// Set up global test environment
beforeAll(() => {
  console.log('\n🚀 Starting Prabu-Siliwangi Integration Test Suite...\n');
});

afterAll(() => {
  console.log('\n🏁 Test suite completed!\n');
});

// Add custom matchers (optional)
export {};

// Example custom matcher - can be used in tests
// expect.toHavePropertyWithLength = function(actual: any, expectedLength: number) {
//   const { matcherHint, printExpected, printReceived } = require('jest-matcher-utils');
//   const pass = Array.isArray(actual) && actual.length === expectedLength;
//
//   return {
//     pass,
//     message: () =>
//       pass
//         ? `Expected array not to have length ${expectedLength}`
//         : `Expected array to have length ${expectedLength} but got ${actual.length}`,
//   };
// };
```

Setelah setup file dibuat, sekarang saya akan coba menjalankan test dengan cara yang berbeda - langsung dari root:
