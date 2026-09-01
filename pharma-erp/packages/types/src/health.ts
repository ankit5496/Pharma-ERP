/** Response contract for `GET /health`. Consumed by the web dashboard. */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  /** ISO-8601 timestamp of when the API answered. */
  timestamp: string;
  /** Process uptime in whole seconds. */
  uptimeSeconds: number;
  version: string;
  environment: string;
  checks: {
    database: DependencyCheck;
  };
}

export interface DependencyCheck {
  status: 'up' | 'down';
  /** Round-trip latency in milliseconds, absent when the check failed. */
  latencyMs?: number;
  /** Present only when `status` is `down`; never contains connection secrets. */
  error?: string;
}
