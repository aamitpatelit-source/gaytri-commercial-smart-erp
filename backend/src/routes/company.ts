import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  getHolidays,
  createHoliday,
  deleteHoliday,
  getCompanySettings,
  updateCompanySettings,
} from '../controllers/companyController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply authentication check to all routes
router.use(authenticateToken as any);

// Departments
router.get('/departments', asyncHandler(getDepartments));
router.post('/departments', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createDepartment));
router.put('/departments/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateDepartment));
router.delete('/departments/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteDepartment));

// Designations
router.get('/designations', asyncHandler(getDesignations));
router.post('/designations', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createDesignation));
router.put('/designations/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateDesignation));
router.delete('/designations/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteDesignation));

// Shifts
router.get('/shifts', asyncHandler(getShifts));
router.post('/shifts', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createShift));
router.put('/shifts/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateShift));
router.delete('/shifts/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteShift));

// Holidays
router.get('/holidays', asyncHandler(getHolidays));
router.post('/holidays', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createHoliday));
router.delete('/holidays/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteHoliday));

// Company Settings
router.get('/settings', asyncHandler(getCompanySettings));
router.put('/settings', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateCompanySettings));

export default router;