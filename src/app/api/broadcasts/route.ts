import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import {
  successResponse,
  validationError,
  serverError,
} from '@/lib/api';
import { sendPushNotification } from '@/lib/fcm';
import { translateToBothLanguages } from '@/lib/translate';

export const dynamic = 'force-dynamic';

type TargetType = 'all' | 'all_employees' | 'all_customers' | 'selected';

/**
 * POST /api/broadcasts
 * Create a broadcast and deliver as notifications to target users
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      message,
      targetType,
      targetUserIds,
      createdBy,
    } = body;

    if (!title || !message || !targetType || !createdBy) {
      return validationError(
        'Title, message, target type, and createdBy are required',
        'error.missingRequiredFields'
      );
    }

    let titleEn = String(title).trim();
    let titleArVal = titleEn;
    let messageEn = String(message).trim();
    let messageArVal = messageEn;
    try {
      const titleTrans = await translateToBothLanguages(titleEn);
      titleEn = titleTrans.en;
      titleArVal = titleTrans.ar;
      const messageTrans = await translateToBothLanguages(messageEn);
      messageEn = messageTrans.en;
      messageArVal = messageTrans.ar;
    } catch (e) {
      console.warn('Broadcast translation failed, using original:', e);
    }

    const validTargetTypes: TargetType[] = [
      'all',
      'all_employees',
      'all_customers',
      'selected',
    ];
    if (!validTargetTypes.includes(targetType)) {
      return validationError(
        'Invalid target type. Use: all, all_employees, all_customers, selected',
        'error.invalidTargetType'
      );
    }

    if (targetType === 'selected' && (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0)) {
      return validationError(
        'Target user IDs are required when target type is selected',
        'error.missingRequiredFields'
      );
    }

    const broadcastId = `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let targetUserIdsResolved: string[] = [];

    if (targetType === 'all') {
      const [rows] = await pool.query(
        `SELECT id FROM users WHERE role IN ('employee', 'customer') AND is_active = TRUE`
      ) as any[];
      targetUserIdsResolved = rows.map((r: any) => r.id);
    } else if (targetType === 'all_employees') {
      const [rows] = await pool.query(
        `SELECT id FROM users WHERE role = 'employee' AND is_active = TRUE`
      ) as any[];
      targetUserIdsResolved = rows.map((r: any) => r.id);
    } else if (targetType === 'all_customers') {
      const [rows] = await pool.query(
        `SELECT id FROM users WHERE role = 'customer' AND is_active = TRUE`
      ) as any[];
      targetUserIdsResolved = rows.map((r: any) => r.id);
    } else {
      targetUserIdsResolved = targetUserIds;
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await connection.query(
        `INSERT INTO broadcasts (id, created_by) VALUES (?, ?)`,
        [broadcastId, createdBy]
      );

      await connection.query(
        `INSERT INTO broadcast_translations (broadcast_id, locale, title, message) VALUES (?, 'en', ?, ?)`,
        [broadcastId, titleEn, messageEn]
      );
      await connection.query(
        `INSERT INTO broadcast_translations (broadcast_id, locale, title, message) VALUES (?, 'ar', ?, ?)`,
        [broadcastId, titleArVal, messageArVal]
      );

      for (const userId of targetUserIdsResolved) {
        const [userRows] = await connection.query(
          `SELECT role FROM users WHERE id = ? AND is_active = TRUE`,
          [userId]
        ) as any[];
        const role = userRows.length > 0 ? userRows[0].role : null;
        if (!role) continue;

        await connection.query(
          `INSERT INTO broadcast_targets (broadcast_id, target_role, target_user_id) VALUES (?, ?, ?)`,
          [broadcastId, role, userId]
        );

        const notificationId = `notification-${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 6)}`;
        await connection.query(
          `INSERT INTO notifications (id, user_id, type, is_read) VALUES (?, ?, 'info', FALSE)`,
          [notificationId, userId]
        );

        await connection.query(
          `INSERT INTO notification_translations (notification_id, locale, title, message) VALUES (?, 'en', ?, ?)`,
          [notificationId, titleEn, messageEn]
        );
        await connection.query(
          `INSERT INTO notification_translations (notification_id, locale, title, message) VALUES (?, 'ar', ?, ?)`,
          [notificationId, titleArVal, messageArVal]
        );
      }

      await connection.commit();
      connection.release();

      // Send push notifications (with translations); do not block response
      Promise.allSettled(
        targetUserIdsResolved.map((uid) =>
          sendPushNotification(uid, titleEn, titleArVal, messageEn, messageArVal)
        )
      ).catch((err) => console.warn('Broadcast push send:', err));

      return successResponse(
        { id: broadcastId, notificationsCreated: targetUserIdsResolved.length },
        'Broadcast sent successfully',
        'broadcast.sentSuccessfully'
      );
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error: any) {
    console.error('Create broadcast error:', error);
    return serverError();
  }
}

/**
 * GET /api/broadcasts
 * List broadcasts (e.g. for admin history)
 */
export async function GET(request: NextRequest) {
  try {
    const createdBy = request.nextUrl.searchParams.get('createdBy');

    const [rows] = await pool.query(
      `SELECT b.id, b.created_by, b.created_at,
        bt_en.title as title_en,
        bt_ar.title as title_ar
      FROM broadcasts b
      LEFT JOIN broadcast_translations bt_en ON b.id = bt_en.broadcast_id AND bt_en.locale = 'en'
      LEFT JOIN broadcast_translations bt_ar ON b.id = bt_ar.broadcast_id AND bt_ar.locale = 'ar'
      ${createdBy ? 'WHERE b.created_by = ?' : ''}
      ORDER BY b.created_at DESC
      LIMIT 100`,
      createdBy ? [createdBy] : []
    ) as any[];

    const broadcasts = rows.map((row: any) => ({
      id: row.id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      title: row.title_en || row.title_ar || '',
    }));

    return successResponse(broadcasts);
  } catch (error: any) {
    console.error('List broadcasts error:', error);
    return serverError();
  }
}
