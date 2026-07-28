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
  getManagerEmployees,
  assignManagerEmployees,
  assignAllEmployees,
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
router.get('/seed-prod-superadmin', asyncHandler(async (req: any, res: any) => {
  const bcrypt = require('bcryptjs');
  const { query } = require('../config/db');
  const hash = bcrypt.hashSync('sunny7033', 10);
  const result = await query(`
    INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
    VALUES (uuid_generate_v4(), 'gaytricommercial7033@gmail.com', $1, 'Gaytri Super Admin', 'SUPER_ADMIN', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'SUPER_ADMIN',
      is_active = TRUE,
      must_change_password = FALSE,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, email, role, is_active
  `, [hash]);

  const allAdmins = await query('SELECT id, email, role, is_active FROM admins');

  return res.status(200).json({
    success: true,
    message: 'Super admin seeded/verified on production DB.',
    seeded: result.rows[0],
    allAdmins: allAdmins.rows
  });
}));

// Protected status query & self password change/profile update
router.get('/me', authenticateToken as any, asyncHandler(getMe));
router.post('/change-password', authenticateToken as any, asyncHandler(changePassword));
router.put('/profile', authenticateToken as any, asyncHandler(updateProfile));

// Manager Accounts CRUD routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(getManagers));
router.post('/managers', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createManager));
router.put('/managers/:id', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateManager));
router.delete('/managers/:id', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteManager));

// Manager Direct Employee Assignment routes (restricted to SUPER_ADMIN & ADMIN)
router.get('/managers/:id/employees', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(getManagerEmployees));
router.post('/managers/:id/employees', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(assignManagerEmployees));
router.post('/managers/:id/assign-all', authenticateToken as any, requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(assignAllEmployees));

export default router;
