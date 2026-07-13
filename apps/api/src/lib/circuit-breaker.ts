/** Lightweight circuit breaker for provider / external calls */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetMs?: number;
  name?: string;
}

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetMs: number;
  readonly name: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetMs = opts.resetMs ?? 30_000;
    this.name = opts.name ?? 'default';
  }

  getStatus(): { name: string; state: CircuitState; failures: number } {
    this.maybeHalfOpen();
    return { name: this.name, state: this.state, failures: this.failures };
  }

  private maybeHalfOpen() {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.resetMs) {
      this.state = 'half_open';
    }
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();
    if (this.state === 'open') {
      throw Object.assign(new Error(`Circuit open: ${this.name}`), {
        code: 'CIRCUIT_OPEN',
        status: 503,
      });
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold || this.state === 'half_open') {
        this.state = 'open';
        this.openedAt = Date.now();
      }
      throw err;
    }
  }
}

const registry = new Map<string, CircuitBreaker>();

export function getCircuit(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let c = registry.get(name);
  if (!c) {
    c = new CircuitBreaker({ ...opts, name });
    registry.set(name, c);
  }
  return c;
}

export function listCircuits() {
  return [...registry.values()].map((c) => c.getStatus());
}
