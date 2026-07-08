import { Router } from 'express';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '../controllers/employeeController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply auth check
router.use(authenticateToken as any);

router.get('/', requireRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER']) as any, asyncHandler(getEmployees));
router.post('/', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(createEmployee));
router.put('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(updateEmployee));
router.delete('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']) as any, asyncHandler(deleteEmployee));

export default router;
