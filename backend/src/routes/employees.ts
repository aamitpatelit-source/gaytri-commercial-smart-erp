import { Router } from 'express';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  registerFace,
} from '../controllers/employeeController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply auth check
router.use(authenticateToken as any);

router.get('/', requireRole(['ADMIN']) as any, asyncHandler(getEmployees));
router.post('/', requireRole(['ADMIN']) as any, asyncHandler(createEmployee));
router.post('/register-face', requireRole(['ADMIN']) as any, asyncHandler(registerFace));
router.put('/:id', requireRole(['ADMIN']) as any, asyncHandler(updateEmployee));
router.delete('/:id', requireRole(['ADMIN']) as any, asyncHandler(deleteEmployee));
router.post('/:id/register-face', requireRole(['ADMIN']) as any, asyncHandler(registerFace));

export default router;
