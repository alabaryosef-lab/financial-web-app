import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, unauthorizedError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/chat/[id]
 * Delete a chat room (admin only, creator only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return errorResponse('User ID is required', 400, 'error.userIdRequired');
    }

    // Check if user is admin
    const [users] = await pool.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    ) as any[];

    if (users.length === 0 || users[0].role !== 'admin') {
      return unauthorizedError();
    }

    // Get chat and check if user created it
    const [chats] = await pool.query(
      'SELECT created_by, type FROM chats WHERE id = ?',
      [chatId]
    ) as any[];

    if (chats.length === 0) {
      return errorResponse('Chat not found', 404, 'error.chatNotFound');
    }

    const chat = chats[0];

    // Only allow deletion of internal rooms created by this admin
    if (chat.type !== 'internal_room') {
      return errorResponse('Only internal rooms can be deleted', 400, 'error.cannotDeleteChatType');
    }

    if (chat.created_by !== userId) {
      return errorResponse('Only the room creator can delete it', 403, 'error.onlyCreatorCanDelete');
    }

    // Delete chat (cascade will handle messages, participants, translations)
    await pool.query('DELETE FROM chats WHERE id = ?', [chatId]);

    return successResponse(
      { deleted: true },
      'Room deleted successfully',
      'chat.roomDeleted'
    );
  } catch (error: any) {
    console.error('Delete chat error:', error);
    return serverError();
  }
}
