import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, notFoundError, serverError } from '@/lib/api';
import { createNotificationAndPush } from '@/lib/notify';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { employeeId, employeeIds: rawEmployeeIds, requestedByUserId } = body;
    const customerId = params.id;
    const requestedBy = requestedByUserId || request.nextUrl.searchParams.get('userId');

    const employeeIds = Array.isArray(rawEmployeeIds)
      ? rawEmployeeIds.filter((id: string) => id && typeof id === 'string')
      : employeeId ? [employeeId] : [];

    if (employeeIds.length === 0) {
      return errorResponse('Employee ID or employeeIds array is required', 400, 'error.employeeIdRequired');
    }

    if (requestedBy) {
      const [requester] = await pool.query('SELECT id, role FROM users WHERE id = ?', [requestedBy]) as any[];
      if (requester.length > 0 && requester[0].role === 'employee') {
        if (employeeIds.length !== 1 || employeeIds[0] !== requestedBy) {
          return errorResponse('Employee can only assign themselves to a customer', 403, 'error.accessDenied');
        }
      }
    }

    const [customers] = await pool.query('SELECT id FROM customers WHERE id = ?', [customerId]) as any[];
    if (customers.length === 0) return notFoundError('Customer');

    for (const eid of employeeIds) {
      const [emp] = await pool.query('SELECT id FROM users WHERE id = ? AND role = ?', [eid, 'employee']) as any[];
      if (emp.length === 0) return notFoundError('Employee');
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const primaryId = employeeIds[0];
      await connection.query(
        'UPDATE customers SET assigned_employee_id = ? WHERE id = ?',
        [primaryId, customerId]
      );
      await connection.query(
        'DELETE FROM employee_customer_assignments WHERE customer_id = ?',
        [customerId]
      );
      for (const eid of employeeIds) {
        await connection.query(
          `INSERT IGNORE INTO employee_customer_assignments (employee_id, customer_id) VALUES (?, ?)`,
          [eid, customerId]
        );
      }
      for (const eid of employeeIds) {
        const [existingChats] = await connection.query(
          `SELECT c.id FROM chats c
           INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
           INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
           WHERE c.type = 'customer_employee' AND c.loan_id IS NULL`,
          [customerId, eid]
        ) as any[];
        if (existingChats.length === 0) {
          const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await connection.query(`INSERT INTO chats (id, type) VALUES (?, 'customer_employee')`, [chatId]);
          await connection.query(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)`,
            [chatId, customerId, chatId, eid]
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // Send notifications asynchronously so the API responds quickly
    const [custNames] = await pool.query(
      `SELECT ut_en.name as name_en, ut_ar.name as name_ar FROM users u
       LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
       LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
       WHERE u.id = ?`,
      [customerId]
    ) as any[];
    const customerNameEn = custNames?.[0]?.name_en || custNames?.[0]?.name_ar || 'Customer';
    const customerNameAr = custNames?.[0]?.name_ar || custNames?.[0]?.name_en || 'عميل';

    const notifyEmployeeIds = [...employeeIds];
    setImmediate(() => {
      (async () => {
        for (const eid of notifyEmployeeIds) {
          try {
            await createNotificationAndPush(
              eid,
              'New Customer Assigned',
              'تم تعيين عميل جديد',
              `${customerNameEn} has been assigned to you`,
              `تم تعيين ${customerNameAr} لك`,
              'info'
            );
          } catch (e) {
            console.error('[Assign] Notify employee error:', e);
          }
        }
        try {
          const [firstEmpNames] = await pool.query(
            `SELECT ut_en.name as name_en, ut_ar.name as name_ar FROM users u
             LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
             LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
             WHERE u.id = ?`,
            [notifyEmployeeIds[0]]
          ) as any[];
          const employeeNameEn = firstEmpNames?.[0]?.name_en || firstEmpNames?.[0]?.name_ar || 'Employee';
          const employeeNameAr = firstEmpNames?.[0]?.name_ar || firstEmpNames?.[0]?.name_en || 'موظف';
          await createNotificationAndPush(
            customerId,
            'Employee Assigned to You',
            'تم تعيين موظف لك',
            notifyEmployeeIds.length > 1
              ? `${notifyEmployeeIds.length} team members assigned as your contacts`
              : `${employeeNameEn} has been assigned as your contact`,
            notifyEmployeeIds.length > 1
              ? `تم تعيين ${notifyEmployeeIds.length} أعضاء الفريق كجهة اتصالك`
              : `تم تعيين ${employeeNameAr} كجهة اتصالك`,
            'info'
          );
        } catch (e) {
          console.error('[Assign] Notify customer error:', e);
        }
      })();
    });

    return successResponse({}, employeeIds.length > 1 ? 'Employees assigned successfully' : 'Employee assigned successfully');
  } catch (error: any) {
    console.error('Assign employee error:', error);
    return serverError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const customerId = params.id;
  const employeeId = request.nextUrl.searchParams.get('employeeId');
  if (!customerId) return errorResponse('Customer ID is required', 400);
  try {
    const [customers] = await pool.query('SELECT id, assigned_employee_id FROM customers WHERE id = ?', [customerId]) as any[];
    if (customers.length === 0) return notFoundError('Customer');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (employeeId) {
        await connection.query(
          'DELETE FROM employee_customer_assignments WHERE customer_id = ? AND employee_id = ?',
          [customerId, employeeId]
        );
        const currentPrimary = customers[0].assigned_employee_id;
        if (currentPrimary === employeeId) {
          const [remaining] = await connection.query(
            'SELECT employee_id FROM employee_customer_assignments WHERE customer_id = ? ORDER BY employee_id LIMIT 1',
            [customerId]
          ) as any[];
          const newPrimary = remaining?.[0]?.employee_id ?? null;
          await connection.query(
            'UPDATE customers SET assigned_employee_id = ? WHERE id = ?',
            [newPrimary, customerId]
          );
        }
      } else {
        await connection.query('UPDATE customers SET assigned_employee_id = NULL WHERE id = ?', [customerId]);
        await connection.query('DELETE FROM employee_customer_assignments WHERE customer_id = ?', [customerId]);
      }
      await connection.commit();
      return successResponse({}, employeeId ? 'Employee unassigned successfully' : 'Employee assignment removed successfully');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Remove assignment error:', error);
    return serverError(error?.message ?? 'Failed to remove assignment');
  }
}
