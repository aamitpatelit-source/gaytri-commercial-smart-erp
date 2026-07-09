"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../controllers/attendanceController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Apply authentication check
router.use(auth_1.authenticateToken);
router.post('/mark', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.markAttendance));
router.post('/void', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(attendanceController_1.voidAttendance));
router.get('/dashboard', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getDashboardStats));
router.get('/history', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAttendanceHistory));
router.get('/audit-logs', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAuditLogs));
router.get('/employee-summary', (0, auth_1.requireRole)(['EMPLOYEE']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getEmployeeSummary));
router.get('/settings', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAttendanceSettings));
router.put('/settings', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(attendanceController_1.updateAttendanceSettings));
exports.default = router;
