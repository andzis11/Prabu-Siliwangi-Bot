/**
 * Jest Setup File for Prabu-Siliwangi Integration Tests
 */

process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

(global as any).testDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (!message.includes('not implemented') && !message.includes('placeholder')) {
    originalWarn.apply(console, args);
  }
};

beforeAll(() => {
  console.log('\n🚀 Starting Prabu-Siliwangi Integration Test Suite...\n');
});

afterAll(() => {
  console.log('\n🏁 Test suite completed!\n');
});

export {};