import { ApiError } from './utils.js'

/** ตรวจ header ของไฟล์จริง ไม่เชื่อเฉพาะนามสกุลที่Senderส่งมา */
const startsWith = (buffer, ...bytes) => bytes.every((b, i) => buffer[i] === b)

export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const OLE_EXT = new Set(['.doc', '.xls', '.ppt'])
const ZIP_EXT = new Set(['.zip', '.docx', '.xlsx', '.pptx'])
const TEXT_EXT = new Set(['.txt', '.csv'])

const MIME_BY_EXT = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'text/plain', 'application/csv'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
}

/** MIME ที่ browser ส่งมาใช้เป็นเบาะแสเพิ่มเติมเท่านั้น (ยังต้องตรวจ magic byte เสมอ) */
export function assertMimeForExt(ext, mimetype) {
  const mime = String(mimetype || '').toLowerCase()
  if (!mime || mime === 'application/octet-stream') return
  const allowed = MIME_BY_EXT[ext]
  if (allowed && !allowed.includes(mime)) {
    throw new ApiError(400, 'ประเภทไฟล์ไม่ตรงกับนามสกุล กรุณาตรวจสอบไฟล์ที่อัปโหลด')
  }
}

/** ตรวจว่า buffer เป็นรูปภาพจริงตามนามสกุล (ใช้ร่วมกับ avatar และไฟล์แนบ) */
export function assertRealImage(buffer, ext) {
  if (!buffer?.length) throw new ApiError(400, 'ไฟล์ที่อัปโหลดไม่ใช่รูปภาพที่ถูกต้อง')
  const valid =
    ext === '.png' ? startsWith(buffer, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) :
    (ext === '.jpg' || ext === '.jpeg') ? startsWith(buffer, 0xff, 0xd8, 0xff) :
    ext === '.gif' ? startsWith(buffer, 0x47, 0x49, 0x46, 0x38) :
    ext === '.webp' ? (startsWith(buffer, 0x52, 0x49, 0x46, 0x46) && buffer.toString('ascii', 8, 12) === 'WEBP') :
    false
  if (!valid) throw new ApiError(400, 'ไฟล์ที่อัปโหลดไม่ใช่รูปภาพที่ถูกต้อง')
}

/** ตรวจไฟล์แนบงาน: รองรับ PDF, Word/Excel/PPT ทั้งแบบเก่าและแบบใหม่, รูปภาพ, ZIP, TXT/CSV */
export function assertUploadedFile(buffer, ext, mimetype) {
  if (!buffer?.length) throw new ApiError(400, 'ไฟล์ที่อัปโหลดว่างเปล่า')
  assertMimeForExt(ext, mimetype)

  if (IMAGE_EXT.has(ext)) return assertRealImage(buffer, ext)

  if (ext === '.pdf') {
    if (!startsWith(buffer, 0x25, 0x50, 0x44, 0x46, 0x2d)) // %PDF-
      throw new ApiError(400, 'ไฟล์ PDF ไม่ถูกต้อง')
    return
  }
  if (ZIP_EXT.has(ext)) {
    const zip = startsWith(buffer, 0x50, 0x4b) && [0x03, 0x05, 0x07].includes(buffer[2])
    if (!zip) throw new ApiError(400, `ไฟล์ ${ext.toUpperCase()} ไม่ถูกต้อง`)
    return
  }
  if (OLE_EXT.has(ext)) {
    if (!startsWith(buffer, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
      throw new ApiError(400, `ไฟล์ ${ext.toUpperCase()} ไม่ถูกต้อง`)
    return
  }
  if (TEXT_EXT.has(ext)) {
    if (buffer.includes(0)) throw new ApiError(400, 'ไฟล์ข้อความต้องไม่มีข้อมูลไบนารีปนมา')
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      throw new ApiError(400, 'ไฟล์ข้อความต้องเข้ารหัส UTF-8')
    }
    return
  }
  throw new ApiError(400, 'ประเภทไฟล์ไม่รองรับ (รองรับ PDF, Word, Excel, รูปภาพ, ZIP, PPT, TXT, CSV)')
}
