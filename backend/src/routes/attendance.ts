import { Router } from 'express';
import {
  markAttendance,
  voidAttendance,
  getDashboardStats,
  getAttendanceHistory,
  getAuditLogs,
  getEmployeeSummary,
} from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply authentication check
router.use(authenticateToken as any);

router.post('/mark', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(markAttendance));
router.post('/void', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(voidAttendance));
router.get('/dashboard', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getDashboardStats));
router.get('/history', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']) as any, asyncHandler(getAttendanceHistory));
router.get('/audit-logs', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(getAuditLogs));
router.get('/employee-summary', requireRole(['EMPLOYEE']) as any, asyncHandler(getEmployeeSummary));

export default router;
