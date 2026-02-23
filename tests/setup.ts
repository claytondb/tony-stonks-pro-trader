/**
 * Test setup file
 * Configure testing environment
 */

// Mock browser APIs that aren't available in Node
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(performance.now()), 16) as unknown as number;
};

global.cancelAnimationFrame = (handle: number) => {
  clearTimeout(handle);
};

// Mock WebGL context if needed
// This will be expanded as we add more tests

export {};
