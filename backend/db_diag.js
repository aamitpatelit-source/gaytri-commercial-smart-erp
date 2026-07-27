const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const dbClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'gaytri_erp',
  });

  await dbClient.connect();
  try {
    console.log("=== EMPLOYEES ===");
    const empRes = await dbClient.query('SELECT id, employee_id, full_name, is_active FROM employees');
    console.log(JSON.stringify(empRes.rows, null, 2));

    console.log("=== ADMINS/MANAGERS ===");
    const adminRes = await dbClient.query('SELECT id, email, full_name, role, is_active FROM admins');
    console.log(JSON.stringify(adminRes.rows, null, 2));

    console.log("=== MANAGER_EMPLOYEES MAPPINGS ===");
    const mappingRes = await dbClient.query('SELECT * FROM manager_employees');
    console.log(JSON.stringify(mappingRes.rows, null, 2));
  } catch (err) {
    console.error("Diagnostic error:", err);
  } finally {
    await dbClient.end();
  }
}

run();
