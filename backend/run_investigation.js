const http = require('http');
const https = require('https');
const { Client } = require('pg');
require('dotenv').config();

const REMOTE_URL = 'https://gaytri-commercial-smart-erp.onrender.com/api/v1';

function makeRequest(urlStr, method, headers, body) {
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

async function run() {
  console.log("====================================================");
  console.log("STEP 2 - VERIFY WHAT THE API RETURNS");
  console.log("====================================================");

  let loginRes;
  try {
    loginRes = await makeRequest(`${REMOTE_URL}/auth/login`, 'POST', {}, {
      employee_id: 'amit8340@gmail.com',
      password: 'workforce@2026'
    });
  } catch (err) {
    console.error("Login call failed:", err);
    return;
  }

  console.log("Login HTTP Status:", loginRes.status);
  const loginBody = JSON.parse(loginRes.body);
  if (loginRes.status !== 200 || !loginBody.success) {
    console.error("Login failed. Response:", loginRes.body);
    return;
  }

  const token = loginBody.token;
  const managerId = loginBody.user.id;
  console.log("Manager Logged In. ID:", managerId);

  const headers = { 'Authorization': `Bearer ${token}` };

  let employeesRes;
  try {
    employeesRes = await makeRequest(`${REMOTE_URL}/employees`, 'GET', headers, null);
  } catch (err) {
    console.error("GET /employees failed:", err);
    return;
  }

  console.log("HTTP Status:", employeesRes.status);
  console.log("Complete JSON response:");
  console.log(employeesRes.body);

  const employeesData = JSON.parse(employeesRes.body);
  const employees = employeesData.employees || [];

  console.log("\nEmployees List:");
  employees.forEach(emp => {
    console.log(`- UUID: ${emp.id}`);
    console.log(`  Employee Code: ${emp.employee_id}`);
    console.log(`  Employee Name: ${emp.full_name}`);
  });

  if (employees.length === 0) {
    console.log("\nNo employees found. Cannot proceed to Step 3.");
    return;
  }

  const targetEmployee = employees[0];
  const employeeUuid = targetEmployee.id;
  const employeeCode = targetEmployee.employee_id;
  const employeeName = targetEmployee.full_name;

  console.log("\n====================================================");
  console.log("STEP 3 - VERIFY ATTENDANCE REQUEST");
  console.log("====================================================");

  const todayStr = new Date().toISOString().split('T')[0];
  const requestBody = {
    date: todayStr,
    records: [
      {
        employee_id: employeeUuid,
        status: 'PRESENT',
        remarks: 'Verification Test'
      }
    ]
  };

  const reqUrl = `${REMOTE_URL}/attendance/mark`;
  console.log("Request URL:", reqUrl);
  console.log("Request JSON:", JSON.stringify(requestBody, null, 2));

  let attendanceRes;
  try {
    attendanceRes = await makeRequest(reqUrl, 'POST', headers, requestBody);
  } catch (err) {
    console.error("Attendance POST failed:", err);
    return;
  }

  console.log("HTTP Status:", attendanceRes.status);
  console.log("Raw Response JSON:");
  console.log(attendanceRes.body);

  console.log("\n====================================================");
  console.log("STEP 4 - TRACE AUTHORIZATION");
  console.log("====================================================");

  console.log("canManageEmployee() parameters:");
  console.log("managerId:", managerId);
  console.log("employeeId:", employeeUuid);

  const dbClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'gaytri_erp',
  });

  await dbClient.connect();
  try {
    const dbRes = await dbClient.query(
      'SELECT * FROM manager_employees WHERE manager_id = $1 AND employee_id = $2',
      [managerId, employeeUuid]
    );

    console.log("rows.length:", dbRes.rows.length);
    console.log("Exact SQL result:");
    console.log(JSON.stringify(dbRes.rows, null, 2));
  } catch (err) {
    console.error("DB Query failed:", err.message);
  } finally {
    await dbClient.end();
  }
}

run().catch(console.error);
