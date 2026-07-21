const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gaytri_erp',
});

async function runQueries() {
  await client.connect();
  console.log("Connected to PostgreSQL");

  // Query 1
  console.log("\n==================== QUERY 1 ====================");
  try {
    const q1 = await client.query(`
      SELECT
          id,
          email,
          role
      FROM admins
      WHERE email = 'amit8340@gmail.com';
    `);
    console.log(JSON.stringify(q1.rows, null, 2));
  } catch (err) {
    console.error("Query 1 failed:", err.message);
  }

  // Query 2
  console.log("\n==================== QUERY 2 ====================");
  try {
    const q2 = await client.query(`
      SELECT
          me.manager_id,
          me.employee_id,
          e.employee_id AS employee_code,
          e.full_name
      FROM manager_employees me
      JOIN employees e
      ON me.employee_id = e.id
      ORDER BY e.employee_id;
    `);
    console.log(JSON.stringify(q2.rows, null, 2));
  } catch (err) {
    console.error("Query 2 failed:", err.message);
  }

  // Query 3
  console.log("\n==================== QUERY 3 ====================");
  try {
    const q3 = await client.query(`
      SELECT
          id,
          employee_id,
          full_name,
          status
      FROM employees
      ORDER BY employee_id;
    `);
    console.log(JSON.stringify(q3.rows, null, 2));
  } catch (err) {
    console.error("Query 3 failed:", err.message);
    console.log("Retrying Query 3 without 'status' (using 'is_active' instead):");
    try {
      const q3_alt = await client.query(`
        SELECT
            id,
            employee_id,
            full_name,
            is_active
        FROM employees
        ORDER BY employee_id;
      `);
      console.log(JSON.stringify(q3_alt.rows, null, 2));
    } catch (err2) {
      console.error("Alt Query 3 failed:", err2.message);
    }
  }

  // Query 4
  console.log("\n==================== QUERY 4 ====================");
  try {
    const q4 = await client.query(`
      SELECT
          id,
          employee_id,
          full_name,
          status
      FROM employees
      WHERE employee_id IN ('GC-1','GC-2','GC-87');
    `);
    console.log(JSON.stringify(q4.rows, null, 2));
  } catch (err) {
    console.error("Query 4 failed:", err.message);
    console.log("Retrying Query 4 without 'status' (using 'is_active' instead):");
    try {
      const q4_alt = await client.query(`
        SELECT
            id,
            employee_id,
            full_name,
            is_active
        FROM employees
        WHERE employee_id IN ('GC-1','GC-2','GC-87');
      `);
      console.log(JSON.stringify(q4_alt.rows, null, 2));
    } catch (err2) {
      console.error("Alt Query 4 failed:", err2.message);
    }
  }

  await client.end();
}

runQueries().catch(console.error);
