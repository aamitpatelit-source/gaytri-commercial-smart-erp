import { query } from '../config/db';

/**
 * Shared utility to resolve managed department IDs for any administrative user.
 * Returns null if the user is SUPER_ADMIN or ADMIN (unrestricted access).
 * Returns number[] of department IDs assigned to the manager.
 */
export const getManagedDepartmentIds = async (adminId: string, role: string): Promise<number[] | null> => {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return null;
  }

  const result = await query(
    'SELECT department_id FROM manager_departments WHERE manager_id = $1',
    [adminId]
  );
  
  return result.rows.map(row => row.department_id);
};
