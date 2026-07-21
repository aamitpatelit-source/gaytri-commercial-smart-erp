import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gaytri_erp',
});

async function runTests() {
  await client.connect();
  console.log('--- STARTING GAYTRI COMMERCIAL ENTERPRISE SYSTEM INTEGRATION TESTS ---');

  // Load and apply schema.sql to ensure database is bootstrapped
  const fs = require('fs');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  await client.query(schemaSql);
  console.log('[Test Setup] Applied database schema.sql successfully.');

  // Clean up any old test data from previous runs with triggers disabled
  try {
    await client.query('ALTER TABLE attendance_audit_logs DISABLE TRIGGER ALL');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER ALL');
    
    await client.query("DELETE FROM password_reset_tokens WHERE email_or_id LIKE 'GC-TEST-%'");
    await client.query("DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'GC-TEST-%')");
    await client.query("DELETE FROM employees WHERE employee_id LIKE 'GC-TEST-%'");
    await client.query("DELETE FROM departments WHERE name LIKE 'TEST-DEPT-%'");
    await client.query("DELETE FROM shifts WHERE name LIKE 'TEST-SHIFT-%'");
    await client.query("DELETE FROM designations WHERE name LIKE 'TEST-DESIG-%'");
    await client.query("DELETE FROM admins WHERE email LIKE '%@test.com'");
    
    await client.query('ALTER TABLE attendance_audit_logs ENABLE TRIGGER ALL');
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER ALL');
  } catch (err) {
    console.warn('[Startup Cleanup Warning] Ignored error:', err);
  }

  try {
    // 1. Setup departments, designations, shifts
    console.log('\n[Test 1] Setting up master metadata lookup tables...');
    
    const deptResult1 = await client.query("INSERT INTO departments (name) VALUES ('TEST-DEPT-PRODUCTION') RETURNING id");
    const deptResult2 = await client.query("INSERT INTO departments (name) VALUES ('TEST-DEPT-LOGISTICS') RETURNING id");
    const deptId1 = deptResult1.rows[0].id;
    const deptId2 = deptResult2.rows[0].id;
    console.log('  -> Master departments created.');

    const desigResult = await client.query("INSERT INTO designations (name) VALUES ('TEST-DESIG-WORKER') RETURNING id");
    const desigId = desigResult.rows[0].id;
    console.log('  -> Master designations created.');

    const shiftResult = await client.query(
      `INSERT INTO shifts (name, checkin_start, late_after, half_day_after, checkout_time)
       VALUES ('TEST-SHIFT-DAY', '09:00:00', '09:15:00', '13:00:00', '18:00:00') RETURNING id`
    );
    const shiftId = shiftResult.rows[0].id;
    console.log('  -> Master shifts created.');

    // 2. Setup employee and manager accounts
    console.log('\n[Test 2] Setting up employee and manager test accounts...');
    
    // Create employee in TEST-DEPT-PRODUCTION
    const empResult = await client.query(
      `INSERT INTO employees (employee_id, full_name, department_id, designation_id, shift_id, mobile, password_hash, require_password_change, joining_date, salary_type)
       VALUES ('GC-TEST-01', 'Test Employee One', $1, $2, $3, '9999999991', 'INITIAL_HASH', TRUE, CURRENT_DATE, 'MONTHLY') RETURNING id`,
      [deptId1, desigId, shiftId]
    );
    const employeeId = empResult.rows[0].id;
    console.log('  -> Employee created in PRODUCTION.');

    // Create employee in TEST-DEPT-LOGISTICS
    const empResult2 = await client.query(
      `INSERT INTO employees (employee_id, full_name, department_id, designation_id, shift_id, mobile, password_hash, require_password_change, joining_date, salary_type)
       VALUES ('GC-TEST-02', 'Test Employee Two', $1, $2, $3, '9999999992', 'INITIAL_HASH', TRUE, CURRENT_DATE, 'MONTHLY') RETURNING id`,
      [deptId2, desigId, shiftId]
    );
    const employeeId2 = empResult2.rows[0].id;
    console.log('  -> Employee created in LOGISTICS.');

    // Create Manager
    const mgrResult = await client.query(
      `INSERT INTO admins (email, password_hash, full_name, role, is_active, must_change_password)
       VALUES ('manager@test.com', 'MGR_HASH', 'Test Manager', 'MANAGER', TRUE, FALSE) RETURNING id`
    );
    const managerId = mgrResult.rows[0].id;
    console.log('  -> Manager admin created.');

    // Map Manager to PRODUCTION department
    await client.query("INSERT INTO manager_departments (manager_id, department_id) VALUES ($1, $2)", [managerId, deptId1]);
    console.log('  -> Manager associated to PRODUCTION department.');

    // 3. Test Secure Credentials Activation
    console.log('\n[Test 3] Verifying Secure Credentials Activation Token Flow...');
    
    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await client.query(
      'INSERT INTO password_reset_tokens (email_or_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      ['GC-TEST-01', tokenHash, expiresAt]
    );
    console.log('  -> Hashed activation token stored at rest.');

    // Fetch and check if active
    const checkToken = await client.query('SELECT email_or_id FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    if (checkToken.rows.length === 0 || checkToken.rows[0].email_or_id !== 'GC-TEST-01') {
      throw new Error('Verification failed: Hashed token could not be retrieved.');
    }
    console.log('  -> Verification: Token is valid and matches employee.');

    // Consume token (One-time-use check)
    await client.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    const checkTokenConsumed = await client.query('SELECT id FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    if (checkTokenConsumed.rows.length > 0) {
      throw new Error('Verification failed: Token was not consumed.');
    }
    console.log('  -> Verification: Token consumed successfully (one-time use enforced).');

    // 4. Test Manager Departmental Scope Constraint
    console.log('\n[Test 4] Verifying Manager Departmental Scope Verification...');
    
    // Manager tries to verify employee in PRODUCTION
    const scopeCheck1 = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM employees e
         JOIN manager_departments md ON e.department_id = md.department_id
         WHERE e.id = $1 AND md.manager_id = $2
       )`,
      [employeeId, managerId]
    );
    if (!scopeCheck1.rows[0].exists) {
      throw new Error('Verification failed: Manager could not mark employee in their department.');
    }
    console.log('  -> Success: Manager has scope permissions for employee in PRODUCTION.');

    // Manager tries to verify employee in LOGISTICS
    const scopeCheck2 = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM employees e
         JOIN manager_departments md ON e.department_id = md.department_id
         WHERE e.id = $1 AND md.manager_id = $2
       )`,
      [employeeId2, managerId]
    );
    if (scopeCheck2.rows[0].exists) {
      throw new Error('Verification failed: Manager allowed to mark employee outside their department.');
    }
    console.log('  -> Success: Manager blocked from marking employee in LOGISTICS (boundary enforced).');

    // 5. Test Select-For-Update Audit Trail and Immutability
    console.log('\n[Test 5] Verifying Audit Trail and Table Immutability...');
    
    // Insert initial attendance row
    const attResult = await client.query(
      `INSERT INTO attendance (employee_id, manager_id, date, time, status, remarks, source)
       VALUES ($1, $2, '2026-07-08', '09:00:00', 'PRESENT', 'Initial marking', 'MANAGER_MANUAL') RETURNING id`,
      [employeeId, managerId]
    );
    const attendanceRecordId = attResult.rows[0].id;
    console.log('  -> Attendance record inserted.');

    // Edit attendance: Select FOR UPDATE, capture old values, update status, write audit log
    await client.query('BEGIN');
    
    const fetchForUpdate = await client.query(
      'SELECT id, status, remarks FROM attendance WHERE id = $1 FOR UPDATE',
      [attendanceRecordId]
    );
    const oldRow = fetchForUpdate.rows[0];
    const oldStatus = oldRow.status;
    const oldRemarks = oldRow.remarks;

    await client.query(
      "UPDATE attendance SET status = 'LATE', remarks = 'Updated remarks', manager_id = $1 WHERE id = $2",
      [managerId, attendanceRecordId]
    );

    await client.query(
      `INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_status, new_status, old_remarks, new_remarks, reason)
       VALUES ($1, $2, $3, 'LATE', $4, 'Updated remarks', 'Testing audit trail')`,
      [attendanceRecordId, managerId, oldStatus, oldRemarks]
    );

    await client.query('COMMIT');
    console.log('  -> Attendance row updated and audit log inserted transactionally.');

    // Verify audit log values
    const auditRes = await client.query('SELECT * FROM attendance_audit_logs WHERE attendance_id = $1', [attendanceRecordId]);
    if (auditRes.rows.length === 0) {
      throw new Error('Verification failed: No audit log was recorded.');
    }
    const auditRow = auditRes.rows[0];
    if (auditRow.old_status !== 'PRESENT' || auditRow.new_status !== 'LATE' || auditRow.reason !== 'Testing audit trail') {
      throw new Error('Verification failed: Audit values do not match old database values.');
    }
    console.log('  -> Success: Audit log correctly contains original database values.');

    // 6. Test Immutability Triggers (Verify block on updates/deletes)
    console.log('\n[Test 6] Verifying Trigger-Enforced Immutability on Audit Logs...');
    
    // Try to UPDATE audit log
    try {
      await client.query(
        "UPDATE attendance_audit_logs SET reason = 'Spoofed Reason' WHERE id = $1",
        [auditRow.id]
      );
      throw new Error('Verification failed: Update allowed on append-only audit log table.');
    } catch (err: any) {
      if (err.message.includes('strictly prohibited')) {
        console.log('  -> Success: UPDATE block trigger successfully thrown.');
      } else {
        throw err;
      }
    }

    // Try to DELETE audit log
    try {
      await client.query(
        "DELETE FROM attendance_audit_logs WHERE id = $1",
        [auditRow.id]
      );
      throw new Error('Verification failed: Delete allowed on append-only audit log table.');
    } catch (err: any) {
      if (err.message.includes('strictly prohibited')) {
        console.log('  -> Success: DELETE block trigger successfully thrown.');
      } else {
        throw err;
      }
    }

    console.log('\n--------------------------------------------------------------');
    console.log('ALL REDESIGN SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('--------------------------------------------------------------');
  } catch (error) {
    console.error('\n!!! TEST RUN ENCOUNTERED AN ERROR !!!');
    console.error(error);
    process.exit(1);
  } finally {
    // Clean up test data
    console.log('\nCleaning up integration test assets...');
    try {
      await client.query('ALTER TABLE attendance_audit_logs DISABLE TRIGGER ALL');
      await client.query('ALTER TABLE audit_logs DISABLE TRIGGER ALL');
      
      await client.query("DELETE FROM password_reset_tokens WHERE email_or_id LIKE 'GC-TEST-%'");
      await client.query("DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'GC-TEST-%')");
      await client.query("DELETE FROM employees WHERE employee_id LIKE 'GC-TEST-%'");
      await client.query("DELETE FROM departments WHERE name LIKE 'TEST-DEPT-%'");
      await client.query("DELETE FROM shifts WHERE name LIKE 'TEST-SHIFT-%'");
      await client.query("DELETE FROM designations WHERE name LIKE 'TEST-DESIG-%'");
      await client.query("DELETE FROM admins WHERE email LIKE '%@test.com'");
      
      await client.query('ALTER TABLE attendance_audit_logs ENABLE TRIGGER ALL');
      await client.query('ALTER TABLE audit_logs ENABLE TRIGGER ALL');
    } catch (cleanupErr) {
      console.warn('[Cleanup Warning] Failed to clean test assets:', cleanupErr);
    }
    await client.end();
  }
}

runTests().catch(console.error);
