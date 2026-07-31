"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importStar(require("../config/db"));
const attendanceController_1 = require("../controllers/attendanceController");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
// Mock Express Response object helper
function createMockRes() {
    const res = {};
    res.statusCode = 200;
    res.data = null;
    res.status = function (code) {
        res.statusCode = code;
        return res;
    };
    res.json = function (obj) {
        res.data = obj;
        return res;
    };
    return res;
}
async function runVerification() {
    console.log('=== STARTING BUGFIX VERIFICATION SUITE ===');
    const tz = 'Asia/Kolkata';
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    // 1. Setup Admin & Test Employees in DB
    const adminRes = await (0, db_1.query)(`SELECT id FROM admins WHERE role IN ('ADMIN', 'SUPER_ADMIN') LIMIT 1`);
    if (adminRes.rows.length === 0) {
        console.error('No admin found in DB.');
        process.exit(1);
    }
    const adminId = adminRes.rows[0].id;
    // Fetch or insert 3 test employees
    let empRows = (await (0, db_1.query)(`SELECT id FROM employees LIMIT 3`)).rows;
    while (empRows.length < 3) {
        const newEmpId = `00000000-0000-4000-8000-${(empRows.length + 1).toString().padStart(12, '0')}`;
        await (0, db_1.query)(`INSERT INTO employees (id, employee_id, full_name, email, mobile, joining_date, salary_type)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'DAILY') ON CONFLICT DO NOTHING`, [newEmpId, `TEST-EMP-${empRows.length + 1}`, `Test Emp${empRows.length + 1}`, `testemp${empRows.length + 1}@example.com`, `900000000${empRows.length + 1}`]);
        empRows = (await (0, db_1.query)(`SELECT id FROM employees LIMIT 3`)).rows;
    }
    const emp1Id = empRows[0].id;
    const emp2Id = empRows[1].id;
    const emp3Id = empRows[2].id;
    console.log(`Test Employees: Emp1=${emp1Id}, Emp2=${emp2Id}, Emp3=${emp3Id}`);
    // Cleanup today's attendance for these test employees
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id IN ($1, $2, $3) AND date = $4`, [emp1Id, emp2Id, emp3Id, today]);
    console.log('[Cleanup] Removed existing attendance for test employees for today.');
    // Mock Request user
    const mockUser = { id: adminId, role: 'SUPER_ADMIN' };
    // ==========================================
    // SCENARIO 1: Incremental Attendance Save
    // ==========================================
    console.log('\n--- Testing Scenario 1: Incremental Attendance Save ---');
    // Step 1: Mark Employee A (09:00)
    const req1 = {
        body: {
            date: today,
            records: [{ employee_id: emp1Id, status: 'PRESENT', remarks: 'Emp A initial save' }]
        },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const res1 = createMockRes();
    await (0, attendanceController_1.markAttendance)(req1, res1);
    console.log(`Save Emp 1 Status: ${res1.statusCode}`, res1.data);
    if (res1.statusCode !== 200 || res1.data.saved !== 1 || res1.data.skipped !== 0) {
        throw new Error('FAILED Scenario 1 Step 1: Expected 1 saved, 0 skipped.');
    }
    // Step 2: Mark Employee B (09:10)
    const req2 = {
        body: {
            date: today,
            records: [{ employee_id: emp2Id, status: 'PRESENT', remarks: 'Emp B incremental save' }]
        },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const res2 = createMockRes();
    await (0, attendanceController_1.markAttendance)(req2, res2);
    console.log(`Save Emp 2 Status: ${res2.statusCode}`, res2.data);
    if (res2.statusCode !== 200 || res2.data.saved !== 1 || res2.data.skipped !== 0) {
        throw new Error('FAILED Scenario 1 Step 2: Expected 1 saved, 0 skipped.');
    }
    // Step 3: Attempt saving both Emp 1 and Emp 2 again (09:45)
    const req3 = {
        body: {
            date: today,
            records: [
                { employee_id: emp1Id, status: 'PRESENT', remarks: 'Emp A duplicate' },
                { employee_id: emp2Id, status: 'PRESENT', remarks: 'Emp B duplicate' }
            ]
        },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const res3 = createMockRes();
    await (0, attendanceController_1.markAttendance)(req3, res3);
    console.log(`Save Duplicate Emp 1 & 2 Status: ${res3.statusCode}`, res3.data);
    if (res3.statusCode !== 200 || res3.data.saved !== 0 || res3.data.skipped !== 2 || res3.data.duplicate_employee_ids.length !== 2) {
        throw new Error('FAILED Scenario 1 Step 3: Expected 0 saved, 2 skipped, duplicate_employee_ids returned.');
    }
    // Verify total records in DB for today is exactly 2 (no duplicates created)
    const dbRecords = await (0, db_1.query)(`SELECT id, employee_id FROM attendance WHERE employee_id IN ($1, $2) AND date = $3`, [emp1Id, emp2Id, today]);
    if (dbRecords.rows.length !== 2) {
        throw new Error(`FAILED Scenario 1 DB Check: Expected 2 records in DB, found ${dbRecords.rows.length}`);
    }
    console.log('✔ SCENARIO 1 PASSED: Incremental save working cleanly, duplicates skipped without error.');
    // ==========================================
    // SCENARIO 2: Multiple Check-Out & 409 Conflict
    // ==========================================
    console.log('\n--- Testing Scenario 2: Multiple Check-Out ---');
    // Check Out Emp 1 once
    const checkoutReq1 = {
        body: { employee_id: emp1Id, remarks: 'First checkout' },
        user: mockUser,
        ip: '127.0.0.1'
    };
    const checkoutRes1 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(checkoutReq1, checkoutRes1);
    console.log(`Checkout 1 Status: ${checkoutRes1.statusCode}`, checkoutRes1.data);
    if (checkoutRes1.statusCode !== 200 || checkoutRes1.data.success !== true) {
        throw new Error('FAILED Scenario 2 Step 1: First checkout should succeed with 200.');
    }
    const originalCheckoutTime = checkoutRes1.data.attendance.check_out_time;
    // Second Check Out attempt for Emp 1 -> Expect HTTP 409 Conflict
    const checkoutReq2 = {
        body: { employee_id: emp1Id, remarks: 'Duplicate checkout attempt' },
        user: mockUser,
        ip: '127.0.0.1'
    };
    const checkoutRes2 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(checkoutReq2, checkoutRes2);
    console.log(`Checkout 2 Status: ${checkoutRes2.statusCode}`, checkoutRes2.data);
    if (checkoutRes2.statusCode !== 409 || checkoutRes2.data.success !== false) {
        throw new Error('FAILED Scenario 2 Step 2: Second checkout must be blocked with HTTP 409 Conflict.');
    }
    // Verify DB checkout time is unchanged
    const emp1Record = await (0, db_1.query)(`SELECT check_out_time FROM attendance WHERE employee_id = $1 AND date = $2`, [emp1Id, today]);
    if (emp1Record.rows[0].check_out_time !== originalCheckoutTime) {
        throw new Error('FAILED Scenario 2 DB Check: original checkout time was modified!');
    }
    console.log('✔ SCENARIO 2 PASSED: Multiple checkout blocked with HTTP 409 Conflict, original time unchanged.');
    // ==========================================
    // SCENARIO 3: Checkout without Check-In & 400 Bad Request
    // ==========================================
    console.log('\n--- Testing Scenario 3: Checkout Without Prior Check-In ---');
    const checkoutReq3 = {
        body: { employee_id: emp3Id, remarks: 'Checkout without checkin' },
        user: mockUser,
        ip: '127.0.0.1'
    };
    const checkoutRes3 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(checkoutReq3, checkoutRes3);
    console.log(`Checkout Emp 3 Status: ${checkoutRes3.statusCode}`, checkoutRes3.data);
    if (checkoutRes3.statusCode !== 400 || checkoutRes3.data.message !== 'Employee has not checked in today.') {
        throw new Error('FAILED Scenario 3: Checkout without checkin must return HTTP 400 Bad Request.');
    }
    console.log('✔ SCENARIO 3 PASSED: Checkout without check-in rejected with HTTP 400.');
    // Cleanup test records
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id IN ($1, $2, $3) AND date = $4`, [emp1Id, emp2Id, emp3Id, today]);
    console.log('\n=== ALL VERIFICATION SCENARIOS PASSED SUCCESSFULLY ===');
    await db_1.default.end();
}
runVerification().catch((err) => {
    console.error('Verification failed with error:', err);
    process.exit(1);
});
