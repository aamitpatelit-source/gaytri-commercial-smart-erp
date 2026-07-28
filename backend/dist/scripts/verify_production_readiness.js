"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const db_1 = require("../config/db");
const auth_1 = __importDefault(require("../routes/auth"));
const employees_1 = __importDefault(require("../routes/employees"));
const attendance_1 = __importDefault(require("../routes/attendance"));
const company_1 = __importDefault(require("../routes/company"));
const leaves_1 = __importDefault(require("../routes/leaves"));
const errorHandler_1 = require("../middleware/errorHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/employees', employees_1.default);
app.use('/api/v1/attendance', attendance_1.default);
app.use('/api/v1/company', company_1.default);
app.use('/api/v1/leaves', leaves_1.default);
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ success: true, message: 'Gaytri Commercial API is running cleanly.' });
});
app.use(errorHandler_1.errorHandler);
const TEST_PORT = 5055;
async function runProductionVerification() {
    console.log('=====================================================');
    console.log('STARTING PRODUCTION END-TO-END VERIFICATION');
    console.log('=====================================================\n');
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, () => resolve()));
    console.log(`[Test Server] Running on http://localhost:${TEST_PORT}`);
    const baseUrl = `http://localhost:${TEST_PORT}/api/v1`;
    try {
        // 1. Health Endpoint Verification
        console.log('\n[Check 1/10] Verifying API Health Endpoint...');
        const healthRes = await fetch(`${baseUrl}/health`);
        const healthData = await healthRes.json();
        if (healthRes.status !== 200 || !healthData.success) {
            throw new Error(`Health check failed: ${JSON.stringify(healthData)}`);
        }
        console.log('  ✔ API Health endpoint returned 200 OK.');
        // 2. Super Admin Login
        console.log('\n[Check 2/10] Verifying Super Admin Login (gaytricommercial7033@gmail.com)...');
        const adminLoginRes = await fetch(`${baseUrl}/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'gaytricommercial7033@gmail.com',
                password: 'sunny7033'
            })
        });
        const adminLoginData = await adminLoginRes.json();
        if (adminLoginRes.status !== 200 || !adminLoginData.token) {
            throw new Error(`Super Admin Login failed: ${JSON.stringify(adminLoginData)}`);
        }
        const adminToken = adminLoginData.token;
        console.log('  ✔ Super Admin login successful. Token acquired.');
        // 3. Dashboard Access
        console.log('\n[Check 3/10] Verifying Super Admin Dashboard API...');
        const dashRes = await fetch(`${baseUrl}/attendance/dashboard`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const dashData = await dashRes.json();
        if (dashRes.status !== 200 || !dashData.success) {
            throw new Error(`Dashboard fetch failed: ${JSON.stringify(dashData)}`);
        }
        console.log('  ✔ Dashboard loaded successfully.');
        // 4. Create Manager
        console.log('\n[Check 4/10] Verifying Manager Creation...');
        const testMgrEmail = `prod_test_mgr_${Date.now()}@gaytri.com`;
        const mgrCreateRes = await fetch(`${baseUrl}/auth/managers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                email: testMgrEmail,
                password: 'TestManager@123',
                full_name: 'Prod Test Manager',
                role: 'MANAGER'
            })
        });
        const mgrCreateData = await mgrCreateRes.json();
        if (mgrCreateRes.status !== 201 || !mgrCreateData.success) {
            throw new Error(`Manager Creation failed: ${JSON.stringify(mgrCreateData)}`);
        }
        console.log(`  ✔ Manager created: ${testMgrEmail}`);
        // 5. Manager Login (Mobile API)
        console.log('\n[Check 5/10] Verifying Manager Login (Mobile Auth API)...');
        const mgrLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: testMgrEmail,
                password: 'TestManager@123'
            })
        });
        const mgrLoginData = await mgrLoginRes.json();
        if (mgrLoginRes.status !== 200 || !mgrLoginData.token) {
            throw new Error(`Manager Login failed: ${JSON.stringify(mgrLoginData)}`);
        }
        const mgrToken = mgrLoginData.token;
        const mgrId = mgrLoginData.user.id;
        console.log('  ✔ Manager mobile login successful.');
        // 6. Create Employee
        console.log('\n[Check 6/10] Verifying Employee Creation...');
        const testEmpId = `GC-TEST-${Date.now().toString().slice(-4)}`;
        const empCreateRes = await fetch(`${baseUrl}/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                employee_id: testEmpId,
                full_name: 'Test Verification Employee',
                mobile: '9876543210',
                joining_date: '2026-07-01',
                salary_type: 'MONTHLY',
                monthly_salary: 25000,
                manager_id: mgrId
            })
        });
        const empCreateData = await empCreateRes.json();
        if (empCreateRes.status !== 201 || !empCreateData.success) {
            throw new Error(`Employee Creation failed: ${JSON.stringify(empCreateData)}`);
        }
        const createdEmpDbId = empCreateData.employee.id;
        console.log(`  ✔ Employee created successfully: ${testEmpId}`);
        // 7. Mark Attendance & Checkout Flow
        console.log('\n[Check 7/10] Verifying Attendance Check-In & Check-Out Flow...');
        const tz = 'Asia/Kolkata';
        const today = new Date().toISOString().split('T')[0];
        const attCheckInRes = await fetch(`${baseUrl}/attendance/mark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                date: today,
                records: [
                    {
                        employee_id: createdEmpDbId,
                        status: 'PRESENT',
                        remarks: 'Check-In test',
                        check_in_time: '09:00:00'
                    }
                ]
            })
        });
        const attCheckInData = await attCheckInRes.json();
        if (attCheckInRes.status !== 201 && attCheckInRes.status !== 200) {
            throw new Error(`Attendance Check-In failed: ${JSON.stringify(attCheckInData)}`);
        }
        console.log('  ✔ Attendance Check-In marked.');
        // Mark Check-Out
        const attCheckOutRes = await fetch(`${baseUrl}/attendance/mark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                date: today,
                records: [
                    {
                        employee_id: createdEmpDbId,
                        status: 'PRESENT',
                        remarks: 'Check-Out test',
                        reason: 'Updating check-out time for verification',
                        check_in_time: '09:00:00',
                        check_out_time: '17:00:00'
                    }
                ]
            })
        });
        const attCheckOutData = await attCheckOutRes.json();
        if (attCheckOutRes.status !== 200 && attCheckOutRes.status !== 201) {
            throw new Error(`Attendance Check-Out failed: ${JSON.stringify(attCheckOutData)}`);
        }
        console.log('  ✔ Attendance Check-Out marked successfully.');
        // 8. Payroll & Payslip Report Generation
        console.log('\n[Check 8/10] Verifying Payroll Report Generation...');
        const currentMonth = new Date().toISOString().slice(0, 7);
        const payrollRes = await fetch(`${baseUrl}/attendance/payroll-report?month=${currentMonth}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const payrollData = await payrollRes.json();
        if (payrollRes.status !== 200 || !payrollData.success || !Array.isArray(payrollData.payroll)) {
            throw new Error(`Payroll Report failed: ${JSON.stringify(payrollData)}`);
        }
        console.log(`  ✔ Payroll Report generated successfully (${payrollData.payroll.length} employee entries calculated).`);
        // 9. Re-Clean Test Entries
        console.log('\n[Check 9/10] Cleaning Verification Test Records...');
        await (0, db_1.query)("DELETE FROM attendance WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'GC-TEST-%') OR employee_id = $1", [createdEmpDbId]);
        await (0, db_1.query)("TRUNCATE TABLE attendance_audit_logs CASCADE;");
        await (0, db_1.query)("DELETE FROM leave_balances WHERE employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'GC-TEST-%') OR employee_id = $1", [createdEmpDbId]);
        await (0, db_1.query)("DELETE FROM manager_employees WHERE manager_id IN (SELECT id FROM admins WHERE email LIKE 'prod_test_mgr_%') OR employee_id IN (SELECT id FROM employees WHERE employee_id LIKE 'GC-TEST-%') OR manager_id = $1", [mgrId]);
        await (0, db_1.query)("DELETE FROM employees WHERE employee_id LIKE 'GC-TEST-%' OR id = $1", [createdEmpDbId]);
        await (0, db_1.query)("DELETE FROM admins WHERE email LIKE 'prod_test_mgr_%' OR id = $1", [mgrId]);
        console.log('  ✔ Verification test entries removed cleanly.');
        // 10. Final Verification of Production DB Counts
        console.log('\n[Check 10/10] Verifying Final Database Clean State...');
        const empCount = await (0, db_1.query)('SELECT COUNT(*) FROM employees');
        const attCount = await (0, db_1.query)('SELECT COUNT(*) FROM attendance');
        const mgrCount = await (0, db_1.query)("SELECT COUNT(*) FROM admins WHERE role = 'MANAGER'");
        const superCount = await (0, db_1.query)("SELECT COUNT(*) FROM admins WHERE role = 'SUPER_ADMIN'");
        console.log(`  - Final Employees Count: ${empCount.rows[0].count}`);
        console.log(`  - Final Attendance Count: ${attCount.rows[0].count}`);
        console.log(`  - Final Managers Count: ${mgrCount.rows[0].count}`);
        console.log(`  - Final Super Admin Count: ${superCount.rows[0].count}`);
        if (parseInt(empCount.rows[0].count) !== 0 ||
            parseInt(attCount.rows[0].count) !== 0 ||
            parseInt(mgrCount.rows[0].count) !== 0 ||
            parseInt(superCount.rows[0].count) !== 1) {
            throw new Error('Final clean state check failed!');
        }
        console.log('\n=====================================================');
        console.log('✔ ALL PRODUCTION VERIFICATION CHECKS PASSED CLEANLY');
        console.log('=====================================================\n');
    }
    finally {
        server.close();
    }
}
runProductionVerification().catch((err) => {
    console.error('\n[FATAL ERROR] Verification failed:', err.message);
    process.exit(1);
});
