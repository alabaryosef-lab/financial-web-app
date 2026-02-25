import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { successResponse, errorResponse, notFoundError, serverError } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) {
      return notFoundError('Customer');
    }
    const userId = request.nextUrl.searchParams.get('userId');
    let isEmployee = false;
    if (userId) {
      const [ur] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]) as any[];
      isEmployee = ur.length > 0 && ur[0].role === 'employee';
    }
    let rows: any[];
    const customerFilter = isEmployee
      ? ` AND (u.is_deleted = FALSE OR u.is_deleted IS NULL) AND u.is_active = TRUE`
      : '';
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
        LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
        LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
        WHERE u.id = ? AND u.role = 'customer'${customerFilter}`,
        [id]
      ) as any[];
    } catch (e: any) {
      if (e?.code === 'ER_BAD_FIELD_ERROR' && e?.message?.includes('is_deleted')) {
        const activeFilter = isEmployee ? ' AND u.is_active = TRUE' : '';
        [rows] = await pool.query(
          `SELECT u.*, 
            ut_en.name as name_en,
            ut_ar.name as name_ar,
            c.phone,
            c.address,
            c.assigned_employee_id
          FROM users u
          INNER JOIN customers c ON u.id = c.id
          LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
          LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
          WHERE u.id = ? AND u.role = 'customer'${activeFilter}`,
          [id]
        ) as any[];
      } else {
        throw e;
      }
    }

    if (!rows || rows.length === 0) {
      return notFoundError('Customer');
    }

    const customer = rows[0];
    const [assignRows] = await pool.query(
      'SELECT employee_id FROM employee_customer_assignments WHERE customer_id = ? ORDER BY employee_id',
      [id]
    ) as any[];
    const assignedEmployeeIds = assignRows?.map((r: any) => r.employee_id) || [];
    const customerData = {
      id: customer.id,
      email: customer.email,
      name: customer.name_en || customer.email,
      role: customer.role,
      avatar: customer.avatar,
      isActive: Boolean(customer.is_active),
      createdAt: customer.created_at,
      phone: customer.phone,
      address: customer.address,
      assignedEmployeeId: customer.assigned_employee_id || (assignedEmployeeIds[0] || ''),
      assignedEmployeeIds,
    };

    return successResponse(customerData);
  } catch (error: any) {
    console.error('Get customer error:', error);
    return serverError(error?.message);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, email, phone, address, password, isActive } = body;

    // Check if customer exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = ?',
      [params.id, 'customer']
    ) as any[];

    if (existing.length === 0) {
      return notFoundError('Customer');
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update user
      if (email) {
        await connection.query(
          'UPDATE users SET email = ? WHERE id = ?',
          [email, params.id]
        );
      }

      // Update password if provided
      if (password && password.length >= 6) {
        const passwordHash = await hashPassword(password);
        await connection.query(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [passwordHash, params.id]
        );
      }

      // Update translations if name provided (same connection to avoid lock wait)
      if (name) {
        await connection.query(
          `INSERT INTO user_translations (user_id, locale, name) VALUES (?, 'en', ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [params.id, name]
        );
        await connection.query(
          `INSERT INTO user_translations (user_id, locale, name) VALUES (?, 'ar', ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [params.id, name]
        );
      }

      // Update customer
      await connection.query(
        'UPDATE customers SET phone = ?, address = ? WHERE id = ?',
        [phone || null, address || null, params.id]
      );

      // Update is_active if provided
      if (typeof isActive === 'boolean') {
        await connection.query(
          'UPDATE users SET is_active = ? WHERE id = ?',
          [isActive, params.id]
        );
      }

      await connection.commit();

      // Return updated customer (fallback if is_deleted column missing)
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
          LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
          LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
          WHERE u.id = ? AND (u.is_deleted = FALSE OR u.is_deleted IS NULL)`,
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
            LEFT JOIN user_translations ut_en ON u.id = ut_en.user_id AND ut_en.locale = 'en'
            LEFT JOIN user_translations ut_ar ON u.id = ut_ar.user_id AND ut_ar.locale = 'ar'
            WHERE u.id = ?`,
            [params.id]
          ) as any[];
        } else {
          throw e;
        }
      }

      const customer = rows[0];
      const customerData = {
        id: customer.id,
        email: customer.email,
        name: customer.name_en || customer.email,
        nameKey: customer.name_en ? `user.name.${customer.id}` : undefined,
        role: customer.role,
        avatar: customer.avatar,
        isActive: Boolean(customer.is_active),
        createdAt: customer.created_at,
        phone: customer.phone,
        address: customer.address,
        assignedEmployeeId: customer.assigned_employee_id || '',
      };

      return successResponse(customerData, 'Customer updated successfully', 'error.customerUpdatedSuccessfully');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Update customer error:', error);
    return serverError(error?.message);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND role = ?',
      [params.id, 'customer']
    ) as any[];

    if (existing.length === 0) {
      return notFoundError('Customer');
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Unassign all employees from this customer
      await connection.query(
        'DELETE FROM employee_customer_assignments WHERE customer_id = ?',
        [params.id]
      );
      await connection.query(
        'UPDATE customers SET assigned_employee_id = NULL WHERE id = ?',
        [params.id]
      );

      // 2. Delete all loans (notifications, translations, loan_employees, then loans)
      const [loanRows] = await connection.query(
        'SELECT id FROM loans WHERE customer_id = ?',
        [params.id]
      ) as any[];
      const loanIds = loanRows.map((r: any) => r.id);
      if (loanIds.length > 0) {
        const loanPlaceholders = loanIds.map(() => '?').join(',');
        await connection.query(
          `DELETE FROM notifications WHERE reference_id IN (${loanPlaceholders})`,
          loanIds
        );
      }
      await connection.query(
        'DELETE FROM notifications WHERE reference_id = ?',
        [`assignment-${params.id}`]
      );
      for (const loanId of loanIds) {
        await connection.query('DELETE FROM loan_translations WHERE loan_id = ?', [loanId]);
        try {
          await connection.query('DELETE FROM loan_employees WHERE loan_id = ?', [loanId]);
        } catch (_) {
          // loan_employees table may not exist
        }
      }
      await connection.query('DELETE FROM loans WHERE customer_id = ?', [params.id]);

      // 3. Delete all unified chats (read status, messages, participants, chats) and chat-related notifications
      const [customerChats] = await connection.query(
        'SELECT chat_id FROM chat_participants WHERE user_id = ?',
        [params.id]
      ) as any[];
      const chatIds = customerChats.map((r: any) => r.chat_id);
      if (chatIds.length > 0) {
        const placeholders = chatIds.map(() => '?').join(',');
        await connection.query(
          `DELETE FROM notifications WHERE reference_id IN (${placeholders})`,
          chatIds
        );
      }
      for (const chatId of chatIds) {
        try {
          await connection.query('DELETE FROM chat_read_status WHERE chat_id = ?', [chatId]);
        } catch (_) {
          // chat_read_status table may not exist
        }
        await connection.query('DELETE FROM chat_messages WHERE chat_id = ?', [chatId]);
        await connection.query('DELETE FROM chat_participants WHERE chat_id = ?', [chatId]);
        await connection.query('DELETE FROM chats WHERE id = ?', [chatId]);
      }

      // 4. Delete all notifications for this customer (translations CASCADE from notifications)
      await connection.query('DELETE FROM notifications WHERE user_id = ?', [params.id]);

      // 5. Hard delete customer and user (no archive)
      await connection.query('DELETE FROM customers WHERE id = ?', [params.id]);
      await connection.query('DELETE FROM users WHERE id = ?', [params.id]);

      await connection.commit();
      return successResponse({}, 'Customer deleted successfully', 'error.customerDeletedSuccessfully');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Delete customer error:', error);
    return serverError(error?.message);
  }
}
