import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') || !!process.env.DATABASE_URL;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'gaytri_erp',
      ssl: isProduction ? { rejectUnauthorized: false } : false
    });

// Database health check
export const checkDbConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    client.release();
    console.log('PostgreSQL database connected successfully.');
    return true;
  } catch (error) {
    console.error('PostgreSQL database connection failed:', error);
    return false;
  }
};

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export default pool;
