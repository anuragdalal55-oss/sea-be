export type AppEnv = 'development' | 'production';

function normalizeFlag(value?: string): string {
  return (value || '').trim().toLowerCase();
}

export function getAppEnv(raw = process.env.NODE_ENV): AppEnv {
  const value = normalizeFlag(raw);

  if (value === 'dev' || value === 'development' || value === 'local') {
    return 'development';
  }

  if (value === 'prod' || value === 'production' || value === '') {
    return 'production';
  }

  return 'production';
}

export function applyAppEnv(): AppEnv {
  const env = getAppEnv();
  process.env.NODE_ENV = env;
  return env;
}

export function shouldLogQueries(): boolean {
  const override = normalizeFlag(process.env.LOG_QUERIES);

  if (['1', 'true', 'yes', 'on'].includes(override)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(override)) {
    return false;
  }

  return getAppEnv() === 'development';
}
