/**
 * Structured logger for EDISS backend.
 * Outputs timestamped lines to stdout/stderr — readable in Render / local terminal.
 *
 * Format: [DD/MM/YYYY HH:mm:ss IST] [LEVEL] [MODULE] message  {extra?}
 *
 * Env flags:
 *   LOG_QUERIES=true   → enable SQL query logging (off by default)
 */

function istNow(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
      REDACTED.some(r => k.toLowerCase().includes(r)) ? [k, '***'] : [k, v]
    )
  );
}

/**
 * Walk the call stack and return the first frame that is inside src/ but
 * not inside logger.ts or db.ts — i.e. the actual route/service that called query().
 */
export function getCallerLocation(): string {
  const raw = new Error().stack ?? '';
  const frames = raw.split('\n').slice(1); // drop "Error" header line
  for (const frame of frames) {
    if (
      frame.includes('logger.ts') ||
      frame.includes('db.ts') ||
      frame.includes('node_modules') ||
      frame.includes('node:') ||
      frame.includes('<anonymous>')
    ) continue;

    // Matches:  at Object.<...> (C:\...\src\routes\mawbs.ts:58:5)
    //       or: at C:\...\src\routes\mawbs.ts:58:5
    const m = frame.match(/\((.+?):(\d+):\d+\)/) ?? frame.match(/at (.+?):(\d+):\d+/);
    if (!m) continue;

    const fullPath = m[1].replace(/\\/g, '/');
    const srcIdx   = fullPath.lastIndexOf('/src/');
    const location = srcIdx !== -1
      ? fullPath.substring(srcIdx + 1) + ':' + m[2]          // src/routes/mawbs.ts:58
      : fullPath.split('/').slice(-2).join('/') + ':' + m[2]; // routes/mawbs.ts:58
    return location;
  }
  return 'unknown';
}

export const logger = {
  /** General info — server start, DB connect, record created, etc. */
  info(module: string, message: string, extra?: Record<string, any>): void {
    emit('INFO', module, message, extra);
  },

  /** Non-fatal warnings — 400 errors, auth failures, validation */
  warn(module: string, message: string, extra?: Record<string, any>): void {
    emit('WARN', module, message, extra);
  },

  /**
   * Errors — always include the raw error so the stack trace appears in logs.
   * @param err  Pass the original caught value, not just err.message
   */
  error(module: string, message: string, err?: unknown): void {
    const extra = err
      ? {
          message: (err as any)?.message ?? String(err),
          code:    (err as any)?.code,
          detail:  (err as any)?.detail,   // PostgreSQL DETAIL field
          stack:   (err as any)?.stack?.split('\n').slice(0, 5).join(' | '),
        }
      : undefined;
    emit('ERROR', module, message, extra);
  },

  /**
   * SQL query log — only emitted when LOG_QUERIES=true in .env
   * Automatically called by the pool wrapper in db.ts; do not call manually.
   */
  query(sql: string, params: any[] | undefined, durationMs: number, caller: string): void {
    if (process.env.LOG_QUERIES !== 'true') return;

    // Collapse whitespace and truncate long queries for readability
    const shortSql = sql.replace(/\s+/g, ' ').trim().substring(0, 200);
    const safeParams = params?.map(p =>
      typeof p === 'string' && p.length > 60 ? p.substring(0, 60) + '…' : p
    );

    emit('QUERY', caller, `(${durationMs}ms) ${shortSql}`,
      safeParams && safeParams.length > 0 ? { params: safeParams } : undefined
    );
  },

  /** Debug — only emitted when NODE_ENV !== 'production' */
  debug(module: string, message: string, extra?: Record<string, any>): void {
    if (process.env.NODE_ENV !== 'production') {
      emit('DEBUG', module, message, extra);
    }
  },
};
