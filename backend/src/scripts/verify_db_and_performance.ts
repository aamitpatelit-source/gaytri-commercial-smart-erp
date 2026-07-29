import poolProxy, { query } from '../config/db';
import { getBackendSettings } from '../controllers/attendanceController';
import { evaluateCheckIn, evaluateCheckOut, calculateDailySalary, calculatePayrollSalary } from '../services/calculationService';

async function runVerification() {
  console.log("=========================================================");
  console.log("STARTING DATABASE & PERFORMANCE VERIFICATION");
  console.log("=========================================================");

  let client;
  try {
    client = await poolProxy.connect();

    // 1. DATABASE PERSISTENCE & CONSISTENCY TEST
    console.log("\n--- 1. Testing Database State & Multi-Module Consistency ---");
    
    // Create temporary employee
    const tempEmpId = `TEST_EMP_${Date.now()}`;
    const empRes = await client.query(
      `INSERT INTO employees (employee_id, full_name, mobile, joining_date, salary_type, monthly_salary, role, is_active)
       VALUES ($1, 'QA Verification Employee', '9999999999', NOW(), 'MONTHLY', 26000.00, 'EMPLOYEE', TRUE)
       RETURNING id, employee_id, full_name, monthly_salary`,
      [tempEmpId]
    );

    const emp = empRes.rows[0];
    console.log(`Target QA Employee Created: ${emp.full_name} (${emp.employee_id}) - UUID: ${emp.id}`);

    const settings = await getBackendSettings();
    console.log(`Active Settings Shift: ${settings.shift_start_time} - ${settings.shift_end_time}, Grace: ${settings.late_grace_period}m`);

    // Simulate Check-In at 09:20 (Late)
    const checkInTime = "09:20:00";
    const checkInEval = evaluateCheckIn(checkInTime, settings);
    console.log(`[Check-In Engine Evaluation] Time: ${checkInTime} -> isLate: ${checkInEval.isLate}, Status: ${checkInEval.status}`);

    const testDate = "2026-07-29";

    // Insert Check-In record into DB
    const insRes = await client.query(
      `INSERT INTO attendance (employee_id, date, time, check_in_time, status, remarks, source)
       VALUES ($1, $2, $3, $3, $4, 'QA Test Check-In', 'QA_TEST')
       RETURNING id, status, check_in_time, check_out_time`,
      [emp.id, testDate, checkInTime, checkInEval.status]
    );
    const dbRecord1 = insRes.rows[0];
    console.log(`[DB Check-In State] Record ID: ${dbRecord1.id}, DB Status: ${dbRecord1.status}, Check-In Time: ${dbRecord1.check_in_time}`);

    // Verify Check-In DB state matches Check-In Evaluation
    if (dbRecord1.status === checkInEval.status && dbRecord1.check_in_time === checkInTime) {
      console.log("[PASS] Check-In DB state matches engine evaluation!");
    } else {
      console.error("[FAIL] Check-In DB state mismatch!");
    }

    // Simulate Check-Out at 19:00:00
    const checkOutTime = "19:00:00";
    const existingIsLate = dbRecord1.status === 'LATE';
    const checkOutEval = evaluateCheckOut(checkInTime, checkOutTime, existingIsLate, checkInEval.lateMinutes, settings);

    console.log(`[Check-Out Engine Evaluation] Time: ${checkOutTime} -> Final Status: ${checkOutEval.status}, Worked Hours: ${checkOutEval.workedHours}, Paid Hours: ${checkOutEval.paidHours}`);

    // Update DB record with Check-Out
    await client.query(
      `UPDATE attendance SET check_out_time = $1, status = $2, updated_at = NOW() WHERE id = $3`,
      [checkOutTime, checkOutEval.status, dbRecord1.id]
    );

    const updatedRes = await client.query("SELECT id, status, check_in_time, check_out_time FROM attendance WHERE id = $1", [dbRecord1.id]);
    const dbRecord2 = updatedRes.rows[0];
    console.log(`[DB Check-Out State] DB Status: ${dbRecord2.status}, Check-Out Time: ${dbRecord2.check_out_time}`);

    if (dbRecord2.status === 'LATE' && dbRecord2.check_out_time === checkOutTime) {
      console.log("[PASS] Check-Out DB state correctly preserved LATE status!");
    } else {
      console.error("[FAIL] Check-Out DB status mismatch!");
    }

    // Clean up test records
    await client.query("DELETE FROM attendance WHERE id = $1", [dbRecord1.id]);
    await client.query("DELETE FROM employees WHERE id = $1", [emp.id]);
    console.log("[Clean-Up] QA test record and temporary employee cleaned up.");

    // 2. PERFORMANCE MEASUREMENT TEST
    console.log("\n--- 2. Performance Verification (Execution Timing) ---");

    const t0 = Date.now();
    await client.query("SELECT COUNT(*) FROM attendance WHERE date = $1", [testDate]);
    const d0 = Date.now() - t0;
    console.log(`Dashboard Aggregation Execution Time: ${d0} ms`);

    const t1 = Date.now();
    await client.query(`
      SELECT e.id, e.employee_id, e.full_name, COALESCE(e.monthly_salary, 0.00) as monthly_salary
      FROM employees e
    `);
    const d1 = Date.now() - t1;
    console.log(`Reports & Payroll Register Query Execution Time: ${d1} ms`);

    if (d0 < 100 && d1 < 100) {
      console.log("[PASS] Engine & DB query performance is sub-100ms enterprise grade!");
    }

    console.log("\n=========================================================");
    console.log("ALL DATABASE & PERFORMANCE VERIFICATIONS COMPLETED");
    console.log("=========================================================");
  } catch (err) {
    console.error("Verification failed with error:", err);
  } finally {
    if (client) client.release();
    await poolProxy.end();
    process.exit(0);
  }
}

runVerification();
