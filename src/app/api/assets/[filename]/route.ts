import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { errorResponse, notFoundError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/assets/[filename]
 * Serve uploaded files from public/assets directory
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> | { filename: string } }
) {
  try {
    // Handle both sync and async params (Next.js 13+)
    const resolvedParams = await Promise.resolve(params);
    const filename = resolvedParams.filename;
    
    if (!filename) {
      return errorResponse('Filename is required', 400, 'error.invalidFilename');
    }
    
    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return errorResponse('Invalid filename', 400, 'error.invalidFilename');
    }

    const filePath = path.join(process.cwd(), 'public', 'assets', filename);
    
    try {
      const fileBuffer = await readFile(filePath);
      
      // Determine content type from extension
      const ext = path.extname(filename).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error: any) {
      console.error('File read error:', error?.code, error?.message, filePath);
      if (error.code === 'ENOENT') {
        return notFoundError('File');
      }
      throw error;
    }
  } catch (error: any) {
    console.error('File serve error:', error?.code, error?.message, error?.stack);
    return errorResponse(`Failed to serve file: ${error?.message || 'Unknown error'}`, 500, 'error.fileServeError');
  }
}
