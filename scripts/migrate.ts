import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306'),
  });

  try {
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'financial_app';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);

    console.log(`Database ${dbName} created/selected`);

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'employee', 'customer') NOT NULL,
        avatar VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_is_deleted (is_deleted)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add soft-delete columns to users if table already existed (migration).
    // Archiving: is_deleted + deleted_at. Blocking: is_active. Sign-in and /api/auth/me exclude deleted and inactive users.
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE users ADD INDEX idx_is_deleted (is_deleted)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Create password_reset_tokens table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create user_translations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        locale ENUM('en', 'ar') NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_locale (user_id, locale),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create customers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(255) PRIMARY KEY,
        phone VARCHAR(50),
        address TEXT,
        assigned_employee_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_employee_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_assigned_employee (assigned_employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create employees table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(255) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create employee_customer_assignments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_customer_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_assignment (employee_id, customer_id),
        INDEX idx_employee_id (employee_id),
        INDEX idx_customer_id (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create loans table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        employee_id VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        interest_rate DECIMAL(5, 2) NOT NULL,
        number_of_installments INT NOT NULL,
        installment_total DECIMAL(15, 2) NOT NULL,
        start_date DATE NOT NULL,
        status ENUM('under_review', 'approved', 'active', 'rejected', 'closed') NOT NULL DEFAULT 'under_review',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_customer_id (customer_id),
        INDEX idx_employee_id (employee_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create loan_translations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loan_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        loan_id VARCHAR(255) NOT NULL,
        locale ENUM('en', 'ar') NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        UNIQUE KEY unique_loan_locale (loan_id, locale),
        INDEX idx_loan_id (loan_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create chats table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(255) PRIMARY KEY,
        type ENUM('customer_employee', 'internal_room') NOT NULL,
        room_name VARCHAR(255),
        is_pinned BOOLEAN DEFAULT FALSE,
        pinned_at TIMESTAMP NULL,
        created_by VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_is_pinned (is_pinned),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add pinning fields if table exists (migration)
    try {
      await connection.query(`ALTER TABLE chats ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD COLUMN pinned_at TIMESTAMP NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD COLUMN created_by VARCHAR(255) NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD INDEX idx_is_pinned (is_pinned)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEY' && e.code !== 'ER_CANNOT_ADD_FOREIGN') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD COLUMN loan_id VARCHAR(255) NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD INDEX idx_loan_id (loan_id)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chats ADD FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEY' && e.code !== 'ER_CANNOT_ADD_FOREIGN') throw e;
    }

    // Create loan_employees table (many employees per loan for unified chat)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loan_employees (
        loan_id VARCHAR(255) NOT NULL,
        employee_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (loan_id, employee_id),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_loan_id (loan_id),
        INDEX idx_employee_id (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Backfill loan_employees from loans.employee_id
    await connection.query(`
      INSERT IGNORE INTO loan_employees (loan_id, employee_id)
      SELECT id, employee_id FROM loans
    `);

    // Create chat_participants table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_participant (chat_id, user_id),
        INDEX idx_chat_id (chat_id),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create chat_messages table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(255) PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        sender_role ENUM('admin', 'employee', 'customer') NOT NULL,
        file_url VARCHAR(500),
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        is_edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMP NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP NULL,
        original_content TEXT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_chat_id (chat_id),
        INDEX idx_sender_id (sender_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_is_deleted (is_deleted),
        INDEX idx_is_edited (is_edited)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add edit/delete fields if table exists (migration)
    try {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN edited_at TIMESTAMP NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN deleted_at TIMESTAMP NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN original_content TEXT NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD INDEX idx_is_deleted (is_deleted)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE chat_messages ADD INDEX idx_is_edited (is_edited)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Create chat_message_translations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_message_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id VARCHAR(255) NOT NULL,
        locale ENUM('en', 'ar') NOT NULL,
        content TEXT NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
        UNIQUE KEY unique_message_locale (message_id, locale),
        INDEX idx_message_id (message_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create chat_read_status table to track last read timestamp per user per chat
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_read_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_chat_user (chat_id, user_id),
        INDEX idx_chat_id (chat_id),
        INDEX idx_user_id (user_id),
        INDEX idx_last_read_at (last_read_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create notifications table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        type ENUM('info', 'success', 'warning', 'error') NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        reference_id VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at),
        INDEX idx_reference_id (reference_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
      await connection.query(`ALTER TABLE notifications ADD COLUMN reference_id VARCHAR(255) NULL`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }
    try {
      await connection.query(`ALTER TABLE notifications ADD INDEX idx_reference_id (reference_id)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Create notification_translations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id VARCHAR(255) NOT NULL,
        locale ENUM('en', 'ar') NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        UNIQUE KEY unique_notification_locale (notification_id, locale),
        INDEX idx_notification_id (notification_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create broadcasts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id VARCHAR(255) PRIMARY KEY,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create broadcast_targets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS broadcast_targets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        broadcast_id VARCHAR(255) NOT NULL,
        target_role ENUM('admin', 'employee', 'customer'),
        target_user_id VARCHAR(255),
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE,
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_broadcast_id (broadcast_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create broadcast_translations table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS broadcast_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        broadcast_id VARCHAR(255) NOT NULL,
        locale ENUM('en', 'ar') NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_broadcast_locale (broadcast_id, locale),
        INDEX idx_broadcast_id (broadcast_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create internal_rooms table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS internal_rooms (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create internal_room_members table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS internal_room_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES internal_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_member (room_id, user_id),
        INDEX idx_room_id (room_id),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create user_fcm_tokens table for push notifications (FCM tokens ~152 chars)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_fcm_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        device_label VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_token (user_id, token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('All tables created successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });
