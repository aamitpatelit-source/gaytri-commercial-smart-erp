const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'Gaytri_Commercial',
});

async function runMigration() {
  console.log('--- STARTING DATABASE SCHEMA MIGRATION ---');
  await client.connect();
  console.log('Connected to PostgreSQL database.');

  try {
    await client.query('BEGIN');

    // 1. Drop old status check constraint if exists
    console.log('Altering attendance status check constraint...');
    await client.query(`
      ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
    `);

    // Add status check constraint including WORKING and MISSED_CHECKOUT
    await client.query(`
      ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (
        status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEKEND', 'WORK_FROM_HOME', 'ON_DUTY', 'VOIDED', 'WORKING', 'MISSED_CHECKOUT')
      );
    `);
    console.log('Attendance status constraint successfully updated.');

    // 2. Add new columns to attendance table
    console.log('Checking and adding new attendance fields...');
    await client.query(`
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_time TIME;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time TIME;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_lat_in DOUBLE PRECISION;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_lng_in DOUBLE PRECISION;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_lat_out DOUBLE PRECISION;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gps_lng_out DOUBLE PRECISION;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_name VARCHAR(150);
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS network_type VARCHAR(50);
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS battery_percentage INTEGER;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS face_image_url VARCHAR(255);
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id) ON DELETE SET NULL;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES admins(id) ON DELETE SET NULL;
    `);
    console.log('Attendance columns added.');

    // 3. Backfill check_in_time with time column values for legacy compatibility
    console.log('Backfilling legacy check-in records...');
    const backfillRes = await client.query(`
      UPDATE attendance 
      SET check_in_time = COALESCE(check_in_time, time) 
      WHERE check_in_time IS NULL;
    `);
    console.log(`Backfilled check_in_time for ${backfillRes.rowCount} rows.`);

    await client.query('COMMIT');
    console.log('Database migration transaction committed successfully.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('!!! DATABASE MIGRATION FAILED !!!', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('--- DATABASE SCHEMA MIGRATION COMPLETE ---');
  }
}

runMigration().catch(console.error);
