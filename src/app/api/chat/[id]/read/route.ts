import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, validationError, serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/[id]/read
 * Mark a chat as read for the current user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const body = await request.json();
    const { userId } = body;

    if (!chatId) {
      return validationError('Chat ID is required', 'error.chatIdRequired');
    }

    if (!userId) {
      return validationError('User ID is required', 'error.userIdRequired');
    }

    // Verify user is a participant
    const [participants] = await pool.query(
      `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
      [chatId, userId]
    ) as any[];

    if (participants.length === 0) {
      // Admin can mark any chat as read (monitor mode)
      const [user] = await pool.query(`SELECT role FROM users WHERE id = ?`, [userId]) as any[];
      if (user.length === 0 || user[0].role !== 'admin') {
        return errorResponse('Access denied', 403, 'error.accessDenied');
      }
    }

    // Update or insert read status
    await pool.query(
      `INSERT INTO chat_read_status (chat_id, user_id, last_read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_at = NOW(), updated_at = NOW()`,
      [chatId, userId]
    );

    return successResponse({ read: true }, 'Chat marked as read', 'chat.markedAsRead');
  } catch (error: any) {
    console.error('Mark chat as read error:', error);
    return serverError();
  }
}
