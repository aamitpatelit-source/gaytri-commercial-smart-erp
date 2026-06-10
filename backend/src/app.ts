import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { checkDbConnection, query } from './config/db';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import attendanceRoutes from './routes/attendance';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

// Ensure JWT_SECRET fallback exists to prevent boot crashes
const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_face_attendance_mvp_secret_key';
process.env.JWT_SECRET = JWT_SECRET;

const app = express();
const PORT = process.env.PORT || 5000;

// Configure production-ready CORS origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'https://gaytri-commercial-web-admin.vercel.app'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile app, curl)
    if (!origin) return callback(null, true);
    
    // Support Flutter Web local runs on dynamic ports
    const isLocalhost = origin.startsWith('http://localhost:') || origin === 'http://localhost';
    
    if (isLocalhost || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS origin security policy.'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Routes mapping
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/attendance', attendanceRoutes);



app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gaytri Commercial Face Attendance MVP API is running.',
    timestamp: new Date().toISOString(),
  });
});

// Apply centralized error handling middleware
app.use(errorHandler as any);

// Bootstrap Database Schema and seed mock employees for testing convenience
const bootstrapDatabase = async () => {
  try {
    console.log('Bootstrapping database schema...');
    
    // Read and run schema.sql
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await query(schemaSql);
      console.log('Database tables and indexes verified/created successfully.');
    } else {
      console.warn('schema.sql file not found at:', schemaPath);
    }

    // Self-healing migration for legacy tables
    await query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'Production';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift VARCHAR(50) DEFAULT 'Morning Shift';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT CURRENT_DATE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_type VARCHAR(50) DEFAULT 'MONTHLY';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'EMPLOYEE';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('Legacy table columns verified/migrated.');

    console.log('Database tables, columns and legacy schema verified.');
  } catch (error) {
    console.error('Database bootstrap failed:', error);
  }
};

const startServer = async () => {
  const isConnected = await checkDbConnection();
  if (isConnected) {
    await bootstrapDatabase();
  } else {
    console.warn('Could not run database bootstrap, database not connected.');
  }

  app.listen(PORT, () => {
    console.log(`Gaytri Commercial Face Attendance MVP Backend running on port ${PORT}`);
  });
};

startServer();
