"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../controllers/attendanceController");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Apply authentication check
router.use(auth_1.authenticateToken);
router.post('/verify', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.verifyAndRecordAttendance));
router.post('/scan', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.verifyAndRecordAttendance));
router.get('/dashboard', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getDashboardStats));
router.get('/history', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAttendanceHistory));
router.get('/settings', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAttendanceSettings));
router.put('/settings', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN']), (0, errorHandler_1.asyncHandler)(attendanceController_1.updateAttendanceSettings));
router.get('/', (0, auth_1.requireRole)(['SUPER_ADMIN', 'ADMIN', 'MANAGER']), (0, errorHandler_1.asyncHandler)(attendanceController_1.getAttendanceHistory));
exports.default = router;
