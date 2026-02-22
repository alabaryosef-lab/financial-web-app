import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, validationError, errorResponse, serverError } from '@/lib/api';

/**
 * POST /api/chat/with-customer
 * Employee initiates: get or create the 1:1 customer_employee chat with an assigned customer.
 * Body: { employeeId: string, customerId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, customerId } = body;

    if (!employeeId || !customerId) {
      return validationError('employeeId and customerId are required', 'error.missingRequiredFields');
    }

    // Verify customer is assigned to this employee
    const [assign] = await pool.query(
      `SELECT 1 FROM employee_customer_assignments WHERE employee_id = ? AND customer_id = ?`,
      [employeeId, customerId]
    ) as any[];

    if (assign.length === 0) {
      return errorResponse('Customer is not assigned to this employee', 403, 'chat.customerNotAssigned');
    }

    // Prefer unified loan chat: if there is a loan for this customer that includes this employee, use that chat
    const [loanChat] = await pool.query(
      `SELECT c.id FROM chats c
       INNER JOIN chat_participants cp_c ON c.id = cp_c.chat_id AND cp_c.user_id = ?
       INNER JOIN chat_participants cp_e ON c.id = cp_e.chat_id AND cp_e.user_id = ?
       WHERE c.type = 'customer_employee' AND c.loan_id IS NOT NULL
       LIMIT 1`,
      [customerId, employeeId]
    ) as any[];
    if (loanChat.length > 0) {
      const [chatRow] = await pool.query(
        `SELECT id, type, room_name, created_at, updated_at FROM chats WHERE id = ?`,
        [loanChat[0].id]
      ) as any[];
      const c = chatRow[0];
      return successResponse({
        id: c.id,
        type: c.type,
        roomName: c.room_name,
        lastMessage: undefined,
        unreadCount: 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      });
    }

    // Find existing customer_employee chat (non-loan)
    const [existing] = await pool.query(
      `SELECT c.id
       FROM chats c
       INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
       INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
       WHERE c.type = 'customer_employee' AND (c.loan_id IS NULL OR c.loan_id = '')`,
      [employeeId, customerId]
    ) as any[];

    if (existing.length > 0) {
      const chatId = existing[0].id;
      const [chatRow] = await pool.query(
        `SELECT id, type, room_name, created_at, updated_at FROM chats WHERE id = ?`,
        [chatId]
      ) as any[];
      const c = chatRow[0];
      return successResponse({
        id: c.id,
        type: c.type,
        roomName: c.room_name,
        lastMessage: undefined,
        unreadCount: 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      });
    }

    // Create new customer_employee chat
    const chatId = `chat-ce-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `INSERT INTO chats (id, type) VALUES (?, 'customer_employee')`,
      [chatId]
    );
    await pool.query(
      `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)`,
      [chatId, employeeId, chatId, customerId]
    );

    const [created] = await pool.query(
      `SELECT id, type, room_name, created_at, updated_at FROM chats WHERE id = ?`,
      [chatId]
    ) as any[];
    const c = created[0];

    return successResponse({
      id: c.id,
      type: c.type,
      roomName: c.room_name,
      lastMessage: undefined,
      unreadCount: 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error: any) {
    console.error('Chat with customer error:', error);
    return serverError();
  }
}
