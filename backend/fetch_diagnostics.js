const http = require('https');

// Helper to make POST request
function makePostRequest(path, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'gaytri-commercial-smart-erp.onrender.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helper to make GET request
function makeGetRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'gaytri-commercial-smart-erp.onrender.com',
      port: 443,
      path: path,
      method: 'GET',
      headers: {}
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    console.log('Logging in as amit@gmail.com with password workforce@2026...');
    const loginRes = await makePostRequest('/api/v1/auth/login', {
      employee_id: 'amit@gmail.com',
      password: 'workforce@2026'
    });
    
    console.log('Login Status:', loginRes.status);
    console.log('Login Response:', loginRes.body);
    
    const loginData = JSON.parse(loginRes.body);
    if (!loginData.success) {
      console.error('Login failed.');
      return;
    }
    
    const token = loginData.access_token;
    
    console.log('\nFetching assigned employees (GET /api/v1/employees)...');
    const empRes = await makeGetRequest('/api/v1/employees', token);
    console.log('Employees Status:', empRes.status);
    console.log('Employees Response:', empRes.body);
    
    const empData = JSON.parse(empRes.body);
    if (!empData.success || empData.employees.length === 0) {
      console.error('No employees returned.');
      return;
    }
    
    const targetEmpId = empData.employees[0].id;
    console.log(`\nMarking attendance for employee UUID: ${targetEmpId} (POST /api/v1/attendance/mark)...`);
    
    const markRes = await makePostRequest('/api/v1/attendance/mark', {
      date: new Date().toISOString().split('T')[0],
      records: [
        {
          employee_id: targetEmpId,
          status: 'PRESENT',
          remarks: 'Verification manual override test'
        }
      ]
    }, token);
    
    console.log('Attendance Save Status:', markRes.status);
    console.log('Attendance Save Response:', markRes.body);
    
    // Check db status
    console.log('\nFetching database diagnostics report...');
    const settingsRes = await makeGetRequest('/api/v1/company/settings', token);
    const settingsData = JSON.parse(settingsRes.body);
    if (settingsData.success) {
      console.log('\n==================================================');
      console.log('PRODUCTION DATABASE DIAGNOSTICS REPORT');
      console.log('==================================================');
      console.log(settingsData.settings.address);
      console.log('==================================================\n');
    }
    
  } catch (err) {
    console.error('Error running test suite:', err.message);
  }
}

run();
