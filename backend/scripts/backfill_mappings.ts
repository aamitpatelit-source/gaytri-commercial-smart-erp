import poolProxy, { query } from '../src/config/db';

async function backfill() {
  console.log("=== STARTING MANAGER MAPPINGS BACKFILL ===");
  
  // 1. Resolve manager
  let managerId: string | null = null;
  const defaultMgrRes = await query("SELECT id FROM admins WHERE email = 'manager@gaytri.com' AND role = 'MANAGER' AND is_active = TRUE LIMIT 1");
  if (defaultMgrRes.rows.length > 0) {
    managerId = defaultMgrRes.rows[0].id;
    console.log(`Resolved default manager 'manager@gaytri.com' with ID: ${managerId}`);
  } else {
    const fallbackMgrRes = await query("SELECT id FROM admins WHERE role = 'MANAGER' AND is_active = TRUE LIMIT 1");
    if (fallbackMgrRes.rows.length > 0) {
      managerId = fallbackMgrRes.rows[0].id;
      console.log(`Resolved fallback active manager with ID: ${managerId}`);
    }
  }

  if (!managerId) {
    console.error("Error: No active manager account found in the database. Backfill aborted.");
    process.exit(1);
  }

  // 2. Fetch unmapped employees
  const unmappedEmpsRes = await query(
    `SELECT id, employee_id, full_name 
     FROM employees 
     WHERE is_active = TRUE 
       AND id NOT IN (SELECT DISTINCT employee_id FROM manager_employees)`
  );

  console.log(`Found ${unmappedEmpsRes.rows.length} unmapped active employees.`);

  // 3. Insert mappings transactionally
  const client = await poolProxy.connect();
  try {
    await client.query('BEGIN');
    for (const emp of unmappedEmpsRes.rows) {
      console.log(`Mapping Employee: ${emp.employee_id} (${emp.full_name}) -> Manager ID: ${managerId}`);
      await client.query(
        'INSERT INTO manager_employees (manager_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [managerId, emp.id]
      );
    }
    await client.query('COMMIT');
    console.log("=== BACKFILL COMPLETED SUCCESSFULLY ===");
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error("Transaction failed, rolled back. Error:", err.message);
  } finally {
    client.release();
  }
}

backfill().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
