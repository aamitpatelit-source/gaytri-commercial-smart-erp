import { Router } from 'express';
import {
  verifyAndRecordAttendance,
  getDashboardStats,
  getAttendanceHistory,
} from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply authentication check
router.use(authenticateToken as any);

router.post('/verify', requireRole(['ADMIN']) as any, asyncHandler(verifyAndRecordAttendance));
router.get('/dashboard', requireRole(['ADMIN']) as any, asyncHandler(getDashboardStats));
router.get('/history', requireRole(['ADMIN']) as any, asyncHandler(getAttendanceHistory));
router.get('/', requireRole(['ADMIN']) as any, asyncHandler(getAttendanceHistory));

export default router;
