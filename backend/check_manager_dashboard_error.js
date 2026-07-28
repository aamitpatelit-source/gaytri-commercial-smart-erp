const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL successfully.");

  const managerId = '1f13ed9a-3976-4d14-8422-6ebd25c748f3'; // seeded manager
  const today = '2026-07-27';

  // Query 1: Total staff count for manager
  try {
    const totalEmpRes = await client.query(
      `SELECT COUNT(*) as count FROM employees e
       WHERE e.is_active = TRUE
         AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $1)`,
       [managerId]
    );
    console.log("✔ Query 1 success: total employees =", totalEmpRes.rows[0].count);
  } catch (err) {
    console.error("❌ Query 1 failed:", err.message);
  }

  // Query 2: Group counts by status for manager
  try {
    const attendanceRes = await client.query(
      `SELECT a.status, COUNT(*) as count 
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = $1 
         AND a.is_deleted = FALSE
         AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
       GROUP BY a.status`,
      [today, managerId]
    );
    console.log("✔ Query 2 success: attendance records =", attendanceRes.rows.length);
  } catch (err) {
    console.error("❌ Query 2 failed:", err.message);
  }

  // Query 3: Last Checkout Today for manager
  try {
    const lastCheckoutRes = await client.query(
      `SELECT e.full_name, a.check_out_time
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = $1 AND a.check_out_time IS NOT NULL AND a.is_deleted = FALSE
         AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
       ORDER BY a.check_out_time DESC
       LIMIT 1`,
      [today, managerId]
    );
    console.log("✔ Query 3 success: last checkout =", lastCheckoutRes.rows.length);
  } catch (err) {
    console.error("❌ Query 3 failed:", err.message);
  }

  // Query 4: Recent logs feed for manager
  try {
    const feedRes = await client.query(
      `SELECT a.date, a.time, COALESCE(a.check_in_time, a.time) as check_in_time, a.check_out_time as check_out, a.status, a.remarks, e.full_name, e.employee_id, d.name as department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.date = $1 
         AND a.is_deleted = FALSE
         AND e.id IN (SELECT employee_id FROM manager_employees WHERE manager_id = $2)
       ORDER BY a.updated_at DESC
       LIMIT 10`,
      [today, managerId]
    );
    console.log("✔ Query 4 success: recent logs count =", feedRes.rows.length);
  } catch (err) {
    console.error("❌ Query 4 failed:", err.message);
  }

  await client.end();
}
run().catch(console.error);
