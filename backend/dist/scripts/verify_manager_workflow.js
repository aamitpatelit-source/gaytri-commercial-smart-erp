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
    console.log('=== STARTING MANAGER WORKFLOW VERIFICATION SUITE ===');
    const tz = 'Asia/Kolkata';
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    const adminRes = await (0, db_1.query)(`SELECT id FROM admins WHERE role IN ('ADMIN', 'SUPER_ADMIN') LIMIT 1`);
    if (adminRes.rows.length === 0) {
        console.error('No admin found in DB.');
        process.exit(1);
    }
    const adminId = adminRes.rows[0].id;
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
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id IN ($1, $2, $3) AND date = $4`, [emp1Id, emp2Id, emp3Id, today]);
    console.log('[Cleanup] Reset test attendance records.');
    const mockUser = { id: adminId, role: 'SUPER_ADMIN' };
    // TEST 1: Manager Marks Employee 1 as PRESENT -> check_in_time set to server timestamp
    console.log('\n--- Test 1: Manager Save PRESENT (check_in_time population) ---');
    const req1 = {
        body: { date: today, records: [{ employee_id: emp1Id, status: 'PRESENT', remarks: 'Manager Present' }] },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const res1 = createMockRes();
    await (0, attendanceController_1.markAttendance)(req1, res1);
    if (res1.statusCode !== 200 || res1.data.saved !== 1) {
        throw new Error('FAILED Test 1: Expected 1 saved.');
    }
    const emp1RecordDB = await (0, db_1.query)(`SELECT check_in_time, check_out_time, status FROM attendance WHERE employee_id = $1 AND date = $2`, [emp1Id, today]);
    if (!emp1RecordDB.rows[0].check_in_time) {
        throw new Error('FAILED Test 1: check_in_time was not automatically populated on server save.');
    }
    console.log('✔ Test 1 PASSED: check_in_time automatically populated:', emp1RecordDB.rows[0].check_in_time);
    // TEST 2: Manager Marks Employee 2 as ABSENT -> check_in_time remains null
    console.log('\n--- Test 2: Manager Save ABSENT (check_in_time null) ---');
    const req2 = {
        body: { date: today, records: [{ employee_id: emp2Id, status: 'ABSENT', remarks: 'Manager Absent' }] },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const res2 = createMockRes();
    await (0, attendanceController_1.markAttendance)(req2, res2);
    const emp2RecordDB = await (0, db_1.query)(`SELECT check_in_time, check_out_time, status FROM attendance WHERE employee_id = $1 AND date = $2`, [emp2Id, today]);
    if (emp2RecordDB.rows[0].check_in_time !== null) {
        throw new Error('FAILED Test 2: ABSENT record must have null check_in_time.');
    }
    console.log('✔ Test 2 PASSED: ABSENT record has null check_in_time.');
    // TEST 3: Check Out Employee 1 -> Server timestamp recorded
    console.log('\n--- Test 3: Check Out Employee 1 ---');
    const coReq1 = { body: { employee_id: emp1Id }, user: mockUser, ip: '127.0.0.1' };
    const coRes1 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(coReq1, coRes1);
    if (coRes1.statusCode !== 200 || !coRes1.data.attendance.check_out_time) {
        throw new Error('FAILED Test 3: Checkout failed.');
    }
    const originalCheckOut = coRes1.data.attendance.check_out_time;
    console.log('✔ Test 3 PASSED: Checked out successfully at:', originalCheckOut);
    // TEST 4: Duplicate Check Out -> HTTP 409 Conflict
    console.log('\n--- Test 4: Duplicate Check Out Attempt ---');
    const coReq2 = { body: { employee_id: emp1Id }, user: mockUser, ip: '127.0.0.1' };
    const coRes2 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(coReq2, coRes2);
    if (coRes2.statusCode !== 409 || coRes2.data.message !== 'Employee has already checked out today.') {
        throw new Error(`FAILED Test 4: Expected 409 Conflict, got ${coRes2.statusCode}`);
    }
    console.log('✔ Test 4 PASSED: Duplicate checkout rejected with HTTP 409 Conflict.');
    // TEST 5: Post-Checkout Immutability -> Attempting to modify attendance via markAttendance returns HTTP 409 Conflict
    console.log('\n--- Test 5: Post-Checkout Immutability ---');
    const reqMod = {
        body: { date: today, records: [{ employee_id: emp1Id, status: 'ABSENT', remarks: 'Attempt modify checked out emp' }] },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const resMod = createMockRes();
    await (0, attendanceController_1.markAttendance)(reqMod, resMod);
    if (resMod.statusCode !== 409 || resMod.data.message !== 'Attendance is locked because the employee has already checked out.') {
        throw new Error(`FAILED Test 5: Expected 409 Conflict for post-checkout modification, got ${resMod.statusCode} (${resMod.data?.message})`);
    }
    console.log('✔ Test 5 PASSED: Post-checkout modification rejected with HTTP 409 Conflict:', resMod.data.message);
    // TEST 6: Checkout Without Check-In -> HTTP 400 Bad Request
    console.log('\n--- Test 6: Checkout Without Check-In ---');
    const coReq3 = { body: { employee_id: emp3Id }, user: mockUser, ip: '127.0.0.1' };
    const coRes3 = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(coReq3, coRes3);
    if (coRes3.statusCode !== 400 || coRes3.data.message !== 'Employee has not checked in today.') {
        throw new Error(`FAILED Test 6: Expected 400 Bad Request, got ${coRes3.statusCode}`);
    }
    console.log('✔ Test 6 PASSED: Checkout without check-in rejected with HTTP 400.');
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id IN ($1, $2, $3) AND date = $4`, [emp1Id, emp2Id, emp3Id, today]);
    console.log('\n=== ALL MANAGER WORKFLOW TESTS PASSED SUCCESSFULLY ===');
    await db_1.default.end();
}
runVerification().catch((err) => {
    console.error('Verification failed with error:', err);
    process.exit(1);
});
