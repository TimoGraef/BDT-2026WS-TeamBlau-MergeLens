import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const mockGradient = { addColorStop: vi.fn() };
const mockContext2D = {
  clearRect: vi.fn(),
  createRadialGradient: vi.fn(() => mockGradient),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => mockContext2D),
});
