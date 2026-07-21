import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { checkDbConnection, query } from './config/db';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import attendanceRoutes from './routes/attendance';
import companyRoutes from './routes/company';
import leaveRoutes from './routes/leaves';
import { errorHandler } from './middleware/errorHandler';
import { startAutoLockScheduler } from './controllers/attendanceController';

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
app.use('/api/v1/company', companyRoutes);
app.use('/api/v1/leaves', leaveRoutes);



app.get(['/api/v1', '/api/v1/health'], (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gaytri Commercial API is running.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gaytri Commercial API is running.',
    timestamp: new Date().toISOString(),
  });
});

// Apply centralized error handling middleware
app.use(errorHandler as any);

// Bootstrap database schema and reconcile legacy biometric columns
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

    const bcrypt = require('bcryptjs');

    // 1. Conflict checking and duplicate resolution for legacy attendance data
    const recordsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance_records'
      );
    `);

    if (recordsTableCheck.rows[0].exists) {
      console.log('[Migration] Found legacy attendance_records. Checking for duplicates...');
      
      // Select duplicate pairs
      const duplicateRes = await query(`
        SELECT employee_id, date, COUNT(*) as cnt
        FROM attendance_records
        GROUP BY employee_id, date
        HAVING COUNT(*) > 1
      `);

      if (duplicateRes.rows.length > 0) {
        console.log(`[Migration] Resolving ${duplicateRes.rows.length} duplicate dates...`);
        for (const duplicate of duplicateRes.rows) {
          const empId = duplicate.employee_id;
          const targetDate = duplicate.date;
          
          // Get all records for this employee and date ordered by check_in_time asc
          const records = await query(`
            SELECT id, status, check_in_time, date 
            FROM attendance_records 
            WHERE employee_id = $1 AND date = $2
            ORDER BY check_in_time ASC
          `, [empId, targetDate]);

          if (records.rows.length > 1) {
            const preserved = records.rows[0];
            
            // Record conflicts for the audit report
            for (let i = 1; i < records.rows.length; i++) {
              const discarded = records.rows[i];
              await query(`
                INSERT INTO attendance_migration_conflicts 
                  (employee_id, date, record_preserved_id, record_discarded_id, preserved_status, discarded_status, preserved_time, discarded_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `, [empId, targetDate, preserved.id, discarded.id, preserved.status, discarded.status, preserved.check_in_time, discarded.check_in_time]);

              // Discard the late duplicate row
              await query('DELETE FROM attendance_records WHERE id = $1', [discarded.id]);
            }
          }
        }
        console.log('[Migration] Duplicates resolved successfully.');
      }

      // Migrate records to new attendance table
      console.log('[Migration] Transforming legacy attendance_records...');
      const migrateCount = await query(`
        INSERT INTO attendance (id, employee_id, manager_id, date, time, status, remarks, created_device, source, is_locked, created_at, updated_at)
        SELECT 
          id, 
          employee_id, 
          NULL, 
          date, 
          check_in_time, 
          status, 
          'Migrated Legacy Record'::text, 
          device_id, 
          'BIO_FACE'::varchar,
          TRUE,
          created_at, 
          created_at
        FROM attendance_records
        ON CONFLICT (employee_id, date) DO NOTHING
        RETURNING id
      `);
      console.log(`[Migration] Migrated ${migrateCount.rows.length} records successfully.`);

      // Verify row counts match
      const legacyCount = await query('SELECT COUNT(*) FROM attendance_records');
      const newCount = await query("SELECT COUNT(*) FROM attendance WHERE source = 'BIO_FACE'");
      if (parseInt(legacyCount.rows[0].count) !== parseInt(newCount.rows[0].count)) {
        throw new Error(`Migration reconciliation failed. Legacy: ${legacyCount.rows[0].count}, New: ${newCount.rows[0].count}`);
      }
      console.log('[Migration] Reconciliation complete.');

      // Safely drop the legacy table
      await query('DROP TABLE IF EXISTS attendance_records CASCADE');
      console.log('[Migration] Legacy attendance_records table dropped.');
    }

    // 2. Drop old biometric columns from employees table
    console.log('[Migration] Checking legacy biometric columns in employees table...');
    await query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS face_embedding CASCADE;
      ALTER TABLE employees DROP COLUMN IF EXISTS biometric_embedding CASCADE;
      ALTER TABLE employees DROP COLUMN IF EXISTS biometric_enrolled CASCADE;
      ALTER TABLE employees DROP COLUMN IF EXISTS biometric_enrolled_at CASCADE;
    `);
    console.log('[Migration] Legacy biometric columns removed.');

    // 3. Drop legacy biometric tables
    await query(`
      DROP TABLE IF EXISTS biometric_audit_logs CASCADE;
      DROP TABLE IF EXISTS biometric_history CASCADE;
      DROP TABLE IF EXISTS re_enrollment_requests CASCADE;
      DROP TABLE IF EXISTS managers CASCADE;
    `);
    console.log('[Migration] Legacy biometric tables removed.');

    // 4. Seed default shifts, departments & designations
    const deptCheck = await query('SELECT COUNT(*) FROM departments');
    if (parseInt(deptCheck.rows[0].count) === 0) {
      await query("INSERT INTO departments (name) VALUES ('Production'), ('Administration'), ('Logistics')");
      console.log('Seeded default departments.');
    }

    const designCheck = await query('SELECT COUNT(*) FROM designations');
    if (parseInt(designCheck.rows[0].count) === 0) {
      await query("INSERT INTO designations (name) VALUES ('Worker'), ('Supervisor'), ('Executive')");
      console.log('Seeded default designations.');
    }

    const shiftCheck = await query('SELECT COUNT(*) FROM shifts');
    if (parseInt(shiftCheck.rows[0].count) === 0) {
      await query(`
        INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time, working_hours)
        VALUES ('Morning Shift', '09:00:00', '09:15:00', '13:00:00', '18:00:00', 8.00)
      `);
      console.log('Seeded default shift: Morning Shift.');
    }

    // 5. Reconcile employee department/designation/shift foreign keys
    const defaultShift = await query("SELECT id FROM shifts WHERE name = 'Morning Shift' LIMIT 1");
    const defaultDept = await query("SELECT id FROM departments WHERE name = 'Production' LIMIT 1");
    const defaultDesign = await query("SELECT id FROM designations WHERE name = 'Worker' LIMIT 1");

    if (defaultShift.rows.length > 0 && defaultDept.rows.length > 0 && defaultDesign.rows.length > 0) {
      const shiftId = defaultShift.rows[0].id;
      const deptId = defaultDept.rows[0].id;
      const designId = defaultDesign.rows[0].id;

      await query(`
        UPDATE employees 
        SET shift_id = COALESCE(shift_id, $1),
            department_id = COALESCE(department_id, $2),
            designation_id = COALESCE(designation_id, $3)
      `, [shiftId, deptId, designId]);
    }

    // 6. Generate secure temporary passwords for existing employees without a password
    const uncredentialedEmployees = await query('SELECT id, employee_id FROM employees WHERE password_hash IS NULL');
    if (uncredentialedEmployees.rows.length > 0) {
      console.log(`[Migration] Generating secure temporary credentials for ${uncredentialedEmployees.rows.length} employees...`);
      for (const emp of uncredentialedEmployees.rows) {
        // Secure deterministic temporary password based on employee_id (e.g. Gaytri@GC-0001)
        const tempPassword = `Gaytri@${emp.employee_id}`;
        const tempHash = bcrypt.hashSync(tempPassword, 10);
        await query(
          'UPDATE employees SET password_hash = $1, require_password_change = TRUE WHERE id = $2',
          [tempHash, emp.id]
        );
      }
      console.log('[Migration] Secure activation passwords initialized.');
    }

    // 7. Seed default super admin if empty
    const superAdminCheck = await query("SELECT id FROM admins WHERE email = 'admin@gaytri.com' LIMIT 1");
    if (superAdminCheck.rows.length > 0) {
      console.log('Default super admin already exists.');
    } else {
      const { v4: uuidv4 } = require('uuid');
      const adminPasswordHash = bcrypt.hashSync('workforce@2026', 10);
      await query(`
        INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password)
        VALUES ($1, 'admin@gaytri.com', $2, 'Gaytri Admin', 'SUPER_ADMIN', TRUE, TRUE)
      `, [uuidv4(), adminPasswordHash]);
      console.log('Default super admin seeded successfully with temporary password "workforce@2026".');
    }

    // 8. Seed default manager account if empty
    const managerCheck = await query("SELECT id FROM admins WHERE email = 'manager@gaytri.com' LIMIT 1");
    if (managerCheck.rows.length === 0) {
      const { v4: uuidv4 } = require('uuid');
      const managerId = uuidv4();
      const managerHash = bcrypt.hashSync('workforce@2026', 10);
      await query(`
        INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password)
        VALUES ($1, 'manager@gaytri.com', $2, 'Gaytri Manager', 'MANAGER', TRUE, TRUE)
      `, [managerId, managerHash]);
      
      // Assign all active employees to this manager
      const activeEmps = await query('SELECT id FROM employees WHERE is_active = TRUE');
      for (const emp of activeEmps.rows) {
        await query(`
          INSERT INTO manager_employees (manager_id, employee_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [managerId, emp.id]);
      }
      console.log('Default manager seeded successfully with temporary password "workforce@2026".');
    }

    // Verify manager mappings and warn if any manager has no assigned employees
    const unmappedManagers = await query(`
      SELECT id, full_name, email FROM admins 
      WHERE role = 'MANAGER' AND id NOT IN (SELECT DISTINCT manager_id FROM manager_employees)
    `);
    if (unmappedManagers.rows.length > 0) {
      console.warn('======================================================================');
      console.warn('WARNING: The following manager accounts have no assigned employees:');
      for (const mgr of unmappedManagers.rows) {
        console.warn(`  - Name: ${mgr.full_name}, Email: ${mgr.email}`);
      }
      console.warn('They will NOT be able to view rosters or mark attendance.');
      console.warn('======================================================================');
    }

    // Backfill leave_balances for any existing employee that doesn't have a row
    const unbalancedEmployees = await query(`
      SELECT id FROM employees e 
      WHERE NOT EXISTS (SELECT 1 FROM leave_balances WHERE employee_id = e.id)
    `);
    if (unbalancedEmployees.rows.length > 0) {
      console.log(`[Migration] Generating default leave balances for ${unbalancedEmployees.rows.length} employees...`);
      for (const emp of unbalancedEmployees.rows) {
        await query(
          'INSERT INTO leave_balances (employee_id, casual_leave, sick_leave, paid_leave) VALUES ($1, 12, 12, 12) ON CONFLICT DO NOTHING',
          [emp.id]
        );
      }
      console.log('[Migration] Leave balances initialized.');
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
    // Start daily 6:00 PM auto-lock scheduler
    startAutoLockScheduler();
  } else {
    console.warn('Could not run database bootstrap, database not connected.');
  }

  app.listen(PORT, () => {
    console.log(`Gaytri Commercial Backend running on port ${PORT}`);
  });
};

startServer();
