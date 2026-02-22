import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, notFoundError, serverError, validationError, unauthorizedError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** POST: set the primary employee for this loan (only one primary). Employee must be on the loan. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return unauthorizedError();
    const [users] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    ) as any[];
    if (users.length === 0 || users[0].role !== 'admin') return unauthorizedError();

    const body = await request.json().catch(() => ({}));
    const { employeeId } = body;
    if (!employeeId) return validationError('employeeId is required', 'error.missingRequiredFields');

    const [loan] = await pool.query(
      'SELECT id, employee_id FROM loans WHERE id = ?',
      [params.id]
    ) as any[];
    if (loan.length === 0) return notFoundError('Loan');

    const [onLoan] = await pool.query(
      'SELECT 1 FROM loan_employees WHERE loan_id = ? AND employee_id = ?',
      [params.id, employeeId]
    ) as any[];
    const currentPrimary = loan[0].employee_id;
    const isCurrentPrimary = currentPrimary === employeeId;
    if (onLoan.length === 0 && !isCurrentPrimary) {
      return errorResponse('Employee must be on this loan to be set as primary', 400, 'error.employeeNotOnLoan');
    }

    await pool.query(
      'UPDATE loans SET employee_id = ? WHERE id = ?',
      [employeeId, params.id]
    );
    return successResponse({ primaryEmployeeId: employeeId });
  } catch (error: any) {
    console.error('Set primary employee error:', error);
    return serverError();
  }
}
