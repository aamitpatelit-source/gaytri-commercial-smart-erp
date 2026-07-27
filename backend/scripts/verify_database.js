const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function verifyDatabase() {
  console.log('--- STARTING DATABASE LOGIC VALIDATION ---');
  await client.connect();

  try {
    // 1. Verify table columns exist
    console.log('Checking DDL columns...');
    const columnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'attendance' 
      AND column_name IN (
        'check_in_time', 'check_out_time', 
        'gps_lat_in', 'gps_lng_in', 'gps_lat_out', 'gps_lng_out', 
        'device_name', 'network_type', 'battery_percentage', 'face_image_url',
        'created_by', 'updated_by'
      );
    `);
    
    console.log(`Detected ${columnsRes.rows.length} new attendance columns:`);
    columnsRes.rows.forEach(col => {
      console.log(` - ${col.column_name}: ${col.data_type}`);
    });

    if (columnsRes.rows.length < 12) {
      throw new Error(`Missing columns! Only detected ${columnsRes.rows.length} columns.`);
    }
    console.log('✔ All DDL columns verified.');

    // 2. Verify status check constraint
    console.log('\nChecking check constraint values...');
    const constraintRes = await client.query(`
      SELECT con.conname, pg_get_constraintdef(con.oid) as def
      FROM pg_constraint con
      WHERE con.conrelid = 'attendance'::regclass 
      AND con.contype = 'c';
    `);

    let isConstraintValid = false;
    constraintRes.rows.forEach(row => {
      console.log(`Constraint "${row.conname}": ${row.def}`);
      if (row.def.includes('WORKING') && row.def.includes('MISSED_CHECKOUT')) {
        isConstraintValid = true;
      }
    });

    if (!isConstraintValid) {
      throw new Error('Check constraint does not include WORKING and MISSED_CHECKOUT!');
    }
    console.log('✔ Attendance status check constraints verified.');

    // 3. Test insertion and dynamic calculation of working hours
    console.log('\nTesting dynamic duration calculation logic...');
    await client.query('BEGIN');

    // Create a temporary test employee if not exists
    const empRes = await client.query("SELECT id FROM employees LIMIT 1");
    if (empRes.rows.length === 0) {
      console.log('No employees in database to test, skipping query test.');
      await client.query('ROLLBACK');
      return;
    }
    const testEmployeeId = empRes.rows[0].id;

    // Insert check-in log
    const testDate = '2026-07-27';
    await client.query(`
      INSERT INTO attendance 
        (employee_id, date, time, check_in_time, check_out_time, status, remarks, source)
      VALUES 
        ($1, $2, '09:00:00', '09:00:00', '18:15:00', 'PRESENT', 'Verify DDL Test', 'SYSTEM_TEST')
      ON CONFLICT (employee_id, date) DO UPDATE 
      SET check_in_time = '09:00:00', check_out_time = '18:15:00', status = 'PRESENT';
    `, [testEmployeeId, testDate]);

    // Query and calculate dynamically using PG intervals
    const calcRes = await client.query(`
      SELECT 
        check_in_time, 
        check_out_time,
        (check_out_time::interval - check_in_time::interval) as diff,
        TO_CHAR((check_out_time::interval - check_in_time::interval), 'HH24"h "MI"m"') as formatted_hours
      FROM attendance 
      WHERE employee_id = $1 AND date = $2;
    `, [testEmployeeId, testDate]);

    const record = calcRes.rows[0];
    console.log(`Dynamic duration: In=${record.check_in_time}, Out=${record.check_out_time}, Diff=${JSON.stringify(record.diff)}, Formatted="${record.formatted_hours}"`);
    
    if (record.formatted_hours !== '09h 15m') {
      throw new Error(`Duration calculation mismatch! Expected "09h 15m", got "${record.formatted_hours}"`);
    }
    console.log('✔ Dynamic interval calculations verified.');

    await client.query('ROLLBACK');
    console.log('\n--- ALL DATABASE LOGIC VERIFICATION SUCCESSFUL ---');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('!!! DATABASE LOGIC VERIFICATION FAILED !!!', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyDatabase().catch(console.error);
