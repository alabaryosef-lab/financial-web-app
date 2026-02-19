import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { saveLoanNotesTranslations } from '@/lib/translations';
import { translateToBothLanguages } from '@/lib/translate';
import { successResponse, errorResponse, notFoundError, serverError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'en';

    const [rows] = await pool.query(
      `SELECT l.*,
        lt_en.notes as notes_en,
        lt_ar.notes as notes_ar
      FROM loans l
      LEFT JOIN loan_translations lt_en ON l.id = lt_en.loan_id AND lt_en.locale = 'en'
      LEFT JOIN loan_translations lt_ar ON l.id = lt_ar.loan_id AND lt_ar.locale = 'ar'
      WHERE l.id = ?`,
      [params.id]
    ) as any[];

    if (rows.length === 0) {
      return notFoundError('Loan');
    }

    const loan = rows[0];
    const notes = locale === 'ar' ? (loan.notes_ar || loan.notes_en || null) : (loan.notes_en || loan.notes_ar || null);
    const startDateVal = loan.start_date ? String(loan.start_date).slice(0, 10) : loan.start_date;
    const loanData = {
      id: loan.id,
      customerId: loan.customer_id,
      employeeId: loan.employee_id,
      amount: parseFloat(loan.amount),
      interestRate: parseFloat(loan.interest_rate),
      numberOfInstallments: loan.number_of_installments,
      installmentTotal: parseFloat(loan.installment_total),
      startDate: startDateVal,
      status: loan.status,
      notes,
      createdAt: loan.created_at,
      updatedAt: loan.updated_at,
    };

    return successResponse(loanData);
  } catch (error: any) {
    console.error('Get loan error:', error);
    return serverError();
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    console.log('[Loans API] PUT request body:', body);
    
    const {
      amount,
      interestRate,
      numberOfInstallments,
      installmentTotal,
      startDate,
      status,
      notes,
    } = body;

    // Check if loan exists
    const [existing] = await pool.query(
      'SELECT id FROM loans WHERE id = ?',
      [params.id]
    ) as any[];

    if (existing.length === 0) {
      return notFoundError('Loan');
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update loan - convert strings to numbers and validate
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (amount !== undefined && amount !== null && amount !== '') {
        const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (!isNaN(amountNum) && amountNum > 0) {
          updateFields.push('amount = ?');
          updateValues.push(amountNum);
        }
      }
      if (interestRate !== undefined && interestRate !== null && interestRate !== '') {
        const interestRateNum = typeof interestRate === 'string' ? parseFloat(interestRate) : interestRate;
        if (!isNaN(interestRateNum) && interestRateNum >= 0) {
          updateFields.push('interest_rate = ?');
          updateValues.push(interestRateNum);
        }
      }
      if (numberOfInstallments !== undefined && numberOfInstallments !== null && numberOfInstallments !== '') {
        const numberOfInstallmentsNum = typeof numberOfInstallments === 'string' ? parseInt(numberOfInstallments, 10) : numberOfInstallments;
        if (!isNaN(numberOfInstallmentsNum) && numberOfInstallmentsNum > 0) {
          updateFields.push('number_of_installments = ?');
          updateValues.push(numberOfInstallmentsNum);
        }
      }
      if (installmentTotal !== undefined && installmentTotal !== null && installmentTotal !== '') {
        const installmentTotalNum = typeof installmentTotal === 'string' ? parseFloat(installmentTotal) : installmentTotal;
        if (!isNaN(installmentTotalNum) && installmentTotalNum > 0) {
          updateFields.push('installment_total = ?');
          updateValues.push(installmentTotalNum);
        }
      }
      if (startDate !== undefined && startDate !== null && startDate !== '') {
        const startDateNorm = typeof startDate === 'string' && startDate.length >= 10 ? startDate.slice(0, 10) : String(startDate);
        updateFields.push('start_date = ?');
        updateValues.push(startDateNorm);
      }
      if (status !== undefined && status !== null && status !== '') {
        updateFields.push('status = ?');
        updateValues.push(status);
      }
      
      console.log('[Loans API] Update fields:', updateFields, 'Values:', updateValues);

      if (updateFields.length > 0) {
        updateValues.push(params.id);
        await connection.query(
          `UPDATE loans SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('[Loans API] Transaction error:', error);
      throw error;
    } finally {
      connection.release();
    }

    // Notes use pool - run after commit so update is visible
    if (notes !== undefined) {
      try {
        if (notes != null && String(notes).trim() !== '') {
          let notesEn = String(notes);
          let notesAr = String(notes);
          try {
            const translated = await translateToBothLanguages(notesEn);
            notesEn = translated.en;
            notesAr = translated.ar;
          } catch (e) {
            console.warn('Loan notes translation failed, using original:', e);
          }
          await saveLoanNotesTranslations(params.id, notesEn, notesAr);
        } else {
          await saveLoanNotesTranslations(params.id, '', '');
        }
      } catch (notesErr: any) {
        console.warn('[Loans API] Notes update failed:', notesErr?.message || notesErr);
      }
    }

    // Return updated loan
    const [rows] = await pool.query(
      `SELECT l.*,
        lt_en.notes as notes_en,
        lt_ar.notes as notes_ar
      FROM loans l
      LEFT JOIN loan_translations lt_en ON l.id = lt_en.loan_id AND lt_en.locale = 'en'
      LEFT JOIN loan_translations lt_ar ON l.id = lt_ar.loan_id AND lt_ar.locale = 'ar'
      WHERE l.id = ?`,
      [params.id]
    ) as any[];

    const loan = rows[0];
    const notesOut = loan.notes_en || loan.notes_ar || null;
    const startDateOut = loan.start_date ? String(loan.start_date).slice(0, 10) : loan.start_date;
    const loanData = {
      id: loan.id,
      customerId: loan.customer_id,
      employeeId: loan.employee_id,
      amount: parseFloat(loan.amount),
      interestRate: parseFloat(loan.interest_rate),
      numberOfInstallments: loan.number_of_installments,
      installmentTotal: parseFloat(loan.installment_total),
      startDate: startDateOut,
      status: loan.status,
      notes: notesOut,
      createdAt: loan.created_at,
      updatedAt: loan.updated_at,
    };

    return successResponse(loanData, 'Loan updated successfully', 'error.loanUpdatedSuccessfully');
  } catch (error: any) {
    console.error('[Loans API] Update loan error:', error);
    console.error('[Loans API] Error stack:', error?.stack);
    return serverError(error?.message || 'Failed to update loan');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if loan exists
    const [existing] = await pool.query(
      'SELECT id FROM loans WHERE id = ?',
      [params.id]
    ) as any[];

    if (existing.length === 0) {
      return notFoundError('Loan');
    }

    await pool.query('DELETE FROM loans WHERE id = ?', [params.id]);

    return successResponse({}, 'Loan deleted successfully', 'error.loanDeletedSuccessfully');
  } catch (error: any) {
    console.error('Delete loan error:', error);
    return serverError();
  }
}
