import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, notFoundError, serverError } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if employee exists
    const [employees] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = ?',
      [params.id, 'employee']
    ) as any[];

    if (employees.length === 0) {
      return notFoundError('Employee');
    }

    // Get assigned customers (exclude deleted and blocked – not shown to employees)
    let rows: any[];
    try {
      [rows] = await pool.query(
        `SELECT u.*, 
          ut_en.name as name_en,
          ut_ar.name as name_ar,
          c.phone,
          c.address,
          c.assigned_employee_id
        FROM users u
        INNER JOIN customers c ON u.id = c.id
        INNER JOIN employee_customer_assignments eca ON c.id = eca.customer_id
        LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
        LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
        WHERE eca.employee_id = ?
          AND (u.is_deleted = FALSE OR u.is_deleted IS NULL)
          AND u.is_active = TRUE
        ORDER BY u.created_at DESC`,
        [params.id]
      ) as any[];
    } catch (e: any) {
      if (e?.code === 'ER_BAD_FIELD_ERROR' && e?.message?.includes('is_deleted')) {
        [rows] = await pool.query(
          `SELECT u.*, 
            ut_en.name as name_en,
            ut_ar.name as name_ar,
            c.phone,
            c.address,
            c.assigned_employee_id
          FROM users u
          INNER JOIN customers c ON u.id = c.id
          INNER JOIN employee_customer_assignments eca ON c.id = eca.customer_id
          LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
          LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
          WHERE eca.employee_id = ? AND u.is_active = TRUE
          ORDER BY u.created_at DESC`,
          [params.id]
        ) as any[];
      } else {
        throw e;
      }
    }

    const customers = rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      name: row.name_en || row.email,
      role: row.role,
      avatar: row.avatar,
      isActive: row.is_active,
      createdAt: row.created_at,
      phone: row.phone,
      address: row.address,
      assignedEmployeeId: row.assigned_employee_id || '',
    }));

    return successResponse(customers);
  } catch (error: any) {
    console.error('Get employee customers error:', error);
    return serverError();
  }
}
