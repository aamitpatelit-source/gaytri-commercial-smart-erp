import { query } from '../config/db';

/**
 * Shared utility to resolve direct employee assignments for managers.
 */
export const getAssignedEmployeeIds = async (managerId: string): Promise<string[]> => {
  const result = await query(
    'SELECT employee_id FROM manager_employees WHERE manager_id = $1',
    [managerId]
  );
  return result.rows.map(row => row.employee_id);
};

export const canManageEmployee = async (managerId: string, employeeId: string, role: string): Promise<boolean> => {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return true;
  }
  const result = await query(
    'SELECT 1 FROM manager_employees WHERE manager_id = $1 AND employee_id = $2',
    [managerId, employeeId]
  );
  return result.rows.length > 0;
};

export const getAssignedEmployees = async (managerId: string): Promise<any[]> => {
  const result = await query(
    `SELECT e.*, d.name as department, dg.name as designation, s.name as shift
     FROM employees e
     JOIN manager_employees me ON e.id = me.employee_id
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN designations dg ON e.designation_id = dg.id
     LEFT JOIN shifts s ON e.shift_id = s.id
     WHERE me.manager_id = $1 AND e.is_active = TRUE
     ORDER BY e.employee_id ASC`,
    [managerId]
  );
  return result.rows;
};
