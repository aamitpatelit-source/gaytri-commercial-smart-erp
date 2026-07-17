import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getLeaveBalances,
  updateLeaveBalance,
  submitLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest
} from '../controllers/leaveController';

const router = Router();

// Apply auth middleware to all leaves routes
router.use(authenticateToken);

// Balances
router.get('/balances', getLeaveBalances);
router.put('/balances/:id', updateLeaveBalance);

// Requests
router.get('/requests', getLeaveRequests);
router.post('/requests', submitLeaveRequest);
router.delete('/requests/:id', cancelLeaveRequest); // Cancel request

// Actions
router.post('/requests/:id/approve', approveLeaveRequest);
router.post('/requests/:id/reject', rejectLeaveRequest);

export default router;
