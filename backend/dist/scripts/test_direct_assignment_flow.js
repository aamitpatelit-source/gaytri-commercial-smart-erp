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
            port: urlObj.port || 5000,
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
    console.log('=== STARTING DIRECT ASSIGNMENT E2E VALIDATION ===');
    // 1. Fetch manager details
    const managerEmail = 'amit8340@gmail.com';
    const mgrRes = await (0, db_1.query)('SELECT id, password_hash, role FROM admins WHERE email = $1', [managerEmail]);
    if (mgrRes.rows.length === 0) {
        console.error(`Manager ${managerEmail} not found in database.`);
        return;
    }
    const managerId = mgrRes.rows[0].id;
    const managerOrigHash = mgrRes.rows[0].password_hash;
    console.log(`Resolved Manager: ${managerEmail} (ID: ${managerId}, Role: ${mgrRes.rows[0].role})`);
    // 2. Fetch admin details
    const adminRes = await (0, db_1.query)("SELECT id, email, password_hash FROM admins WHERE role = 'ADMIN' OR role = 'SUPER_ADMIN' LIMIT 1");
    if (adminRes.rows.length === 0) {
        console.error('No admin user found in database.');
        return;
    }
    const adminEmail = adminRes.rows[0].email;
    const adminId = adminRes.rows[0].id;
    const adminOrigHash = adminRes.rows[0].password_hash;
    console.log(`Resolved Admin: ${adminEmail} (ID: ${adminId})`);
    // 3. Temporarily update password hashes for testing authentication
    const testPassword = 'test_password_123';
    const testHash = await bcryptjs_1.default.hash(testPassword, 10);
    await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [testHash, managerId]);
    await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [testHash, adminId]);
    try {
        // 4. Authenticate as Admin
        console.log('\n--- 1. Authenticating as Admin ---');
        const adminLoginRes = await makeRequest(`${LOCAL_URL}/auth/admin/login`, 'POST', {}, {
            email: adminEmail,
            password: testPassword
        });
        console.log(`Admin Login Status: ${adminLoginRes.status}`);
        const adminLoginBody = JSON.parse(adminLoginRes.body);
        if (!adminLoginBody.success) {
            throw new Error(`Admin Login failed: ${adminLoginRes.body}`);
        }
        const adminToken = adminLoginBody.token;
        // 5. Fetch all active employees
        const employeesRes = await (0, db_1.query)('SELECT id, employee_id, full_name FROM employees WHERE is_active = TRUE LIMIT 3');
        if (employeesRes.rows.length === 0) {
            throw new Error('No active employees found to assign.');
        }
        const employeeList = employeesRes.rows;
        console.log('Employees selected for mapping:', employeeList.map(e => `${e.full_name} (${e.employee_id})`));
        // 6. Admin assigns employees to Manager transactionally
        console.log('\n--- 2. Admin Assigns Employees to Manager ---');
        const targetEmployeeIds = employeeList.map(e => e.id);
        const assignRes = await makeRequest(`${LOCAL_URL}/auth/managers/${managerId}/employees`, 'POST', { 'Authorization': `Bearer ${adminToken}` }, { employee_ids: targetEmployeeIds });
        console.log(`Assignment POST Status: ${assignRes.status}`);
        console.log(`Assignment POST Response: ${assignRes.body}`);
        if (assignRes.status !== 200) {
            throw new Error(`Failed to assign employees: ${assignRes.body}`);
        }
        // Verify DB count
        const countRes = await (0, db_1.query)('SELECT COUNT(*)::int as count FROM manager_employees WHERE manager_id = $1', [managerId]);
        console.log(`Verified DB manager_employees records count: ${countRes.rows[0].count}`);
        // 7. Authenticate as Manager
        console.log('\n--- 3. Authenticating as Manager ---');
        const managerLoginRes = await makeRequest(`${LOCAL_URL}/auth/login`, 'POST', {}, {
            employee_id: managerEmail,
            password: testPassword
        });
        console.log(`Manager Login Status: ${managerLoginRes.status}`);
        const managerLoginBody = JSON.parse(managerLoginRes.body);
        if (!managerLoginBody.success) {
            throw new Error(`Manager Login failed: ${managerLoginRes.body}`);
        }
        const managerToken = managerLoginBody.token;
        // 8. Fetch Manager's Employee Roster
        console.log('\n--- 4. Loading Manager Employee Roster ---');
        const rosterRes = await makeRequest(`${LOCAL_URL}/employees`, 'GET', { 'Authorization': `Bearer ${managerToken}` }, null);
        console.log(`Roster GET Status: ${rosterRes.status}`);
        const rosterBody = JSON.parse(rosterRes.body);
        console.log(`Roster Employees count returned: ${rosterBody.length || rosterBody.employees?.length || 0}`);
        const rosterList = rosterBody.employees || rosterBody;
        console.log('Roster employees:', rosterList.map((e) => `${e.full_name} (${e.employee_id})`));
        // 9. Manager marks attendance for the first employee
        console.log('\n--- 5. Manager Marks Attendance ---');
        const targetEmployee = rosterList[0];
        if (!targetEmployee) {
            throw new Error('Roster is empty.');
        }
        // Clear today's attendance for the employee to avoid edit/reason requirements
        await (0, db_1.query)('DELETE FROM attendance WHERE employee_id = $1 AND date = CURRENT_DATE', [targetEmployee.id]);
        const todayStr = new Date().toISOString().split('T')[0];
        const markPayload = {
            date: todayStr,
            records: [
                {
                    employee_id: targetEmployee.id,
                    status: 'PRESENT',
                    remarks: 'E2E Direct Assignment Validation',
                    reason: ''
                }
            ]
        };
        const markRes = await makeRequest(`${LOCAL_URL}/attendance/mark`, 'POST', { 'Authorization': `Bearer ${managerToken}` }, markPayload);
        console.log(`Attendance POST Status: ${markRes.status}`);
        console.log(`Attendance POST Response: ${markRes.body}`);
        // 10. Fetch attendance history to confirm saved record
        console.log('\n--- 6. Loading Saved Attendance History ---');
        const historyRes = await makeRequest(`${LOCAL_URL}/attendance/history?start_date=${todayStr}&end_date=${todayStr}`, 'GET', { 'Authorization': `Bearer ${managerToken}` }, null);
        console.log(`History GET Status: ${historyRes.status}`);
        const historyBody = JSON.parse(historyRes.body);
        const records = historyBody.logs || historyBody;
        console.log('Raw history logs count:', Array.isArray(records) ? records.length : 0);
        const matchedRecord = Array.isArray(records) ? records.find((r) => r.employee_id === targetEmployee.employee_id) : null;
        console.log(`Matched record in history:`, matchedRecord ? {
            employee_id: matchedRecord.employee_id,
            status: matchedRecord.status,
            remarks: matchedRecord.remarks,
            date: matchedRecord.date
        } : 'NOT FOUND');
        // 11. Create a leave request in DB for target employee
        console.log('\n--- 7. Mocking Leave Request for Employee ---');
        // Delete any existing conflicting leaves to avoid DB constraint failures
        await (0, db_1.query)('DELETE FROM leave_requests WHERE employee_id = $1', [targetEmployee.id]);
        const leaveIdRes = await (0, db_1.query)(`
      INSERT INTO leave_requests (employee_id, start_date, end_date, type, reason, status)
      VALUES ($1, CURRENT_DATE, CURRENT_DATE + 2, 'CASUAL', 'Direct Assignment Mock Leave', 'PENDING')
      RETURNING id
    `, [targetEmployee.id]);
        const leaveId = leaveIdRes.rows[0].id;
        console.log(`Inserted pending leave request ID: ${leaveId}`);
        // 12. Manager checks leave request visibility
        console.log('\n--- 8. Manager Checks Leave Requests Visibility ---');
        const leavesRes = await makeRequest(`${LOCAL_URL}/leaves/requests`, 'GET', { 'Authorization': `Bearer ${managerToken}` }, null);
        console.log(`Leaves GET Status: ${leavesRes.status}`);
        const leavesBody = JSON.parse(leavesRes.body);
        const leavesList = leavesBody.requests || leavesBody;
        const leaveReqFound = Array.isArray(leavesList) ? leavesList.find((r) => r.id === leaveId) : null;
        console.log(`Pending leave request found in list: ${!!leaveReqFound}`);
        // 13. Manager approves leave request
        console.log('\n--- 9. Manager Approves Leave Request ---');
        const approveRes = await makeRequest(`${LOCAL_URL}/leaves/requests/${leaveId}/approve`, 'POST', { 'Authorization': `Bearer ${managerToken}` }, { remarks: 'Approved via E2E test' });
        console.log(`Approve POST Status: ${approveRes.status}`);
        console.log(`Approve POST Response: ${approveRes.body}`);
        // Verify DB state
        const leaveFinalRes = await (0, db_1.query)('SELECT status, approved_by FROM leave_requests WHERE id = $1', [leaveId]);
        console.log('Final DB Leave Status:', leaveFinalRes.rows[0]);
    }
    finally {
        // 14. Restore original password hashes
        await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [managerOrigHash, managerId]);
        await (0, db_1.query)('UPDATE admins SET password_hash = $1 WHERE id = $2', [adminOrigHash, adminId]);
        console.log('\nOriginal password hashes restored.');
    }
    console.log('=== E2E VALIDATION COMPLETE ===');
}
main().catch(console.error);
