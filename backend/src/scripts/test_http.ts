import http from 'http';
import https from 'https';
import { query } from '../config/db';
import bcrypt from 'bcryptjs';

const LOCAL_URL = 'http://localhost:5000/api/v1';
const REMOTE_URL = 'https://gaytri-commercial-smart-erp.onrender.com/api/v1';

function makeRequest(urlStr: string, method: string, headers: any, body: any): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https');
    const lib = isHttps ? https : http;
    
    const urlObj = new URL(urlStr);
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function verifyPasswords() {
  const res = await query('SELECT email, password_hash FROM admins');
  console.log('\n--- BCRYPT PASSWORD VERIFICATION ---');
  for (const row of res.rows) {
    const isDefault = bcrypt.compareSync('workforce@2026', row.password_hash);
    const isUserPass = bcrypt.compareSync('amit8340', row.password_hash);
    console.log(`Email: ${row.email}`);
    console.log(`  Matches "workforce@2026": ${isDefault}`);
    console.log(`  Matches "amit8340": ${isUserPass}`);
  }
}

async function runFlowForUser(baseUrl: string, email: string, password: string) {
  console.log(`\n==================================================`);
  console.log(`RUNNING HTTP FLOW FOR: ${email} against ${baseUrl}`);
  console.log(`==================================================`);

  // 1. Login
  let loginRes;
  try {
    loginRes = await makeRequest(`${baseUrl}/auth/login`, 'POST', {}, {
      employee_id: email,
      password
    });
  } catch (err: any) {
    console.log(`[Error] Login request failed: ${err.message}`);
    return;
  }

  console.log(`POST /auth/login Status: ${loginRes.status}`);
  if (loginRes.status !== 200) {
    console.log(`Response Body: ${loginRes.body}`);
    return;
  }

  const loginData = JSON.parse(loginRes.body);
  const token = loginData.token;
  const userObj = loginData.user || {};
  
  console.log('Decoded Token identity properties (No secret JWT key needed):', {
    id: userObj.id,
    email: userObj.email,
    role: userObj.role
  });

  const headers = { 'Authorization': `Bearer ${token}` };

  // 2. Fetch Roster
  console.log('\nFetching employee roster...');
  const rosterRes = await makeRequest(`${baseUrl}/employees`, 'GET', headers, null);
  console.log(`GET /employees Status: ${rosterRes.status}`);
  const rosterData = JSON.parse(rosterRes.body);
  
  if (!rosterData.success) {
    console.log(`Failed: ${rosterRes.body}`);
    return;
  }

  const employees = rosterData.employees || [];
  console.log(`Employees returned: ${employees.length}`);
  employees.forEach((emp: any) => {
    console.log(`  - UUID: ${emp.id}, Code: ${emp.employee_id}, Name: ${emp.full_name}, Dept ID: ${emp.department_id}`);
  });

  if (employees.length === 0) {
    console.log('Roster is empty. Cannot continue with attendance marking test.');
    return;
  }

  // 3. Mark Attendance for the first employee
  const targetEmp = employees[0];
  const todayStr = new Date().toISOString().split('T')[0];
  const markPayload = {
    date: todayStr,
    records: [
      {
        employee_id: targetEmp.id,
        status: 'PRESENT',
        remarks: 'E2E smoke test entry'
      }
    ]
  };

  console.log('\nSending POST /attendance/mark...');
  console.log('Request URL:', `${baseUrl}/attendance/mark`);
  console.log('Request Payload:', JSON.stringify(markPayload));

  const markRes = await makeRequest(`${baseUrl}/attendance/mark`, 'POST', headers, markPayload);
  console.log(`POST /attendance/mark HTTP Status: ${markRes.status}`);
  console.log('Complete JSON Response:', markRes.body);

  if (markRes.status === 200) {
    const markData = JSON.parse(markRes.body);
    if (markData.success) {
      console.log('\nAttendance marked successfully! Checking history...');
      const historyRes = await makeRequest(
        `${baseUrl}/attendance/history?start_date=${todayStr}&end_date=${todayStr}`,
        'GET',
        headers,
        null
      );
      console.log(`GET /attendance/history Status: ${historyRes.status}`);
      console.log('Response Body:', historyRes.body);
    }
  }
}

async function main() {
  await verifyPasswords();
  
  // Try remote server first
  try {
    await runFlowForUser(REMOTE_URL, 'manager@gaytri.com', 'workforce@2026');
  } catch (err: any) {
    console.error('Remote run failed:', err.message);
  }

  try {
    await runFlowForUser(REMOTE_URL, 'amit8340@gmail.com', 'workforce@2026');
  } catch (err: any) {
    console.error('Remote run failed:', err.message);
  }
}

main();
