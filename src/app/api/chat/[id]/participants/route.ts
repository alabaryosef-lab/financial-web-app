import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, validationError } from '@/lib/api';

/**
 * POST /api/chat/[id]/participants
 * Add a participant to a chat. For loan chats, if the user is an employee, also add them to loan_employees (assigned employees on loan).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    if (!chatId) return errorResponse('Chat ID is required', 400, 'error.chatIdRequired');
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || body.participantId;
    if (!userId) return validationError('userId or participantId is required', 'error.missingRequiredFields');

    const [chatRows] = await pool.query(
      'SELECT id, type, loan_id FROM chats WHERE id = ?',
      [chatId]
    ) as any[];
    if (chatRows.length === 0) return errorResponse('Chat not found', 404, 'error.chatNotFound');
    const chat = chatRows[0];

    const [userRows] = await pool.query(
      'SELECT id, role FROM users WHERE id = ?',
      [userId]
    ) as any[];
    if (userRows.length === 0) return errorResponse('User not found', 404, 'error.userNotFound');

    const connection = await pool.getConnection();
    try {
      await connection.query(
        'INSERT IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
        [chatId, userId]
      );
      if (chat.loan_id) {
        const [loanRows] = await connection.query(
          'SELECT id, customer_id FROM loans WHERE id = ?',
          [chat.loan_id]
        ) as any[];
        if (loanRows.length > 0 && userRows[0].role === 'employee') {
          const loanId = chat.loan_id;
          const customerId = loanRows[0].customer_id;
          await connection.query(
            'INSERT IGNORE INTO loan_employees (loan_id, employee_id) VALUES (?, ?)',
            [loanId, userId]
          );
          await connection.query(
            'INSERT IGNORE INTO employee_customer_assignments (employee_id, customer_id) VALUES (?, ?)',
            [userId, customerId]
          );
        }
      }
      connection.release();
    } catch (e) {
      connection.release();
      throw e;
    }

    return successResponse({ added: true });
  } catch (error: any) {
    console.error('Add participant error:', error);
    return serverError();
  }
}

/**
 * GET /api/chat/[id]/participants
 * Get list of participant user IDs for a chat.
 * For loan chats: participants = customer + loan_employees (assigned employees on loan = chat team; same list).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;

    if (!chatId) {
      return errorResponse('Chat ID is required', 400, 'error.chatIdRequired');
    }

    const [chatRows] = await pool.query(
      'SELECT id, type, loan_id FROM chats WHERE id = ?',
      [chatId]
    ) as any[];

    if (chatRows.length === 0) {
      return errorResponse('Chat not found', 404, 'error.chatNotFound');
    }

    const chat = chatRows[0];
    let participantIds: string[];

    if (chat.loan_id) {
      const [loanRows] = await pool.query(
        'SELECT customer_id FROM loans WHERE id = ?',
        [chat.loan_id]
      ) as any[];
      if (loanRows.length === 0) {
        const [legacy] = await pool.query(
          'SELECT user_id FROM chat_participants WHERE chat_id = ?',
          [chatId]
        ) as any[];
        participantIds = legacy.map((p: any) => p.user_id);
      } else {
        const customerId = loanRows[0].customer_id;
        const [empRows] = await pool.query(
          'SELECT employee_id FROM loan_employees WHERE loan_id = ? ORDER BY employee_id',
          [chat.loan_id]
        ) as any[];
        const employeeIds = empRows.map((r: any) => r.employee_id);
        participantIds = [customerId, ...employeeIds];
        await pool.query('DELETE FROM chat_participants WHERE chat_id = ?', [chatId]);
        for (const uid of participantIds) {
          await pool.query(
            'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
            [chatId, uid]
          );
        }
      }
    } else {
      const [participants] = await pool.query(
        'SELECT user_id FROM chat_participants WHERE chat_id = ?',
        [chatId]
      ) as any[];
      participantIds = participants.map((p: any) => p.user_id);
    }

    return successResponse(participantIds);
  } catch (error: any) {
    console.error('Get participants error:', error);
    return serverError();
  }
}
