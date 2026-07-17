const http = require('https');

const data = JSON.stringify({
  employee_id: 'manager@gaytri.com',
  password: 'workforce@2026'
});

const reqOptions = {
  hostname: 'gaytri-commercial-smart-erp.onrender.com',
  port: 443,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Logging in as manager@gaytri.com against live API...');
const req = http.request(reqOptions, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (!parsed.success) {
        console.error('Login failed:', parsed.message);
        return;
      }
      const token = parsed.access_token;
      console.log('Login success! Fetching diagnostic settings...');
      
      const getOptions = {
        hostname: 'gaytri-commercial-smart-erp.onrender.com',
        port: 443,
        path: '/api/v1/company/settings',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      const getReq = http.request(getOptions, (getRes) => {
        let getBody = '';
        getRes.on('data', chunk => getBody += chunk);
        getRes.on('end', () => {
          try {
            const getParsed = JSON.parse(getBody);
            if (!getParsed.success) {
              console.error('Fetch settings failed:', getParsed.message);
              return;
            }
            console.log('\n==================================================');
            console.log('PRODUCTION DATABASE DIAGNOSTICS REPORT');
            console.log('==================================================');
            console.log(getParsed.settings.address);
            console.log('==================================================\n');
          } catch (err) {
            console.error('Failed to parse settings JSON:', err.message);
            console.error('Response:', getBody);
          }
        });
      });
      getReq.end();
      
    } catch (err) {
      console.error('Failed to parse login JSON:', err.message);
      console.error('Response:', body);
    }
  });
});

req.on('error', (err) => {
  console.error('Connection error:', err.message);
});

req.write(data);
req.end();
