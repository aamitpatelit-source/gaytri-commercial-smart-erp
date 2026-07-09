import { Client } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'gaytri_erp',
});

const API_URL = 'http://localhost:5000/api/v1';

async function runSmokeTests() {
  console.log('--- STARTING GAYTRI WORKFORCE ENTERPRISE HTTP SMOKE TESTS ---');
  await client.connect();

  const email = 'gc-smoke-admin@test.com';
  const password = 'SmokeAdmin@123';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Create a temporary smoke-test admin
  await client.query("DELETE FROM admins WHERE email = $1", [email]);
  const insertRes = await client.query(
    "INSERT INTO admins (email, password_hash, role, full_name) VALUES ($1, $2, 'ADMIN', 'Smoke Test Admin') RETURNING id",
    [email, passwordHash]
  );
  const adminId = insertRes.rows[0].id;
  console.log(`[Setup] Temporary admin created with ID: ${adminId}`);

  try {
    // 2. Perform HTTP Login
    console.log('\n[Test 1] POST /auth/admin/login...');
    const loginRes = await fetch(`${API_URL}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const loginData = await loginRes.json() as any;
    if (loginRes.status !== 200 || !loginData.success || !loginData.token) {
      throw new Error(`Login failed! Status: ${loginRes.status}, Data: ${JSON.stringify(loginData)}`);
    }
    const token = loginData.token;
    console.log('  -> Success: Token retrieved.');

    // 3. GET /attendance/settings
    console.log('\n[Test 2] GET /attendance/settings...');
    const getSettingsRes = await fetch(`${API_URL}/attendance/settings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const getSettingsData = await getSettingsRes.json() as any;
    if (getSettingsRes.status !== 200 || !getSettingsData.success || !getSettingsData.settings) {
      throw new Error(`GET /attendance/settings failed! Status: ${getSettingsRes.status}, Data: ${JSON.stringify(getSettingsData)}`);
    }
    console.log('  -> Success: Settings retrieved:', getSettingsData.settings);

    // 4. PUT /attendance/settings
    console.log('\n[Test 3] PUT /attendance/settings...');
    const updateSettingsRes = await fetch(`${API_URL}/attendance/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        shift_name: 'Workforce Day Shift',
        checkin_start: '09:30:00',
        late_after: '09:45:00',
        checkout_time: '18:30:00',
        grace_minutes: 15
      })
    });
    
    const updateSettingsData = await updateSettingsRes.json() as any;
    if (updateSettingsRes.status !== 200 || !updateSettingsData.success || !updateSettingsData.settings) {
      throw new Error(`PUT /attendance/settings failed! Status: ${updateSettingsRes.status}, Data: ${JSON.stringify(updateSettingsData)}`);
    }
    console.log('  -> Success: Settings updated:', updateSettingsData.settings);

    // 5. GET /attendance/history
    console.log('\n[Test 4] GET /attendance/history...');
    const getHistoryRes = await fetch(`${API_URL}/attendance/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const getHistoryData = await getHistoryRes.json() as any;
    if (getHistoryRes.status !== 200 || !getHistoryData.success || !Array.isArray(getHistoryData.logs)) {
      throw new Error(`GET /attendance/history failed! Status: ${getHistoryRes.status}, Data: ${JSON.stringify(getHistoryData)}`);
    }
    console.log('  -> Success: Logs retrieved (count: ' + getHistoryData.logs.length + ')');

    console.log('\n--------------------------------------------------------------');
    console.log('ALL API ROUTE SMOKE TESTS COMPLETED SUCCESSFULLY!');
    console.log('--------------------------------------------------------------');

  } catch (error: any) {
    console.error('\n!!! SMOKE TEST RUN ENCOUNTERED AN ERROR !!!');
    console.error(error.message || error);
    process.exit(1);
  } finally {
    // 6. Clean up temporary admin
    await client.query("DELETE FROM admins WHERE id = $1", [adminId]);
    console.log('\n[Cleanup] Temporary admin deleted.');
    await client.end();
  }
}

runSmokeTests().catch(console.error);
