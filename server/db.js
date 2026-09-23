import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// Khởi tạo Connection Pool tối ưu hiệu năng
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'phuoc-nodejs',
  password: process.env.DB_PASSWORD || 'Phuoc02082005',
  database: process.env.DB_NAME || 'Phuoc-NodeJS',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

export async function testDbConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result, VERSION() as version');
    return {
      connected: true,
      version: rows[0]?.version || 'Unknown',
      host: process.env.DB_HOST || '127.0.0.1',
      database: process.env.DB_NAME || 'Phuoc-NodeJS'
    };
  } catch (err) {
    console.error('[Database] MariaDB Connection Failed:', err.message);
    return {
      connected: false,
      error: err.message
    };
  }
}
