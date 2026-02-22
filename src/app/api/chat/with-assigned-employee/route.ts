import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, validationError, errorResponse, serverError } from '@/lib/api';

/**
 * POST /api/chat/with-assigned-employee
 * Customer initiates: get or create the 1:1 customer_employee chat with their assigned employee.
 * Body: { customerId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId } = body;

    if (!customerId) {
      return validationError('customerId is required', 'error.missingRequiredFields');
    }

    const [cust] = await pool.query(
      `SELECT assigned_employee_id FROM customers WHERE id = ?`,
      [customerId]
    ) as any[];

    if (cust.length === 0) {
      return errorResponse('Customer not found', 404, 'error.customerNotFound');
    }

    const assignedEmployeeId = cust[0].assigned_employee_id;
    if (!assignedEmployeeId) {
      return errorResponse('No employee assigned to this customer', 403, 'chat.noEmployeeAssigned');
    }

    // Prefer unified loan chat: if customer has a loan, use that loan's chat
    const [loanRow] = await pool.query(
      `SELECT id FROM loans WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
      [customerId]
    ) as any[];
    if (loanRow.length > 0) {
      const [loanChat] = await pool.query(
        `SELECT id FROM chats WHERE loan_id = ? LIMIT 1`,
        [loanRow[0].id]
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
    }

    // Find existing customer_employee chat between this customer and assigned employee
    const [existing] = await pool.query(
      `SELECT c.id
       FROM chats c
       INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
       INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
       WHERE c.type = 'customer_employee' AND (c.loan_id IS NULL OR c.loan_id = '')`,
      [customerId, assignedEmployeeId]
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
      [chatId, customerId, chatId, assignedEmployeeId]
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
    console.error('Chat with assigned employee error:', error);
    return serverError();
  }
}
