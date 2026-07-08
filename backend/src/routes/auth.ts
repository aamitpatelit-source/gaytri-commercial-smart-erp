import { Router } from 'express';
import {
  login,
  adminLogin,
  employeeLogin,
  forgotPassword,
  resetPassword,
  getMe,
  changePassword,
  updateProfile,
  getManagers,
  createManager,
  updateManager,
  deleteManager,
} from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Public login routes
router.post('/login', asyncHandler(login));
router.post('/admin/login', asyncHandler(adminLogin));
router.post('/employee/login', asyncHandler(employeeLogin));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));

// Protected status query & self password change/profile update
router.get('/me', authenticateToken as any, asyncHandler(getMe));
router.post('/change-password', authenticateToken as any, asyncHandler(changePassword));
router.put('/profile', authenticateToken as any, asyncHandler(updateProfile));

// Manager Accounts CRUD routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(getManagers));
router.post('/managers', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createManager));
router.put('/managers/:id', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateManager));
router.delete('/managers/:id', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteManager));

export default router;
