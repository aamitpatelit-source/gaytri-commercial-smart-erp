"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const REMOTE_URL = 'https://gaytri-commercial-smart-erp.onrender.com/api/v1';
function makeRequest(urlStr, method, headers, body) {
    return new Promise((resolve, reject) => {
        const isHttps = urlStr.startsWith('https');
        const lib = isHttps ? https_1.default : http_1.default;
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
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve({ status: res.statusCode || 0, body: data }); });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
async function main() {
    console.log('Logging in as SUPER_ADMIN on production server...');
    const loginRes = await makeRequest(`${REMOTE_URL}/auth/admin/login`, 'POST', {}, {
        email: 'admin@gaytri.com',
        password: 'workforce@2026'
    });
    if (loginRes.status !== 200) {
        console.log('Admin login failed on production:', loginRes.body);
        return;
    }
    const { token } = JSON.parse(loginRes.body);
    const headers = { 'Authorization': `Bearer ${token}` };
    console.log('\nFetching all manager profiles and department scopes from production...');
    const managersRes = await makeRequest(`${REMOTE_URL}/auth/managers`, 'GET', headers, null);
    console.log('GET /auth/managers Status:', managersRes.status);
    const data = JSON.parse(managersRes.body);
    if (data.success) {
        console.log('\n--- PRODUCTION MANAGERS & SCOPES ---');
        console.log(JSON.stringify(data.managers, null, 2));
    }
    else {
        console.log('Failed to fetch managers list:', data.message);
    }
}
main();
