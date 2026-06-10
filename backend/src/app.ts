import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { checkDbConnection, query } from './config/db';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import attendanceRoutes from './routes/attendance';

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

app.get('/api/v1/debug-db', async (req, res) => {
  try {
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public'
    `);
    
    const employeesCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name='employees'
    `);

    let employeesTestError = null;
    try {
      await query('SELECT * FROM employees LIMIT 1');
    } catch (err: any) {
      employeesTestError = err.message;
    }

    let attendanceTestError = null;
    try {
      await query('SELECT * FROM attendance_records LIMIT 1');
    } catch (err: any) {
      attendanceTestError = err.message;
    }

    return res.status(200).json({
      success: true,
      tables: tables.rows.map((r: any) => r.table_name),
      employeesColumns: employeesCols.rows,
      employeesTestError,
      attendanceTestError
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gaytri Commercial Face Attendance MVP API is running.',
    timestamp: new Date().toISOString(),
  });
});

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
    `);
    console.log('Legacy table columns verified/migrated.');

    // Verify if employees exist
    const empCheck = await query('SELECT COUNT(*) FROM employees');
    if (parseInt(empCheck.rows[0].count) === 0) {
      // Seed default employees (note: face_embedding is empty initially, can be registered from web)
      await query(`
        INSERT INTO employees (employee_id, full_name, department, shift, mobile) VALUES 
        ('GC-001', 'Amit Patel', 'Production', 'Morning Shift', '+919876543210'),
        ('GC-002', 'Rajesh Sharma', 'Logistics', 'Morning Shift', '+919876543211'),
        ('GC-003', 'Sunil Singh', 'Production', 'Night Shift', '+919876543212'),
        ('GC-004', 'Priya Verma', 'Quality Control', 'Morning Shift', '+919876543213')
      `);
      console.log('Seeded default employees for testing (GC-001, GC-002, GC-003, GC-004).');
    }
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
