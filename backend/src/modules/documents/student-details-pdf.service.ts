import fs from 'fs';
import path from 'path';
import { Student, StudentDocument } from '../../models/index.js';
import { generateStudentPdf } from '../pdf/pdf.service.js';
import { resolveWritableUploadsDir } from '../../config/storage.js';
import { watermarkDocumentBuffer, WATERMARK_TEXT } from '../../services/document-watermark.service.js';
import { isValidId, toLocalId, type LocalId } from '../../services/localId.js';

interface WatermarkedFormCopy {
  watermarkedFileUrl: string;
  watermarkStatus: 'applied' | 'unsupported' | 'failed';
  watermarkText: string;
  watermarkAppliedAt?: Date;
}

/**
 * Build a separate watermarked copy of the generated Student Details Form.
 *
 * The form is system-generated, so the "original" here is the unwatermarked
 * PDF generated above; it is kept on disk unchanged and the watermarked copy is
 * what preview/download serve. A watermark failure never fails the sync.
 */
async function buildWatermarkedFormCopy(
  pdfBuffer: Buffer,
  diskFileName: string,
  uploadsDir: string
): Promise<WatermarkedFormCopy> {
  try {
    const result = await watermarkDocumentBuffer(pdfBuffer, 'application/pdf');
    if (result.status !== 'applied' || !result.buffer) {
      return {
        watermarkedFileUrl: '',
        watermarkStatus: result.status,
        watermarkText: '',
      };
    }
    const ext = path.extname(diskFileName);
    const stem = ext ? diskFileName.slice(0, -ext.length) : diskFileName;
    const watermarkedName = `${stem}-watermarked${ext || ''}`;
    fs.writeFileSync(path.join(uploadsDir, watermarkedName), result.buffer);
    return {
      watermarkedFileUrl: `/uploads/documents/${watermarkedName}`,
      watermarkStatus: 'applied',
      watermarkText: WATERMARK_TEXT,
      watermarkAppliedAt: new Date(),
    };
  } catch (err: any) {
    console.error('buildWatermarkedFormCopy error:', err?.message);
    return { watermarkedFileUrl: '', watermarkStatus: 'failed', watermarkText: '' };
  }
}

/**
 * Synchronizes the Student Details Form PDF for a given student.
 * 
 * Rules:
 * 1. Generates the PDF with KSRCE formatting containing Personal Info, Academic Details,
 *    School Details, Parent Details, Mentor Details, and Current Arrears.
 * 2. Saves the file under `uploads/documents/`.
 * 3. Updates or creates a single StudentDocument with `documentType: 'student_details_form'`
 *    and `isPrimary: true`.
 * 4. NEVER creates duplicate records. Replaces/updates existing form PDF in place.
 * 5. NEVER deletes or modifies uploaded student certificates.
 */
export async function syncStudentDetailsPdf(
  studentIdOrRegNo: string | LocalId,
  uploadedByUserId?: string | LocalId
) {
  try {
    let student: any = null;
    if (isValidId(studentIdOrRegNo)) {
      student = await Student.findById(studentIdOrRegNo);
    }
    if (!student && typeof studentIdOrRegNo === 'string') {
      student = await Student.findOne({ registerNumber: studentIdOrRegNo });
    }
    if (!student) {
      console.warn(`[syncStudentDetailsPdf] Student record not found for: ${studentIdOrRegNo}`);
      return null;
    }

    // Generate KSRCE Student Details PDF Buffer
    const pdfBytes = await generateStudentPdf(student._id.toString());

    const UPLOADS_DIR = resolveWritableUploadsDir('documents');

    const safeRegNo = student.registerNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const diskFileName = `Student_Details_Form_${safeRegNo}_${student._id.toString()}.pdf`;
    const diskPath = path.join(UPLOADS_DIR, diskFileName);

    // Save physical PDF file (overwrites existing file if already present)
    fs.writeFileSync(diskPath, Buffer.from(pdfBytes));

    const fileUrl = `/uploads/documents/${diskFileName}`;
    const fileName = 'Student Details Form.pdf';

    const watermark = await buildWatermarkedFormCopy(Buffer.from(pdfBytes), diskFileName, UPLOADS_DIR);

    // Find if primary Student Details Form already exists
    let primaryDoc = await StudentDocument.findOne({
      studentId: student._id,
      $or: [{ isPrimary: true }, { documentType: 'student_details_form' }],
    });

    if (primaryDoc) {
      // Update existing record in place
      primaryDoc.documentType = 'student_details_form';
      primaryDoc.isPrimary = true;
      primaryDoc.fileName = fileName;
      primaryDoc.title = 'Student Details Form';
      primaryDoc.fileUrl = fileUrl;
      primaryDoc.fileType = 'application/pdf';
      primaryDoc.fileSize = pdfBytes.byteLength;
      primaryDoc.watermarkedFileUrl = watermark.watermarkedFileUrl;
      primaryDoc.watermarkStatus = watermark.watermarkStatus;
      primaryDoc.watermarkText = watermark.watermarkText;
      primaryDoc.watermarkAppliedAt = watermark.watermarkAppliedAt;
      primaryDoc.verificationStatus = 'Verified';
      primaryDoc.uploadedAt = new Date();
      if (uploadedByUserId && isValidId(uploadedByUserId)) {
        primaryDoc.uploadedBy = toLocalId(uploadedByUserId);
      }
      await primaryDoc.save();
      return primaryDoc;
    } else {
      // Create new primary document
      primaryDoc = await StudentDocument.create({
        studentId: student._id,
        documentType: 'student_details_form',
        isPrimary: true,
        fileName,
        title: 'Student Details Form',
        category: 'Other',
        fileUrl,
        fileType: 'application/pdf',
        fileSize: pdfBytes.byteLength,
        watermarkedFileUrl: watermark.watermarkedFileUrl,
        watermarkStatus: watermark.watermarkStatus,
        watermarkText: watermark.watermarkText,
        watermarkAppliedAt: watermark.watermarkAppliedAt,
        uploadedBy:
          uploadedByUserId && isValidId(uploadedByUserId)
            ? toLocalId(uploadedByUserId)
            : undefined,
        verificationStatus: 'Verified',
        uploadedAt: new Date(),
      });
      return primaryDoc;
    }
  } catch (err: any) {
    console.error('syncStudentDetailsPdf error:', err);
    return null;
  }
}
