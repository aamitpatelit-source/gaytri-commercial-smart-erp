import { Router } from 'express';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  registerFace,
} from '../controllers/employeeController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Apply auth check
router.use(authenticateToken as any);

router.get('/', requireRole(['ADMIN']) as any, getEmployees);
router.post('/', requireRole(['ADMIN']) as any, createEmployee);
router.put('/:id', requireRole(['ADMIN']) as any, updateEmployee);
router.delete('/:id', requireRole(['ADMIN']) as any, deleteEmployee);
router.post('/:id/register-face', requireRole(['ADMIN']) as any, registerFace);

export default router;
