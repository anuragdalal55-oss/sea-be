import { getAppEnv, shouldLogQueries } from './env';

/**
 * Structured logger for EDISS backend.
 * Outputs timestamped lines to stdout/stderr for Render and local terminals.
 *
 * Format: [DD/MM/YYYY HH:mm:ss IST] [LEVEL] [MODULE] message {extra?}
 */

function istNow(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'QUERY';

function emit(level: Level, module: string, message: string, extra?: object) {
  const ts = istNow();
  const line = `[${ts} IST] [${level.padEnd(5)}] [${module}] ${message}`;
  if (level === 'ERROR') {
    extra ? console.error(line, extra) : console.error(line);
  } else {
    extra ? console.log(line, extra) : console.log(line);
  }
}

/** Strip sensitive fields before logging request bodies or query params */
export function sanitizeBody(body: Record<string, any>): Record<string, any> {
  if (!body || typeof body !== 'object') return {};
  const REDACTED = ['password', 'password_hash', 'password_plain', 'new_password', 'current_password', 'token'];
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) =>
      REDACTED.some((r) => k.toLowerCase().includes(r)) ? [k, '***'] : [k, v]
    )
  );
}

/**
 * Return the first stack frame inside src/ that is not logger.ts or db.ts.
 * This helps identify the route or service that triggered the query.
 */
export function getCallerLocation(): string {
  const raw = new Error().stack ?? '';
  const frames = raw.split('\n').slice(1);

  for (const frame of frames) {
    if (
      frame.includes('logger.ts') ||
      frame.includes('db.ts') ||
      frame.includes('node_modules') ||
      frame.includes('node:') ||
      frame.includes('<anonymous>')
    ) {
      continue;
    }

    const match = frame.match(/\((.+?):(\d+):\d+\)/) ?? frame.match(/at (.+?):(\d+):\d+/);
    if (!match) continue;

    const fullPath = match[1].replace(/\\/g, '/');
    const srcIndex = fullPath.lastIndexOf('/src/');
    const location = srcIndex !== -1
      ? `${fullPath.substring(srcIndex + 1)}:${match[2]}`
      : `${fullPath.split('/').slice(-2).join('/')}:${match[2]}`;

    return location;
  }

  return 'unknown';
}

export const logger = {
  info(module: string, message: string, extra?: Record<string, any>): void {
    emit('INFO', module, message, extra);
  },

  warn(module: string, message: string, extra?: Record<string, any>): void {
    emit('WARN', module, message, extra);
  },

  error(module: string, message: string, err?: unknown): void {
    const extra = err
      ? {
          message: (err as any)?.message ?? String(err),
          code: (err as any)?.code,
          detail: (err as any)?.detail,
          stack: (err as any)?.stack?.split('\n').slice(0, 5).join(' | '),
        }
      : undefined;

    emit('ERROR', module, message, extra);
  },

  /**
   * SQL query log. Always emitted so DB activity is visible in terminal logs.
   * Called automatically by the pool wrapper in db.ts.
   */
  query(
    sql: string,
    params: any[] | undefined,
    durationMs: number,
    caller: string,
    status: 'OK' | 'ERROR' = 'OK'
  ): void {
    if (!shouldLogQueries()) {
      return;
    }

    const fullSql = sql.replace(/\s+/g, ' ').trim();

    emit(
      'QUERY',
      caller,
      `[${status}] (${durationMs}ms) ${fullSql}`,
      params && params.length > 0 ? { params } : undefined
    );
  },

  debug(module: string, message: string, extra?: Record<string, any>): void {
    if (getAppEnv() !== 'production') {
      emit('DEBUG', module, message, extra);
    }
  },
};
