import { describe, expect, it } from 'vitest';
import { CircuitBreaker, getCircuit } from '../src/lib/circuit-breaker.js';

describe('circuit breaker', () => {
  it('opens after consecutive failures', async () => {
    const c = new CircuitBreaker({ name: 'test', failureThreshold: 2, resetMs: 60_000 });
    await expect(c.exec(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await expect(c.exec(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(c.getStatus().state).toBe('open');
    await expect(c.exec(async () => 'ok')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
  });

  it('resets on success', async () => {
    const c = getCircuit(`ok-${Date.now()}`, { failureThreshold: 3 });
    const value = await c.exec(async () => 42);
    expect(value).toBe(42);
    expect(c.getStatus().state).toBe('closed');
  });
});
