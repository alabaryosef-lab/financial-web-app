import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { saveNotificationTranslations } from '@/lib/translations';
import { successResponse, errorResponse, validationError, serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const locale = request.nextUrl.searchParams.get('locale') || '';

    if (!userId) {
      return errorResponse('User ID is required', 400, 'error.userIdRequired');
    }

    const [rows] = await pool.query(
      `SELECT n.*,
        nt_en.title as title_en,
        nt_en.message as message_en,
        nt_ar.title as title_ar,
        nt_ar.message as message_ar
      FROM notifications n
      LEFT JOIN notification_translations nt_en ON n.id = nt_en.notification_id AND nt_en.locale = 'en'
      LEFT JOIN notification_translations nt_ar ON n.id = nt_ar.notification_id AND nt_ar.locale = 'ar'
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50`,
      [userId]
    ) as any[];

    const notifications = rows.map((row: any) => {
      const title =
        locale === 'ar'
          ? (row.title_ar || row.title_en || '')
          : locale === 'en'
            ? (row.title_en || row.title_ar || '')
            : (row.title_en || row.title_ar || '');
      const message =
        locale === 'ar'
          ? (row.message_ar || row.message_en || '')
          : locale === 'en'
            ? (row.message_en || row.message_ar || '')
            : (row.message_en || row.message_ar || '');
      return {
        id: row.id,
        userId: row.user_id,
        title,
        message,
        type: row.type,
        isRead: row.is_read,
        createdAt: row.created_at,
      };
    });

    return successResponse(notifications);
  } catch (error: any) {
    console.error('Get notifications error:', error?.message || error);
    return successResponse([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, type, titleAr, messageAr } = body;

    if (!userId || !title || !message || !type) {
      return validationError('Missing required fields', 'error.missingRequiredFields');
    }

    const notificationId = `notification-${Date.now()}`;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create notification
      await connection.query(
        `INSERT INTO notifications (id, user_id, type, is_read) VALUES (?, ?, ?, FALSE)`,
        [notificationId, userId, type]
      );

      // Save translations
      await saveNotificationTranslations(
        notificationId,
        title,
        message,
        titleAr || title,
        messageAr || message
      );

      await connection.commit();

      return successResponse({ id: notificationId }, 'Notification created successfully', 'error.notificationCreatedSuccessfully');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Create notification error:', error);
    return serverError();
  }
}
