import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isRemote = (process.env.DB_HOST || '').includes('supabase.co');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ediss_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Set session timezone to IST for every new connection
// so all timestamps returned from DB carry +05:30 offset
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Kolkata'");
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
