const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function runQueries() {
  await client.connect();
  console.log("1. Connected to PostgreSQL successfully.");

  // Query 1: Total staff count
  try {
    const totalEmpRes = await client.query('SELECT COUNT(*) as count FROM employees WHERE is_active = TRUE');
    console.log("✔ Query 1 success: total employees =", totalEmpRes.rows[0].count);
  } catch (err) {
    console.error("❌ Query 1 failed:", err.message);
  }

  // Query 2: Total active managers count
  try {
    const totalMgrRes = await client.query("SELECT COUNT(*) as count FROM admins WHERE role = 'MANAGER' AND is_active = TRUE");
    console.log("✔ Query 2 success: total managers =", totalMgrRes.rows[0].count);
  } catch (err) {
    console.error("❌ Query 2 failed:", err.message);
  }

  // Query 3: Group counts by status
  const today = '2026-07-27';
  try {
    const attendanceRes = await client.query(
      `SELECT status, COUNT(*) as count 
       FROM attendance 
       WHERE date = $1 AND is_deleted = FALSE
       GROUP BY status`,
      [today]
    );
    console.log("✔ Query 3 success: attendance records count =", attendanceRes.rows.length);
  } catch (err) {
    console.error("❌ Query 3 failed:", err.message);
  }

  // Query 4: Last Checkout Today
  try {
    const lastCheckoutRes = await client.query(
      `SELECT e.full_name, a.check_out_time
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = $1 AND a.check_out_time IS NOT NULL AND a.is_deleted = FALSE
       ORDER BY a.check_out_time DESC
       LIMIT 1`,
      [today]
    );
    console.log("✔ Query 4 success: last checkout row count =", lastCheckoutRes.rows.length);
  } catch (err) {
    console.error("❌ Query 4 failed:", err.message);
  }

  // Query 5: Recent logs feed
  try {
    const feedRes = await client.query(
      `SELECT a.date, a.time, COALESCE(a.check_in_time, a.time) as check_in_time, a.check_out_time as check_out, a.status, a.remarks, e.full_name, e.employee_id, d.name as department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.date = $1 AND a.is_deleted = FALSE
       ORDER BY a.updated_at DESC
       LIMIT 10`,
      [today]
    );
    console.log("✔ Query 5 success: recent logs count =", feedRes.rows.length);
  } catch (err) {
    console.error("❌ Query 5 failed:", err.message);
  }

  await client.end();
}

runQueries().catch(console.error);
