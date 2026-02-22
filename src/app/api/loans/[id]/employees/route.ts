import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, notFoundError, serverError, validationError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET: list employees on this loan (= loan chat team; single source of truth: loan_employees) */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const loanId = params.id;
    const [loanRows] = await pool.query(
      'SELECT employee_id FROM loans WHERE id = ?',
      [loanId]
    ) as any[];
    if (loanRows.length === 0) return notFoundError('Loan');

    const [rows] = await pool.query(
      'SELECT employee_id FROM loan_employees WHERE loan_id = ? ORDER BY employee_id',
      [loanId]
    ) as any[];
    const employeeIds = rows.length > 0
      ? rows.map((r: any) => r.employee_id)
      : [loanRows[0].employee_id];

    return successResponse(employeeIds);
  } catch (error: any) {
    console.error('Get loan employees error:', error);
    return serverError();
  }
}

/** POST: add an employee to the loan (and to the loan chat — same list) */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const loanId = params.id;
    const body = await request.json();
    const { employeeId } = body;
    if (!employeeId) return validationError('employeeId is required', 'error.missingRequiredFields');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [loan] = await connection.query(
        'SELECT id, customer_id FROM loans WHERE id = ?',
        [loanId]
      ) as any[];
      if (loan.length === 0) {
        await connection.rollback();
        return notFoundError('Loan');
      }
      const customerId = loan[0].customer_id;

      const [emp] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND role = ?',
        [employeeId, 'employee']
      ) as any[];
      if (emp.length === 0) {
        await connection.rollback();
        return notFoundError('Employee');
      }

      await connection.query(
        'INSERT IGNORE INTO loan_employees (loan_id, employee_id) VALUES (?, ?)',
        [loanId, employeeId]
      );
      await connection.query(
        'INSERT IGNORE INTO employee_customer_assignments (employee_id, customer_id) VALUES (?, ?)',
        [employeeId, customerId]
      );

      const [chatRows] = await connection.query(
        'SELECT id FROM chats WHERE loan_id = ? LIMIT 1',
        [loanId]
      ) as any[];
      if (chatRows.length > 0) {
        const chatId = chatRows[0].id;
        await connection.query(
          'INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
          [chatId, employeeId]
        );
      }

      await connection.commit();
      return successResponse({ added: true });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Add loan employee error:', error);
    return serverError();
  }
}

/** PUT: set full list (assigned employees = chat team); syncs loan_employees and chat participants */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const loanId = params.id;
    const body = await request.json();
    const rawIds = body.employeeIds;
    const employeeIds = Array.isArray(rawIds) ? rawIds.filter((id: string) => id && typeof id === 'string') : [];
    if (employeeIds.length === 0) return validationError('employeeIds array with at least one id is required', 'error.missingRequiredFields');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [loan] = await connection.query(
        'SELECT id, customer_id FROM loans WHERE id = ?',
        [loanId]
      ) as any[];
      if (loan.length === 0) {
        await connection.rollback();
        return notFoundError('Loan');
      }
      const customerId = loan[0].customer_id;

      for (const eid of employeeIds) {
        const [emp] = await connection.query(
          'SELECT id FROM users WHERE id = ? AND role = ?',
          [eid, 'employee']
        ) as any[];
        if (emp.length === 0) {
          await connection.rollback();
          return notFoundError('Employee');
        }
      }

      const primaryId = employeeIds[0];
      await connection.query('UPDATE loans SET employee_id = ? WHERE id = ?', [primaryId, loanId]);
      await connection.query('DELETE FROM loan_employees WHERE loan_id = ?', [loanId]);
      for (const eid of employeeIds) {
        await connection.query(
          'INSERT INTO loan_employees (loan_id, employee_id) VALUES (?, ?)',
          [loanId, eid]
        );
        await connection.query(
          'INSERT IGNORE INTO employee_customer_assignments (employee_id, customer_id) VALUES (?, ?)',
          [eid, customerId]
        );
      }

      const [chatRows] = await connection.query(
        'SELECT id FROM chats WHERE loan_id = ? LIMIT 1',
        [loanId]
      ) as any[];
      if (chatRows.length > 0) {
        const chatId = chatRows[0].id;
        await connection.query('DELETE FROM chat_participants WHERE chat_id = ?', [chatId]);
        await connection.query(
          'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
          [chatId, customerId]
        );
        for (const eid of employeeIds) {
          await connection.query(
            'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
            [chatId, eid]
          );
        }
      }

      await connection.commit();
      return successResponse({ updated: true });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Set loan employees error:', error);
    return serverError();
  }
}

/** DELETE: remove an employee from the loan (and from the loan chat — same list) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const loanId = params.id;
    const employeeId = request.nextUrl.searchParams.get('employeeId');
    if (!employeeId) return validationError('employeeId query is required', 'error.missingRequiredFields');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [loan] = await connection.query('SELECT id FROM loans WHERE id = ?', [loanId]) as any[];
      if (loan.length === 0) {
        await connection.rollback();
        return notFoundError('Loan');
      }

      await connection.query(
        'DELETE FROM loan_employees WHERE loan_id = ? AND employee_id = ?',
        [loanId, employeeId]
      );

      const [loanRow] = await connection.query(
        'SELECT employee_id FROM loans WHERE id = ?',
        [loanId]
      ) as any[];
      const currentPrimary = loanRow?.[0]?.employee_id;
      if (currentPrimary === employeeId) {
        const [remaining] = await connection.query(
          'SELECT employee_id FROM loan_employees WHERE loan_id = ? ORDER BY employee_id LIMIT 1',
          [loanId]
        ) as any[];
        const newPrimary = remaining?.[0]?.employee_id ?? null;
        await connection.query(
          'UPDATE loans SET employee_id = ? WHERE id = ?',
          [newPrimary, loanId]
        );
      }

      const [chatRows] = await connection.query(
        'SELECT id FROM chats WHERE loan_id = ? LIMIT 1',
        [loanId]
      ) as any[];
      if (chatRows.length > 0) {
        await connection.query(
          'DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?',
          [chatRows[0].id, employeeId]
        );
      }

      await connection.commit();
      return successResponse({ removed: true });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Remove loan employee error:', error);
    return serverError();
  }
}
