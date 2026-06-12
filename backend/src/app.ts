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
import { runStartupSelfHealing, startAutoCheckoutScheduler } from './controllers/attendanceController';

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
      ALTER TABLE employees ALTER COLUMN password_hash DROP NOT NULL;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN DEFAULT FALSE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('Legacy table columns verified/migrated.');

    // Ensure admins table exists
    await query(`
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) DEFAULT 'ADMIN',
        is_active BOOLEAN DEFAULT TRUE,
        must_change_password BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Admins table verified/created.');

    // Auto-migration: check if managers table exists and has records
    const managersTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'managers'
      );
    `);
    try {
      if (managersTableCheck.rows[0].exists) {
        const managersCount = await query('SELECT COUNT(*) FROM managers');
        if (parseInt(managersCount.rows[0].count) > 0) {
          await query(`
            INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
            SELECT id, email, password_hash, full_name, 'ADMIN', TRUE, TRUE, created_at, created_at
            FROM managers
            ON CONFLICT (email) DO NOTHING
          `);
          console.log('Migrated legacy managers to admins table.');
        }
      }
    } catch (migErr: any) {
      console.warn('[Auto-Migration Alert] Failed to migrate managers to admins (likely due to duplicate primary keys):', migErr.message);
    }

    // Seed default administrator if empty
    const superAdminCheck = await query("SELECT id FROM admins WHERE email = 'admin@gaytri.com' LIMIT 1");
    if (superAdminCheck.rows.length > 0) {
      console.log('Default super admin already exists.');
    } else {
      const bcrypt = require('bcryptjs');
      const { v4: uuidv4 } = require('uuid');
      const adminPasswordHash = bcrypt.hashSync('123456', 10);
      await query(`
        INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
        VALUES ($1, 'admin@gaytri.com', $2, 'Gaytri Admin', 'SUPER_ADMIN', TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [uuidv4(), adminPasswordHash]);
      console.log('Default super admin seeded successfully.');
    }

    // Migration for hybrid attendance checkout columns
    await query(`
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out TIMESTAMP;
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS checkout_type TEXT;
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS working_hours TEXT;
    `);
    console.log('Attendance records columns check_out, checkout_type, working_hours verified/migrated.');

    // Ensure settings table exists and is seeded
    await query(`
      CREATE TABLE IF NOT EXISTS attendance_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        shift_name VARCHAR(100) DEFAULT 'Morning Shift',
        checkin_start TIME DEFAULT '09:00:00',
        late_after TIME DEFAULT '09:15:00',
        checkout_time TIME DEFAULT '17:00:00',
        grace_minutes INTEGER DEFAULT 15,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const settingsCheck = await query('SELECT COUNT(*) FROM attendance_settings');
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await query(`
        INSERT INTO attendance_settings (shift_name, checkin_start, late_after, checkout_time, grace_minutes)
        VALUES ('Morning Shift', '09:00:00', '09:15:00', '17:00:00', 15)
      `);
      console.log('Seeded default attendance settings successfully.');
    }

    console.log('Database tables, columns and legacy schema verified.');
  } catch (error) {
    console.error('Database bootstrap failed:', error);
  }
};

const startServer = async () => {
  const isConnected = await checkDbConnection();
  if (isConnected) {
    await bootstrapDatabase();
    // Run startup self-healing and start daily 5:00 PM auto-checkout
    runStartupSelfHealing().catch(err => console.error('Startup self-healing failed:', err));
    startAutoCheckoutScheduler();
  } else {
    console.warn('Could not run database bootstrap, database not connected.');
  }

  app.listen(PORT, () => {
    console.log(`Gaytri Commercial Face Attendance MVP Backend running on port ${PORT}`);
  });
};

startServer();
