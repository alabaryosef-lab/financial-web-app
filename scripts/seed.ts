/**
 * Full database seed: admin, employees, customers, assignments, loans,
 * unified customer chats (customer + admins + assigned employees), internal chat rooms.
 * Run after migrate: npm run db:migrate && npm run db:seed
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function seed() {
  const { default: pool } = await import('../src/lib/db');
  const { hashPassword } = await import('../src/lib/auth');
  const { saveUserNameTranslations, saveLoanNotesTranslations } = await import('../src/lib/translations');
  const { syncCustomerUnifiedChat } = await import('../src/lib/customer-chat');

  const connection = await pool.getConnection();

  try {
    // --- Admin ---
    const adminId = 'admin-1';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@khalijtamweel.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin@Khalijtamweel123';
    const [existingAdmin] = await connection.query('SELECT id FROM users WHERE email = ?', [adminEmail]) as any[];
    if (existingAdmin.length === 0) {
      const passwordHash = await hashPassword(adminPassword);
      await connection.query(
        `INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', TRUE)`,
        [adminId, adminEmail, passwordHash]
      );
      await saveUserNameTranslations(adminId, 'Alkhalij for Finance', 'الخليج للتمويل');
      console.log('Admin created:', adminEmail);
    } else {
      console.log('Admin already exists:', adminEmail);
    }

    // --- Employees ---
    const employees = [
      { id: 'employee-1', email: 'john@demo.com', nameEn: 'John Employee', nameAr: 'جون موظف' },
      { id: 'employee-2', email: 'sarah@demo.com', nameEn: 'Sarah Employee', nameAr: 'سارة موظفة' },
    ];
    for (const e of employees) {
      const [ex] = await connection.query('SELECT id FROM users WHERE id = ?', [e.id]) as any[];
      if (ex.length === 0) {
        const hash = await hashPassword('employee123');
        await connection.query(
          `INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'employee', TRUE)`,
          [e.id, e.email, hash]
        );
        await connection.query(`INSERT INTO employees (id) VALUES (?)`, [e.id]);
        await saveUserNameTranslations(e.id, e.nameEn, e.nameAr);
        console.log('Employee created:', e.email);
      }
    }

    // --- Customers ---
    const customers = [
      { id: 'customer-1', email: 'ahmed@demo.com', nameEn: 'Ahmed Customer', nameAr: 'أحمد عميل', phone: '+966501234567' },
      { id: 'customer-2', email: 'fatima@demo.com', nameEn: 'Fatima Customer', nameAr: 'فاطمة عميلة', phone: '+966509876543' },
      { id: 'customer-3', email: 'mohammed@demo.com', nameEn: 'Mohammed Customer', nameAr: 'محمد عميل', phone: null },
    ];
    for (const c of customers) {
      const [ex] = await connection.query('SELECT id FROM users WHERE id = ?', [c.id]) as any[];
      if (ex.length === 0) {
        const hash = await hashPassword('customer123');
        await connection.query(
          `INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'customer', TRUE)`,
          [c.id, c.email, hash]
        );
        await connection.query(
          `INSERT INTO customers (id, phone, address, assigned_employee_id) VALUES (?, ?, NULL, NULL)`,
          [c.id, c.phone || '']
        );
        await saveUserNameTranslations(c.id, c.nameEn, c.nameAr);
        console.log('Customer created:', c.email);
      }
    }

    // --- Assignments: employee-1 -> customer-1, customer-2; employee-2 -> customer-3 ---
    await connection.query(
      `UPDATE customers SET assigned_employee_id = ? WHERE id IN (?, ?)`,
      ['employee-1', 'customer-1', 'customer-2']
    );
    await connection.query(
      `UPDATE customers SET assigned_employee_id = ? WHERE id = ?`,
      ['employee-2', 'customer-3']
    );
    await connection.query(
      `INSERT IGNORE INTO employee_customer_assignments (employee_id, customer_id) VALUES 
       ('employee-1', 'customer-1'), ('employee-1', 'customer-2'), ('employee-2', 'customer-3')`
    );
    console.log('Assignments set');

    // --- Unified customer chats (one per customer: customer + admins + assigned employees) ---
    for (const c of customers) {
      const [ex] = await connection.query('SELECT id FROM users WHERE id = ?', [c.id]) as any[];
      if (ex.length > 0) {
        await syncCustomerUnifiedChat(c.id);
      }
    }
    console.log('Unified customer chats synced');

    // --- Loans ---
    const loans = [
      { id: 'loan-1', customerId: 'customer-1', employeeId: 'employee-1', amount: 50000, rate: 5, installments: 12, startDate: '2024-01-15', status: 'active', notesEn: 'Monthly payment plan', notesAr: 'خطة الدفع الشهرية' },
      { id: 'loan-2', customerId: 'customer-2', employeeId: 'employee-1', amount: 25000, rate: 4, installments: 6, startDate: '2024-03-01', status: 'under_review', notesEn: 'Pending activation', notesAr: 'في انتظار التفعيل' },
      { id: 'loan-3', customerId: 'customer-3', employeeId: 'employee-2', amount: 75000, rate: 6, installments: 24, startDate: '2024-02-01', status: 'approved', notesEn: 'Documentation review', notesAr: 'مراجعة الوثائق' },
    ];
    for (const l of loans) {
      const [ex] = await connection.query('SELECT id FROM loans WHERE id = ?', [l.id]) as any[];
      if (ex.length === 0) {
        const installmentTotal = Math.round(l.amount * (1 + l.rate / 100) * 100) / 100;
        await connection.query(
          `INSERT INTO loans (id, customer_id, employee_id, amount, interest_rate, number_of_installments, installment_total, start_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [l.id, l.customerId, l.employeeId, l.amount, l.rate, l.installments, installmentTotal, l.startDate, l.status]
        );
        await saveLoanNotesTranslations(l.id, l.notesEn, l.notesAr);
        console.log('Loan created:', l.id);
      }
    }

    // --- Internal chat rooms (Contracts, Follow Up, Receipts) with employees ---
    const rooms = [
      { id: 'room-contracts', name: 'Contracts' },
      { id: 'room-followup', name: 'Follow Up' },
      { id: 'room-receipts', name: 'Receipts' },
    ];
    for (const r of rooms) {
      const [exChat] = await connection.query('SELECT id FROM chats WHERE id = ?', [r.id]) as any[];
      if (exChat.length === 0) {
        await connection.query(
          `INSERT INTO chats (id, type, room_name) VALUES (?, 'internal_room', ?)`,
          [r.id, r.name]
        );
        await connection.query(
          `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, 'employee-1'), (?, 'employee-2')`,
          [r.id, r.id]
        );
        console.log('Internal room created:', r.name);
      }
    }

    const adminEmailFinal = process.env.ADMIN_EMAIL || 'admin@khalijtamweel.com';
    console.log('\nSeed completed. Admin login:', adminEmailFinal, '(password from ADMIN_PASSWORD)');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
