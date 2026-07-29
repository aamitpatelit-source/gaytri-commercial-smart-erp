import { Router } from 'express';
import {
  markAttendance,
  voidAttendance,
  getDashboardStats,
  getAttendanceHistory,
  getAuditLogs,
  getEmployeeSummary,
  employeeCheckIn,
  employeeCheckOut,
  correctAttendance,
  getEmployeeStats,
  deleteAttendanceRecord,
  getMonthlyPayrollReport,
  recalculateHistoricalAttendance
} from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply authentication check
router.use(authenticateToken as any);

router.post('/mark', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(markAttendance));
router.post('/void', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(voidAttendance));
router.post('/check-in', requireRole(['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(employeeCheckIn));
router.post('/check-out', requireRole(['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(employeeCheckOut));
router.post('/checkout', requireRole(['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(employeeCheckOut));
router.post('/correct', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(correctAttendance));
router.post('/recalculate-history', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(recalculateHistoricalAttendance));
router.get('/employee/:id/stats', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']) as any, asyncHandler(getEmployeeStats));
router.get('/dashboard', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getDashboardStats));
router.get('/history', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']) as any, asyncHandler(getAttendanceHistory));
router.get('/payroll-report', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getMonthlyPayrollReport));
router.get('/audit-logs', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(getAuditLogs));
router.get('/employee-summary', requireRole(['EMPLOYEE']) as any, asyncHandler(getEmployeeSummary));
router.delete('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteAttendanceRecord));

export default router;
