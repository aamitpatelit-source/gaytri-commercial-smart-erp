const https = require('https');

const loginData = JSON.stringify({
  email: 'admin@gaytri.com',
  password: 'workforce@2026'
});

const reqLogin = https.request({
  hostname: 'gaytri-commercial-smart-erp.onrender.com',
  port: 443,
  path: '/api/v1/auth/admin/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log("Login Status:", res.statusCode);
    const data = JSON.parse(body);
    if (!data.success) {
      console.error("Login failed:", data.message);
      return;
    }
    const token = data.token;
    console.log("Got Token successfully.");

    // Now call dashboard stats
    const reqDash = https.request({
      hostname: 'gaytri-commercial-smart-erp.onrender.com',
      port: 443,
      path: '/api/v1/attendance/dashboard',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res2) => {
      let body2 = '';
      res2.on('data', (chunk) => body2 += chunk);
      res2.on('end', () => {
        console.log("Dashboard HTTP Status:", res2.statusCode);
        console.log("Dashboard Response Body:", body2);
      });
    });
    reqDash.end();
  });
});

reqLogin.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

reqLogin.write(loginData);
reqLogin.end();

reqLogin.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

reqLogin.write(loginData);
reqLogin.end();
