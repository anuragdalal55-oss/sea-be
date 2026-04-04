import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { logger, getCallerLocation } from './utils/logger';

// Allow self-signed certificates for Supabase pooler connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

dotenv.config();

const host     = process.env.DB_HOST || 'localhost';
const port     = parseInt(process.env.DB_PORT || '5432');
const database = process.env.DB_NAME || 'postgres';
const user     = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || '';
const isRemote = host.includes('supabase');

logger.info('DB', `Connecting to ${host}:${port}/${database} (${isRemote ? 'remote/supabase' : 'local'})`);

const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('connect', () => {
  logger.debug('DB', 'New client connected from pool');
});

pool.on('error', (err) => {
  logger.error('DB', 'Unexpected error on idle DB client', err);
});

// ─── Query-logging wrapper ────────────────────────────────────────────────────
// Wraps pool.query so every SQL call is timed and logged when LOG_QUERIES=true.
// The caller location (file:line) is extracted from the call stack automatically.

type QueryArgs = [string, any[]?] | [{ text: string; values?: any[] }];

function loggedQuery<R extends QueryResultRow = any>(
  queryFn: (...args: any[]) => Promise<QueryResult<R>>,
  args: QueryArgs
): Promise<QueryResult<R>> {
  const caller = process.env.LOG_QUERIES === 'true' ? getCallerLocation() : '';
  const start  = Date.now();

  const sql    = typeof args[0] === 'string' ? args[0] : args[0].text;
  const params = typeof args[0] === 'string' ? (args[1] as any[] | undefined) : args[0].values;

  return queryFn(...args).then((result) => {
    if (process.env.LOG_QUERIES === 'true') {
      logger.query(sql, params, Date.now() - start, caller);
    }
    return result;
  });
}

// Proxy that intercepts .query() calls on the pool
const dbProxy = new Proxy(pool, {
  get(target, prop) {
    if (prop === 'query') {
      return (...args: QueryArgs) => loggedQuery(target.query.bind(target), args);
    }
    // .connect() returns a PoolClient — wrap its .query() too
    if (prop === 'connect') {
      return () =>
        (target.connect() as Promise<PoolClient>).then((client) => {
          const clientQuery = client.query.bind(client);
          return new Proxy(client, {
            get(c, p) {
              if (p === 'query') {
                return (...args: QueryArgs) => loggedQuery(clientQuery, args);
              }
              return (c as any)[p];
            },
          });
        });
    }
    return (target as any)[prop];
  },
});

export default dbProxy;
