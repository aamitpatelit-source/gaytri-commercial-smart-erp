"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../controllers/attendanceController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply authentication check
router.use(auth_1.authenticateToken);
router.post('/verify', (0, auth_1.requireRole)(['ADMIN']), attendanceController_1.verifyAndRecordAttendance);
router.get('/dashboard', (0, auth_1.requireRole)(['ADMIN']), attendanceController_1.getDashboardStats);
router.get('/history', (0, auth_1.requireRole)(['ADMIN']), attendanceController_1.getAttendanceHistory);
router.get('/', (0, auth_1.requireRole)(['ADMIN']), attendanceController_1.getAttendanceHistory);
exports.default = router;
