"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calculationService_1 = require("../services/calculationService");
console.log("=========================================================");
console.log("STARTING ATTENDANCE & PAYROLL ENGINE STABILIZATION TESTS");
console.log("=========================================================");
const settings = {
    ...calculationService_1.DEFAULT_ATTENDANCE_PAYROLL_SETTINGS,
    shift_start_time: '09:00',
    shift_end_time: '19:00',
    late_grace_period: 15,
    early_checkout_grace_period: 15,
    lunch_break_duration: 60,
    paid_working_hours: 9,
    monthly_working_days: 26,
    min_hours_full_day: 8,
    min_hours_half_day: 4,
    absent_threshold_hours: 2,
};
let passed = 0;
let total = 0;
function assert(condition, description) {
    total++;
    if (condition) {
        console.log(`[PASS] ${description}`);
        passed++;
    }
    else {
        console.error(`[FAIL] ${description}`);
    }
}
// Test 1: 09:05 Check-In -> Present / Working (Not Late)
const t1 = (0, calculationService_1.evaluateCheckIn)('09:05:00', settings);
assert(!t1.isLate, '09:05 Check-In is not late');
assert(t1.status === 'WORKING', '09:05 Check-In status is WORKING');
assert(t1.lateMinutes === 0, '09:05 Check-In late minutes is 0');
// Test 2: 09:20 Check-In -> Late immediately
const t2 = (0, calculationService_1.evaluateCheckIn)('09:20:00', settings);
assert(t2.isLate, '09:20 Check-In is late immediately');
assert(t2.status === 'LATE', '09:20 Check-In status is LATE immediately');
assert(t2.lateMinutes === 20, '09:20 Check-In late minutes is 20');
// Test 3: 03:49 PM Check-In -> Late immediately
const t3 = (0, calculationService_1.evaluateCheckIn)('03:49 PM', settings);
assert(t3.isLate, '03:49 PM Check-In is late immediately');
assert(t3.status === 'LATE', '03:49 PM Check-In status is LATE immediately');
// Test 4: Check-Out does not change Late status
const t4 = (0, calculationService_1.evaluateCheckOut)('09:00:00', '19:00:00', true, 20, settings);
assert(t4.isLate, 'Check-Out preserves isLate = true');
assert(t4.status === 'LATE', 'Check-Out preserves status = LATE');
assert(t4.workedHours === 9, '10-hour span minus 1-hour lunch = 9 worked hours');
// Test 5: 10 Hours presence with 1 Hour Lunch -> 9 Paid Hours
const worked = (0, calculationService_1.calculateWorkedHours)('09:00:00', '19:00:00', settings);
assert(worked === 9.00, `Worked hours calculated as 9.00 (got ${worked})`);
// Test 6: Non-zero Daily Salary calculation when attendance exists
const monthlySalary = 26000;
const dailyCalc = (0, calculationService_1.calculateDailySalary)(monthlySalary, worked, worked, 0, settings);
assert(dailyCalc.dailyRate === 1000, `Daily rate is ₹1000 (got ₹${dailyCalc.dailyRate})`);
assert(dailyCalc.earnedSalary > 0, `Daily earned salary is non-zero (got ₹${dailyCalc.earnedSalary})`);
// Test 7: Monthly Payroll calculation
const monthCalc = (0, calculationService_1.calculatePayrollSalary)(monthlySalary, 26, 0, 234, 0, settings);
assert(monthCalc.totalPay === 26000, `Full month payroll calculated as ₹26000 (got ₹${monthCalc.totalPay})`);
console.log("=========================================================");
console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
console.log("=========================================================");
if (passed !== total) {
    process.exit(1);
}
