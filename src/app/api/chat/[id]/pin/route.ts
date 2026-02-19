import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { successResponse, errorResponse, serverError, unauthorizedError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/chat/[id]/pin
 * Toggle pin status of a chat room (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    const authHeader = request.headers.get('authorization');
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

    // Get current pin status
    const [chats] = await pool.query(
      'SELECT is_pinned, created_by FROM chats WHERE id = ?',
      [chatId]
    ) as any[];

    if (chats.length === 0) {
      return errorResponse('Chat not found', 404, 'error.chatNotFound');
    }

    const chat = chats[0];
    const newPinnedStatus = !chat.is_pinned;

    // Update pin status
    await pool.query(
      `UPDATE chats SET is_pinned = ?, pinned_at = ? WHERE id = ?`,
      [newPinnedStatus, newPinnedStatus ? new Date() : null, chatId]
    );

    return successResponse(
      { isPinned: newPinnedStatus },
      newPinnedStatus ? 'Room pinned' : 'Room unpinned',
      newPinnedStatus ? 'chat.roomPinned' : 'chat.roomUnpinned'
    );
  } catch (error: any) {
    console.error('Pin/unpin chat error:', error);
    return serverError();
  }
}
