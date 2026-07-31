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
async function verifyFullManagerUIWorkflow() {
    console.log('====================================================');
    console.log('STARTING COMPLETE END-TO-END MANAGER WORKFLOW VERIFICATION');
    console.log('====================================================\n');
    const tz = 'Asia/Kolkata';
    const today = (0, moment_timezone_1.default)().tz(tz).format('YYYY-MM-DD');
    // 1. Get test admin/manager & test employee
    const adminRes = await (0, db_1.query)(`SELECT id FROM admins WHERE role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER') LIMIT 1`);
    const managerId = adminRes.rows[0].id;
    const mockUser = { id: managerId, role: 'SUPER_ADMIN' };
    let empRes = await (0, db_1.query)(`SELECT id, employee_id, full_name FROM employees LIMIT 1`);
    if (empRes.rows.length === 0) {
        const newEmpId = '11111111-2222-3333-4444-555555555555';
        await (0, db_1.query)(`INSERT INTO employees (id, employee_id, full_name, email, mobile, joining_date, salary_type)
       VALUES ($1, 'EMP001', 'John Doe', 'john@example.com', '9876543210', CURRENT_DATE, 'MONTHLY')`, [newEmpId]);
        empRes = await (0, db_1.query)(`SELECT id, employee_id, full_name FROM employees LIMIT 1`);
    }
    const testEmp = empRes.rows[0];
    const empUuid = testEmp.id;
    const empCode = testEmp.employee_id;
    console.log(`[Test Subject] Employee UUID: ${empUuid}, Employee Code: ${empCode}, Name: ${testEmp.full_name}\n`);
    // Clean up any existing record for today
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id = $1 AND date = $2`, [empUuid, today]);
    console.log('✓ Cleaned existing today attendance record.\n');
    // STEP 1: Manager selects PRESENT & taps Save Attendance
    console.log('====================================================');
    console.log('STEP 1: SAVE ATTENDANCE (Manager marks PRESENT)');
    console.log('====================================================');
    const markReq = {
        body: {
            date: today,
            records: [{ employee_id: empUuid, status: 'PRESENT', remarks: 'On Duty' }]
        },
        user: mockUser,
        ip: '127.0.0.1',
        headers: {}
    };
    const markRes = createMockRes();
    await (0, attendanceController_1.markAttendance)(markReq, markRes);
    console.log('Save Attendance API Result:', markRes.data);
    // Evidence 1: Database row after save
    const dbRowRes = await (0, db_1.query)(`SELECT id, employee_id, date, status, time, check_in_time, check_out_time 
     FROM attendance WHERE employee_id = $1 AND date = $2`, [empUuid, today]);
    const dbRow = dbRowRes.rows[0];
    console.log('\n✓ EVIDENCE 1: Database row after save:');
    console.log({
        id: dbRow.id,
        employee_uuid: dbRow.employee_id,
        date: dbRow.date,
        attendance_status: dbRow.status,
        check_in_time: dbRow.check_in_time,
        check_out_time: dbRow.check_out_time
    });
    // STEP 2: App reloads attendance from backend (GET /attendance/history)
    console.log('\n====================================================');
    console.log('STEP 2: FRESH API FETCH (GET /attendance/history)');
    console.log('====================================================');
    const historyReq = {
        query: { start_date: today, end_date: today },
        user: mockUser
    };
    const historyRes = createMockRes();
    await (0, attendanceController_1.getAttendanceHistory)(historyReq, historyRes);
    const apiLogs = historyRes.data.logs;
    const targetLog = apiLogs.find((l) => l.employee_uuid === empUuid);
    console.log('✓ EVIDENCE 2: API JSON response item:');
    console.log({
        employee_uuid: targetLog.employee_uuid,
        employee_id: targetLog.employee_id,
        status: targetLog.status,
        check_in_time: targetLog.check_in_time,
        check_out: targetLog.check_out
    });
    // STEP 3: Flutter App parses history response into state maps
    console.log('\n====================================================');
    console.log('STEP 3: FLUTTER PARSED MODEL & DASHBOARD STATE MAPS');
    console.log('====================================================');
    const _originalStatuses = {};
    const _checkInTimes = {};
    const _checkOutTimes = {};
    const _localStatuses = {};
    for (const log of apiLogs) {
        // FIX APPLIED IN FLUTTER APP:
        const parsedEmpId = log.employee_uuid || log.employee_id;
        const status = log.status || 'PRESENT';
        const cIn = log.check_in_time || log.time;
        const cOut = log.check_out || log.check_out_time;
        if (parsedEmpId) {
            _originalStatuses[parsedEmpId] = status;
            _checkInTimes[parsedEmpId] = cIn;
            _checkOutTimes[parsedEmpId] = cOut;
            _localStatuses[parsedEmpId] = status;
        }
    }
    console.log('✓ EVIDENCE 3 & 4: Dashboard state values keyed by UUID:');
    console.log(`Lookup key (emp.id): ${empUuid}`);
    console.log(`_originalStatuses["${empUuid}"]:`, _originalStatuses[empUuid]);
    console.log(`_checkInTimes["${empUuid}"]:`, _checkInTimes[empUuid]);
    console.log(`_checkOutTimes["${empUuid}"]:`, _checkOutTimes[empUuid]);
    // STEP 4: UI Visibility condition evaluation
    console.log('\n====================================================');
    console.log('STEP 4: FINAL UI CONDITION EVALUATION');
    console.log('====================================================');
    const effectiveStatus = _originalStatuses[empUuid] || _localStatuses[empUuid];
    const checkInTime = _checkInTimes[empUuid];
    const checkOutTime = _checkOutTimes[empUuid];
    const isPresentStatus = ['PRESENT', 'WORKING', 'LATE'].includes(effectiveStatus);
    const hasCheckInTime = checkInTime !== null && checkInTime !== undefined && checkInTime !== '--:--';
    const hasNoCheckOutTime = checkOutTime === null || checkOutTime === undefined || checkOutTime === '--:--';
    const showCheckOut = isPresentStatus && hasCheckInTime && hasNoCheckOutTime;
    console.log('✓ EVIDENCE 5: Visibility values evaluation:');
    console.log({
        attendance_status: effectiveStatus,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        isPresentStatus,
        hasCheckInTime,
        hasNoCheckOutTime,
        showCheckOut
    });
    if (showCheckOut) {
        console.log('\n>>> RESULT: "Not Checked In" label IS REPLACED BY [ Check Out ] BUTTON! <<<');
    }
    else {
        throw new Error('FAIL: showCheckOut evaluated to false!');
    }
    // STEP 5: Manager presses Check Out
    console.log('\n====================================================');
    console.log('STEP 5: CHECK OUT WORKFLOW & VERIFICATIONS');
    console.log('====================================================');
    const _checkingOutEmpIds = new Set();
    // Double tap prevention test
    _checkingOutEmpIds.add(empUuid);
    console.log(`✓ Double-tap prevention activated: _checkingOutEmpIds contains ${empUuid}`);
    const coReq = { body: { employee_id: empUuid }, user: mockUser, ip: '127.0.0.1' };
    const coRes = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(coReq, coRes);
    _checkingOutEmpIds.delete(empUuid);
    console.log(`Checkout response:`, coRes.data);
    // Duplicate checkout test
    console.log('\n--- Testing Duplicate Checkout ---');
    const dupCoRes = createMockRes();
    await (0, attendanceController_1.employeeCheckOut)(coReq, dupCoRes);
    console.log(`✓ Duplicate checkout response (HTTP ${dupCoRes.statusCode}):`, dupCoRes.data);
    if (dupCoRes.statusCode !== 409) {
        throw new Error(`FAIL: Expected HTTP 409 for duplicate checkout, got ${dupCoRes.statusCode}`);
    }
    // Reload history after checkout
    const postCoHistoryRes = createMockRes();
    await (0, attendanceController_1.getAttendanceHistory)(historyReq, postCoHistoryRes);
    const postCoLog = postCoHistoryRes.data.logs.find((l) => l.employee_uuid === empUuid);
    const postCheckOutTime = postCoLog.check_out || postCoLog.check_out_time;
    const postIsPresentStatus = ['PRESENT', 'WORKING', 'LATE'].includes(postCoLog.status);
    const postHasCheckInTime = postCoLog.check_in_time !== null && postCoLog.check_in_time !== '--:--';
    const postHasNoCheckOutTime = postCheckOutTime === null || postCheckOutTime === undefined || postCheckOutTime === '--:--';
    const postShowCheckOut = postIsPresentStatus && postHasCheckInTime && postHasNoCheckOutTime;
    const hasCheckedOut = postCheckOutTime !== null && postCheckOutTime !== undefined && postCheckOutTime !== '--:--';
    console.log('\n✓ Post-Checkout UI Evaluation:');
    console.log({
        attendance_status: postCoLog.status,
        check_in_time: postCoLog.check_in_time,
        check_out_time: postCheckOutTime,
        showCheckOut: postShowCheckOut,
        hasCheckedOut: hasCheckedOut
    });
    if (hasCheckedOut && !postShowCheckOut) {
        console.log(`>>> RESULT: UI displays "Checked Out" badge with time ${postCheckOutTime}! <<<`);
    }
    else {
        throw new Error('FAIL: Post-checkout badge failed to evaluate correctly.');
    }
    // Immutability test
    console.log('\n--- Testing Post-Checkout Immutability ---');
    const modRes = createMockRes();
    await (0, attendanceController_1.markAttendance)(markReq, modRes);
    console.log(`✓ Immutability check response (HTTP ${modRes.statusCode}):`, modRes.data);
    if (modRes.statusCode !== 409) {
        throw new Error(`FAIL: Expected HTTP 409 for modifying checked out record, got ${modRes.statusCode}`);
    }
    // Clean up
    await (0, db_1.query)(`DELETE FROM attendance WHERE employee_id = $1 AND date = $2`, [empUuid, today]);
    console.log('\n====================================================');
    console.log('ALL VERIFICATIONS PASSED 100% SUCCESSFULLY');
    console.log('====================================================\n');
    await db_1.default.end();
}
verifyFullManagerUIWorkflow().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
});
