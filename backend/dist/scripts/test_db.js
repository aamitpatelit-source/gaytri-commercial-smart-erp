"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../config/db");
async function main() {
    try {
        // 1. Get admin/manager accounts
        const adminsRes = await (0, db_1.query)('SELECT id, email, full_name, role, is_active FROM admins');
        console.log('\n--- ADMINS & MANAGERS ---');
        console.table(adminsRes.rows);
        // 2. Get department mappings
        const mappingsRes = await (0, db_1.query)(`
      SELECT md.manager_id, a.full_name as manager_name, md.department_id, d.name as department_name
      FROM manager_departments md
      JOIN admins a ON md.manager_id = a.id
      JOIN departments d ON md.department_id = d.id
    `);
        console.log('\n--- MANAGER DEPARTMENT MAPPINGS ---');
        console.table(mappingsRes.rows);
        // 3. Get employees
        const employeesRes = await (0, db_1.query)(`
      SELECT e.id, e.employee_id, e.full_name, e.department_id, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LIMIT 10
    `);
        console.log('\n--- EMPLOYEES (first 10) ---');
        console.table(employeesRes.rows);
    }
    catch (err) {
        console.error('Database connection or query failed:', err.message);
    }
}
main();
