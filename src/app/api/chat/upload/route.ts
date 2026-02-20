import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { successResponse, validationError, serverError } from '@/lib/api';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return validationError('File is required', 'error.missingRequiredFields');
    }
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|gif|webp|docx)$/i)) {
      return validationError('Allowed: PDF, images (jpg, png, gif, webp), DOCX', 'error.invalidFileType');
    }
    if (file.size > MAX_SIZE) {
      return validationError('File too large (max 10MB)', 'error.fileTooLarge');
    }

    const assetsDir = path.join(process.cwd(), 'public', 'assets');
    await mkdir(assetsDir, { recursive: true });
    const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.bin');
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const fileName = `${baseName}-${Date.now()}${ext}`;
    const filePath = path.join(assetsDir, fileName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));
    
    // Set file permissions (readable by all, writable by owner)
    try {
      const { chmod } = await import('fs/promises');
      await chmod(filePath, 0o644);
    } catch (permError) {
      console.warn('Failed to set file permissions:', permError);
      // Continue anyway - file is written
    }

    // Use API route for file serving to ensure proper access
    const fileUrl = `/api/assets/${fileName}`;
    return successResponse({
      fileUrl,
      fileName: file.name,
      fileType: file.type,
    });
  } catch (error: unknown) {
    console.error('Chat upload error:', error);
    return serverError();
  }
}
