import mysql from 'mysql2/promise';

// For ~2000 concurrent users: one Node instance uses one pool; MySQL max_connections often 150–500.
// 80 connections + queue handles bursts; scale horizontally (more app instances) if needed.
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'financial_app',
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 500,
  queueLimit: 500,
  max_connections: 1000
};

const globalForDb = globalThis as unknown as { dbPool: mysql.Pool };
const pool = globalForDb.dbPool ?? mysql.createPool(poolConfig);
if (process.env.NODE_ENV !== 'production') globalForDb.dbPool = pool;

export default pool;
