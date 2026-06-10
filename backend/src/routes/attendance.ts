import { Router } from 'express';
import {
  verifyAndRecordAttendance,
  getDashboardStats,
  getAttendanceHistory,
} from '../controllers/attendanceController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Apply authentication check
router.use(authenticateToken as any);

router.post('/verify', requireRole(['ADMIN']) as any, verifyAndRecordAttendance as any);
router.get('/dashboard', requireRole(['ADMIN']) as any, getDashboardStats as any);
router.get('/history', requireRole(['ADMIN']) as any, getAttendanceHistory as any);
router.get('/', requireRole(['ADMIN']) as any, getAttendanceHistory as any);

export default router;
