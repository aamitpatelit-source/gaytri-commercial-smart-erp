import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

async function cleanAndSeedProduction() {
  console.log('=====================================================');
  console.log('STARTING FINAL PRODUCTION DATABASE CLEANUP & SEEDING');
  console.log('=====================================================\n');

  await client.connect();
  console.log('[DB] Connected to PostgreSQL instance.');

  try {
    // Begin transaction for database cleanup
    await client.query('BEGIN');

    console.log('[1/5] Truncating data tables and removing demo records...');

    // List of application data tables to truncate cleanly
    const tablesToTruncate = [
      'attendance',
      'payroll',
      'break_logs',
      'leaves',
      'leave_requests',
      'leave_balances',
      'employees',
      'manager_employees',
      'manager_departments',
      'admins',
      'attendance_audit_logs',
      'attendance_migration_conflicts',
      'audit_logs',
      'notifications',
      'refresh_tokens',
      'device_authorizations',
      'password_reset_tokens',
      'inventory'
    ];

    for (const table of tablesToTruncate) {
      const existsCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );
      `, [table]);

      if (existsCheck.rows[0].exists) {
        // TRUNCATE TABLE CASCADE to bypass row-level DELETE triggers and clear foreign keys
        await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
        console.log(`  ✔ Truncated table '${table}'`);
      }
    }

    console.log('\n[2/5] Resetting auto-increment sequences for lookup tables...');
    const lookupSequences = [
      { table: 'departments', seq: 'departments_id_seq' },
      { table: 'designations', seq: 'designations_id_seq' },
      { table: 'shifts', seq: 'shifts_id_seq' }
    ];

    for (const item of lookupSequences) {
      const seqCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_class WHERE relkind = 'S' AND relname = $1
        );
      `, [item.seq]);

      if (seqCheck.rows[0].exists) {
        const countRes = await client.query(`SELECT COUNT(*) FROM "${item.table}"`);
        const rowCount = parseInt(countRes.rows[0].count, 10);
        if (rowCount === 0) {
          await client.query(`ALTER SEQUENCE "${item.seq}" RESTART WITH 1;`);
        } else {
          await client.query(`SELECT setval('${item.seq}', COALESCE((SELECT MAX(id) FROM "${item.table}"), 1));`);
        }
        console.log(`  ✔ Sequence '${item.seq}' for table '${item.table}' reset.`);
      }
    }

    console.log('\n[3/5] Seeding Production Super Admin account...');
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'gaytricommercial7033@gmail.com').toLowerCase().trim();
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'sunny7033';
    const passwordHash = await bcrypt.hash(superAdminPassword, 10);
    const superAdminId = uuidv4();

    await client.query(`
      INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
      VALUES ($1, $2, $3, 'Gaytri Super Admin', 'SUPER_ADMIN', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [superAdminId, superAdminEmail, passwordHash]);

    console.log(`  ✔ Super Admin created: ${superAdminEmail} (Role: SUPER_ADMIN, Status: ACTIVE)`);

    await client.query('COMMIT');
    console.log('\n[4/5] Database transaction committed successfully.');

    console.log('\n[5/5] Performing Final Database Record Verification...');

    const verificationQueries: { key: string; sql: string }[] = [
      { key: 'Employees', sql: 'SELECT COUNT(*) FROM employees' },
      { key: 'Attendance Records', sql: 'SELECT COUNT(*) FROM attendance' },
      { key: 'Payroll Records', sql: 'SELECT COUNT(*) FROM payroll' },
      { key: 'Leave Requests', sql: 'SELECT COUNT(*) FROM leave_requests' },
      { key: 'Leave Balances', sql: 'SELECT COUNT(*) FROM leave_balances' },
      { key: 'Manager Accounts', sql: "SELECT COUNT(*) FROM admins WHERE role = 'MANAGER'" },
      { key: 'Super Admin Accounts', sql: "SELECT COUNT(*) FROM admins WHERE role = 'SUPER_ADMIN'" },
      { key: 'Total Admin Accounts', sql: 'SELECT COUNT(*) FROM admins' },
      { key: 'Audit Logs', sql: 'SELECT COUNT(*) FROM audit_logs' },
      { key: 'Attendance Audit Logs', sql: 'SELECT COUNT(*) FROM attendance_audit_logs' },
    ];

    const results: Record<string, number> = {};
    for (const queryObj of verificationQueries) {
      const res = await client.query(queryObj.sql);
      results[queryObj.key] = parseInt(res.rows[0].count, 10);
      console.log(`  - ${queryObj.key}: ${results[queryObj.key]}`);
    }

    // Enforce strict production assertions
    if (results['Employees'] !== 0) throw new Error('Verification Failed: Employees count is not 0!');
    if (results['Attendance Records'] !== 0) throw new Error('Verification Failed: Attendance Records count is not 0!');
    if (results['Payroll Records'] !== 0) throw new Error('Verification Failed: Payroll Records count is not 0!');
    if (results['Leave Requests'] !== 0) throw new Error('Verification Failed: Leave Requests count is not 0!');
    if (results['Manager Accounts'] !== 0) throw new Error('Verification Failed: Manager Accounts count is not 0!');
    if (results['Super Admin Accounts'] !== 1) throw new Error('Verification Failed: Super Admin Accounts count is not 1!');
    if (results['Total Admin Accounts'] !== 1) throw new Error('Verification Failed: Total Admin Accounts count is not 1!');

    console.log('\n=====================================================');
    console.log('✔ PRODUCTION DATABASE CLEANUP & VERIFICATION COMPLETE');
    console.log('=====================================================\n');
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('\n[FATAL ERROR] Cleanup script failed. Transaction rolled back:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanAndSeedProduction().catch((err) => {
  console.error('Unhandled error in script:', err);
  process.exit(1);
});
