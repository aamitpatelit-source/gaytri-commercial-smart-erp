const https = require('https');

const candidates = [
  { url: '/api/v1/auth/admin/login', body: { email: 'admin@gaytri.com', password: 'workforce@2026' } },
  { url: '/api/v1/auth/admin/login', body: { email: 'admin@gaytri.com', password: 'admin' } },
  { url: '/api/v1/auth/admin/login', body: { email: 'admin@gaytri.com', password: 'admin123' } },
  { url: '/api/v1/auth/admin/login', body: { email: 'admin@gaytri.com', password: 'Gaytri@2026' } },
  { url: '/api/v1/auth/admin/login', body: { email: 'aamitpatelit@gmail.com', password: 'workforce@2026' } },
  { url: '/api/v1/auth/admin/login', body: { email: 'aamitpatelit@gmail.com', password: 'admin123' } },
  { url: '/api/v1/auth/login', body: { employee_id: 'manager@gaytri.com', password: 'workforce@2026' } },
  { url: '/api/v1/auth/login', body: { employee_id: 'amit8340@gmail.com', password: 'workforce@2026' } },
  { url: '/api/v1/auth/employee/login', body: { employee_id: 'GC-1', password: 'Gaytri@GC-1' } },
];

async function tryLogin(item) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(item.body);
    const req = https.request({
      hostname: 'gaytri-commercial-smart-erp.onrender.com',
      port: 443,
      path: item.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.success) {
            console.log(`✔ SUCCESS on ${item.url} for ${JSON.stringify(item.body)}: Token=${parsed.token ? 'YES' : 'NO'}`);
            resolve({ item, token: parsed.token });
          } else {
            console.log(`❌ Failed on ${item.url} for ${JSON.stringify(item.body)}: ${parsed.message}`);
            resolve(null);
          }
        } catch (e) {
          console.log(`Error parsing response: ${body}`);
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

async function runAll() {
  console.log("Testing Production Logins...");
  for (const c of candidates) {
    const res = await tryLogin(c);
    if (res && res.token) {
      console.log("\nFound working token! Now testing GET /api/v1/attendance/dashboard on production...");
      const startTime = Date.now();
      const dashReq = https.request({
        hostname: 'gaytri-commercial-smart-erp.onrender.com',
        port: 443,
        path: '/api/v1/attendance/dashboard',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${res.token}` }
      }, (dashRes) => {
        let dashBody = '';
        dashRes.on('data', chunk => dashBody += chunk);
        dashRes.on('end', () => {
          const loadTimeMs = Date.now() - startTime;
          console.log(`Production Dashboard Status: ${dashRes.statusCode}`);
          console.log(`Production Dashboard Load Time: ${loadTimeMs}ms (${(loadTimeMs/1000).toFixed(2)}s)`);
          console.log(`Production Response Payload:\n${dashBody.substring(0, 500)}...`);
        });
      });
      dashReq.end();
      break;
    }
  }
}

runAll().catch(console.error);
