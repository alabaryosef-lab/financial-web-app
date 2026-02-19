import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function seedAdmin() {
  const { default: pool } = await import('../src/lib/db');
  const { hashPassword } = await import('../src/lib/auth');
  const { saveUserNameTranslations } = await import('../src/lib/translations');

  try {
    const adminId = 'admin-1';
    const email = process.env.ADMIN_EMAIL || 'admin@khalijtamweel.com';
    const password = process.env.ADMIN_PASSWORD || 'admin@Khalijtamweel123';
    const nameEn = 'Khalijtamweel';
    const nameAr = 'خليج تمويل';

    // Check if admin already exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (existing.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', TRUE)`,
      [adminId, email, passwordHash]
    );

    // Save translations
    await saveUserNameTranslations(adminId, nameEn, nameAr);

    console.log('Admin user created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (error) {
    console.error('Failed to seed admin user:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedAdmin()
  .then(() => {
    console.log('Admin seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Admin seeding error:', error);
    process.exit(1);
  });
