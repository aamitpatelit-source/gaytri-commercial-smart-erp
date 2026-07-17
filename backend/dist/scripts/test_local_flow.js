"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const db_1 = require("../config/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const LOCAL_URL = 'http://localhost:5000/api/v1';
function makeRequest(urlStr, method, headers, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlStr);
        const options = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        const req = http_1.default.request(options, (res) => {
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
    console.log('--- STARTING LOCAL E2E DIAGNOSTIC FLOW ---');
    // 1. Log all available departments
    const deptsRes = await (0, db_1.query)('SELECT id, name FROM departments');
    console.log('Available Departments in Database:', deptsRes.rows);
    // 2. Fetch target employee and check department
    const empId = 'bf812e3f-5f5d-46e6-8b87-5b9b6c1a30ac';
    const empRes = await (0, db_1.query)('SELECT id, full_name, department_id FROM employees WHERE id = $1', [empId]);
    if (empRes.rows.length === 0) {
        console.error(`Target employee ${empId} not found in database.`);
        return;
    }
    const employeeDeptId = empRes.rows[0].department_id;
    console.log('Target Employee database state:', empRes.rows[0]);
    // 3. Fetch manager profile & mappings
    const managerEmail = 'amit8340@gmail.com';
    const mgrRes = await (0, db_1.query)('SELECT id, password_hash, role FROM admins WHERE email = $1', [managerEmail]);
    if (mgrRes.rows.length === 0) {
        console.error(`Manager ${managerEmail} not found in database.`);
        return;
    }
    const originalHash = mgrRes.rows[0].password_hash;
    const managerId = mgrRes.rows[0].id;
    const managerRole = mgrRes.rows[0].role;
    const mappings = await (0, db_1.query)('SELECT department_id FROM manager_departments WHERE manager_id = $1', [managerId]);
    const deptIds = mappings.rows.map(r => r.department_id);
    console.log('Manager Original Database State:', {
        email: managerEmail,
        id: managerId,
        role: managerRole,
        assignedDepartmentIds: deptIds
    });
    // 4. Temporarily set password to 'workforce@2026'
    const tempHash = bcryptjs_1.default.hashSync('workforce@2026', 10);
    await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [tempHash, managerId]);
    console.log('[Setup] Temporarily updated password hash to workforce@2026.');
    // 5. Temporarily map manager to the employee's department
    let tempMappingAdded = false;
    if (!deptIds.includes(employeeDeptId)) {
        // If the department ID doesn't exist in departments, let's temporarily insert it into departments first to satisfy FK!
        const deptExists = await (0, db_1.query)('SELECT 1 FROM departments WHERE id = $1', [employeeDeptId]);
        if (deptExists.rows.length === 0) {
            await (0, db_1.query)('INSERT INTO departments (id, name) VALUES ($1, \'Temp Production\') ON CONFLICT DO NOTHING', [employeeDeptId]);
            console.log(`[Setup] Temporarily backfilled department ID ${employeeDeptId} in departments table.`);
        }
        await (0, db_1.query)('INSERT INTO manager_departments (manager_id, department_id) VALUES ($1, $2)', [managerId, employeeDeptId]);
        console.log(`[Setup] Temporarily mapped manager to department ID: ${employeeDeptId}.`);
        tempMappingAdded = true;
    }
    try {
        // 6. Test HTTP login
        console.log(`\nLogging in as ${managerEmail} on local backend...`);
        const loginRes = await makeRequest(`${LOCAL_URL}/auth/login`, 'POST', {}, {
            employee_id: managerEmail,
            password: 'workforce@2026'
        });
        console.log(`POST /auth/login Status: ${loginRes.status}`);
        if (loginRes.status !== 200) {
            console.log(`Response Body: ${loginRes.body}`);
            return;
        }
        const { token, user } = JSON.parse(loginRes.body);
        const headers = { 'Authorization': `Bearer ${token}` };
        console.log('Decoded Token identity properties:', {
            id: user.id,
            role: user.role
        });
        // 7. Test Roster GET
        console.log('\nFetching employee roster...');
        const rosterRes = await makeRequest(`${LOCAL_URL}/employees`, 'GET', headers, null);
        console.log(`GET /employees Status: ${rosterRes.status}`);
        const rosterData = JSON.parse(rosterRes.body);
        if (!rosterData.success) {
            console.log('Failed to fetch roster:', rosterData);
            return;
        }
        const employees = rosterData.employees || [];
        console.log(`Employees returned in roster: ${employees.length}`);
        employees.forEach((emp) => {
            console.log(`  - UUID: ${emp.id}, Code: ${emp.employee_id}, Name: ${emp.full_name}, Dept ID: ${emp.department_id}`);
        });
        // 8. Test Attendance mark
        if (employees.length > 0) {
            const targetEmp = employees.find((e) => e.id === empId) || employees[0];
            const todayStr = new Date().toISOString().split('T')[0];
            const markPayload = {
                date: todayStr,
                records: [
                    {
                        employee_id: targetEmp.id,
                        status: 'PRESENT',
                        remarks: 'E2E local mark test'
                    }
                ]
            };
            console.log('\nSending POST /attendance/mark...');
            console.log('Request URL:', `${LOCAL_URL}/attendance/mark`);
            console.log('Request Payload:', JSON.stringify(markPayload));
            const markRes = await makeRequest(`${LOCAL_URL}/attendance/mark`, 'POST', headers, markPayload);
            console.log(`POST /attendance/mark HTTP Status: ${markRes.status}`);
            console.log('Response Body:', markRes.body);
            if (markRes.status === 200) {
                console.log('\nFetching attendance history to verify...');
                const historyRes = await makeRequest(`${LOCAL_URL}/attendance/history`, 'GET', headers, null);
                console.log(`GET /attendance/history Status: ${historyRes.status}`);
                console.log('Response Body:', historyRes.body);
            }
        }
    }
    catch (err) {
        console.error('Local flow failed with error:', err);
    }
    finally {
        // 9. Restore original password hash
        await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [originalHash, managerId]);
        console.log('\n[Cleanup] Restored original password hash in database.');
        // 10. Delete temporary department mapping
        if (tempMappingAdded) {
            await (0, db_1.query)('DELETE FROM manager_departments WHERE manager_id = $1 AND department_id = $2', [managerId, employeeDeptId]);
            console.log(`[Cleanup] Removed temporary department mapping for ID: ${employeeDeptId}.`);
        }
    }
}
main();
