import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, validationError, errorResponse, serverError } from '@/lib/api';
import { wsSendToUsers } from '@/lib/ws-broadcast';

/**
 * POST /api/chat/create-room
 * Admin creates a group internal room with multiple employees.
 * Body: { roomName: string, employeeIds: string[], adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomName, employeeIds, adminId } = body;

    if (!roomName || !Array.isArray(employeeIds) || employeeIds.length === 0 || !adminId) {
      return validationError('roomName, employeeIds array, and adminId are required', 'error.missingRequiredFields');
    }

    // Verify all employeeIds are valid employees
    const placeholders = employeeIds.map(() => '?').join(',');
    const [employees] = await pool.query(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND role = 'employee'`,
      employeeIds
    ) as any[];

    if (employees.length !== employeeIds.length) {
      return errorResponse('One or more employee IDs are invalid', 400, 'error.invalidEmployeeIds');
    }

    const chatId = `chat-room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `INSERT INTO chats (id, type, room_name, created_by) VALUES (?, 'internal_room', ?, ?)`,
      [chatId, roomName, adminId]
    );

    // Add admin and all employees as participants
    const participants = [adminId, ...employeeIds];
    const values = participants.map(() => '(?, ?)').join(', ');
    const params = participants.flatMap((id) => [chatId, id]);
    await pool.query(
      `INSERT INTO chat_participants (chat_id, user_id) VALUES ${values}`,
      params
    );

    const [created] = await pool.query(
      `SELECT id, type, room_name, is_pinned, pinned_at, created_by, created_at, updated_at FROM chats WHERE id = ?`,
      [chatId]
    ) as any[];
    const c = created[0];

    const chatData = {
      id: c.id,
      type: c.type,
      roomName: c.room_name,
      isPinned: Boolean(c.is_pinned),
      pinnedAt: c.pinned_at || null,
      createdBy: c.created_by || null,
      lastMessage: undefined,
      unreadCount: 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };

    wsSendToUsers(participants, { type: 'chat:list-update', data: { action: 'create', chatId } });

    return successResponse(chatData);
  } catch (error: any) {
    console.error('Create room error:', error);
    return serverError();
  }
}
