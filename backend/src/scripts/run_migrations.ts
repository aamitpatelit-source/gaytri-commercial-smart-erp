import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  console.log('[Migration Runner] Connecting to database...');
  await client.connect();

  try {
    // 1. Create schema_migrations tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get current applied max version
    const versionRes = await client.query('SELECT MAX(version) as max_ver FROM schema_migrations');
    const currentVer = versionRes.rows[0].max_ver || 0;
    console.log(`[Migration Runner] Current database schema version: ${currentVer}`);

    // --- MIGRATION V1: Attendance DDL Columns & Status Constraints ---
    if (currentVer < 1) {
      console.log('[Migration Runner] Starting Migration v1: Attendance Audit & Status Schema Alignment...');
      await client.query('BEGIN');

      // Add missing columns to attendance table
      const columns = [
        "check_in_time TIME",
        "check_out_time TIME",
        "gps_lat_in DOUBLE PRECISION",
        "gps_lng_in DOUBLE PRECISION",
        "gps_lat_out DOUBLE PRECISION",
        "gps_lng_out DOUBLE PRECISION",
        "device_name VARCHAR(150)",
        "network_type VARCHAR(50)",
        "battery_percentage INTEGER",
        "face_image_url VARCHAR(255)",
        "created_by UUID REFERENCES admins(id) ON DELETE SET NULL",
        "updated_by UUID REFERENCES admins(id) ON DELETE SET NULL",
        "is_locked BOOLEAN DEFAULT FALSE",
        "is_deleted BOOLEAN DEFAULT FALSE",
        "created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        "updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
      ];

      for (const col of columns) {
        const colName = col.split(' ')[0];
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'attendance' AND column_name = '${colName}'
            ) THEN
              ALTER TABLE attendance ADD COLUMN ${col};
            END IF;
          END $$;
        `);
      }

      // Reconcile status check constraint
      const constraintCheck = await client.query(`
        SELECT con.conname, pg_get_constraintdef(con.oid) as def
        FROM pg_constraint con
        WHERE con.conrelid = 'attendance'::regclass AND con.contype = 'c' AND con.conname = 'attendance_status_check';
      `);

      let needsConstraintUpdate = true;
      if (constraintCheck.rows.length > 0) {
        const def = constraintCheck.rows[0].def;
        if (def.includes('WORKING') && def.includes('MISSED_CHECKOUT')) {
          needsConstraintUpdate = false;
        }
      }

      if (needsConstraintUpdate) {
        console.log('[Migration Runner] Updating attendance_status_check constraint...');
        await client.query('ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;');
        await client.query(`
          ALTER TABLE attendance ADD CONSTRAINT attendance_status_check 
          CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'WORK_FROM_HOME', 'ON_DUTY', 'VOIDED', 'WORKING', 'MISSED_CHECKOUT'));
        `);
      }

      // Mark migration 1 as complete inside transaction
      await client.query('INSERT INTO schema_migrations (version) VALUES (1);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v1 committed successfully.');
    }

    // --- MIGRATION V2: Ensure schema_version is marked version 2 ---
    if (currentVer < 2) {
      console.log('[Migration Runner] Starting Migration v2: Version Marker Sync...');
      await client.query('BEGIN');
      await client.query('INSERT INTO schema_migrations (version) VALUES (2);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v2 committed successfully.');
    }

    // --- MIGRATION V3: Employee Soft Delete Schema Alignment ---
    if (currentVer < 3) {
      console.log('[Migration Runner] Starting Migration v3: Employee Soft-Delete Columns...');
      await client.query('BEGIN');

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'is_deleted') THEN
            ALTER TABLE employees ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'deleted_at') THEN
            ALTER TABLE employees ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
          END IF;
        END $$;
      `);

      await client.query('INSERT INTO schema_migrations (version) VALUES (3);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v3 committed successfully.');
    }

    // --- MIGRATION V4: Monthly Salary Schema Alignment ---
    if (currentVer < 4) {
      console.log('[Migration Runner] Starting Migration v4: Employee Monthly Salary Column...');
      await client.query('BEGIN');

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'monthly_salary') THEN
            ALTER TABLE employees ADD COLUMN monthly_salary DECIMAL(12,2) DEFAULT 0.00;
          END IF;
        END $$;
      `);

      await client.query('INSERT INTO schema_migrations (version) VALUES (4);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v4 committed successfully.');
    }

    // --- MIGRATION V5: Employee Profile Picture URL Alignment ---
    if (currentVer < 5) {
      console.log('[Migration Runner] Starting Migration v5: Employee Profile Picture Columns...');
      await client.query('BEGIN');

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'profile_photo_url') THEN
            ALTER TABLE employees ADD COLUMN profile_photo_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'profile_image_url') THEN
            ALTER TABLE employees ADD COLUMN profile_image_url TEXT;
          END IF;
        END $$;
      `);

      await client.query('INSERT INTO schema_migrations (version) VALUES (5);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v5 committed successfully.');
    }

    // --- MIGRATION V6: Seed Production Super Admin & Clean Legacy Demo Data ---
    if (currentVer < 6) {
      console.log('[Migration Runner] Starting Migration v6: Production Super Admin Seed & Legacy Cleanup...');
      await client.query('BEGIN');

      const bcrypt = require('bcryptjs');
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'gaytricommercial7033@gmail.com').toLowerCase().trim();
      const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'sunny7033';
      const passwordHash = bcrypt.hashSync(superAdminPassword, 10);

      // 1. Delete legacy demo accounts
      await client.query("DELETE FROM admins WHERE email IN ('admin@gaytri.com', 'manager@gaytri.com')");

      // 2. Clear legacy test data tables
      const tablesToClean = [
        'attendance',
        'payroll',
        'break_logs',
        'leaves',
        'leave_requests',
        'leave_balances',
        'employees',
        'manager_employees',
        'manager_departments',
        'attendance_migration_conflicts',
        'notifications',
        'refresh_tokens',
        'device_authorizations',
        'password_reset_tokens',
        'inventory'
      ];

      for (const table of tablesToClean) {
        const tblExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          );
        `, [table]);

        if (tblExists.rows[0].exists) {
          await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
        }
      }

      // 3. Upsert Production Super Admin
      await client.query(`
        INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, 'Gaytri Super Admin', 'SUPER_ADMIN', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = 'SUPER_ADMIN',
          is_active = TRUE,
          must_change_password = FALSE,
          updated_at = CURRENT_TIMESTAMP
      `, [superAdminEmail, passwordHash]);

      await client.query('INSERT INTO schema_migrations (version) VALUES (6);');
      await client.query('COMMIT');
      console.log('[Migration Runner] Migration v6 committed successfully.');
    }

    console.log('[Migration Runner] All database migrations completed cleanly.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Migration Runner FATAL ERROR] Migration failed and transaction was rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error('[Migration Runner Error]', err);
  process.exit(1);
});
