import { Router } from 'express';
import {
  verifyAndRecordAttendance,
  getDashboardStats,
  getAttendanceHistory,
  getAttendanceSettings,
  updateAttendanceSettings,
} from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply authentication check
router.use(authenticateToken as any);

router.post('/verify', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(verifyAndRecordAttendance));
router.post('/scan', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(verifyAndRecordAttendance));
router.get('/dashboard', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getDashboardStats));
router.get('/history', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getAttendanceHistory));
router.get('/settings', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getAttendanceSettings));
router.put('/settings', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateAttendanceSettings));
router.get('/', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getAttendanceHistory));

export default router;
