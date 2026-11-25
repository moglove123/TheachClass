import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { requireAuth } from './auth.js'
import { prisma } from '../db.js'
import { ApiError, asyncHandler, ok, sanitizeFileName } from '../utils.js'
import { assertUploadedFile, IMAGE_EXT } from '../fileValidation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Vercel อ่านเขียนเฉพาะ /tmp ได้ — ใช้ disk ปกติตอนรัน locally
export const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'teachclass-uploads')
  : path.resolve(__dirname, '../../uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const allowedExt = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.zip', '.ppt', '.pptx', '.csv'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB || 20) * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!allowedExt.has(path.extname(file.originalname).toLowerCase()))
      return cb(new ApiError(400, 'ประเภทไฟล์ไม่รองรับ (รองรับ PDF, Word, Excel, รูปภาพ, ZIP, PPT, TXT, CSV)'))
    cb(null, true)
  },
})

export const filesRouter = Router()
filesRouter.use(requireAuth)

filesRouter.post('/upload', (req, res, next) => {
  upload.array('files', 5)(req, res, (err) => {
    if (err) return next(err instanceof ApiError ? err : new ApiError(400, err.message))
    try {
      // ตรวจทุกไฟล์ก่อนเขียนจริง เพื่อไม่ให้ไฟล์ผิดพลาดค้างในโฟลเดอร์
      const checked = (req.files || []).map((f) => {
        const ext = path.extname(f.originalname).toLowerCase()
        assertUploadedFile(f.buffer, ext, f.mimetype)
        return {
          source: f,
          ext,
          filename: `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`,
          name: sanitizeFileName(f.originalname),
        }
      })
      for (const item of checked) fs.writeFileSync(path.join(uploadDir, item.filename), item.source.buffer)
      ok(res, checked.map((item) => ({
        name: item.name,
        url: `/api/files/${item.filename}`,
        size: item.source.size,
        type: item.source.mimetype,
      })), 'อัปโหลดไฟล์สำเร็จ')
    } catch (error) {
      next(error)
    }
  })
})

function sendAttachment(res, filePath) {
  // ไม่ให้ browser เดาคประเภทไฟล์เอง (ตรวจ magic byte ตอนอัปโหลดแล้ว)
  // รูปภาพแสดง inline เพื่อให้ <img> แสดงได้ / ไฟล์อื่นบังคับดาวน์โหลดกัน HTML ที่ไม่เชื่อถือได้
  const ext = path.extname(filePath).toLowerCase()
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `${IMAGE_EXT.has(ext) ? 'inline' : 'attachment'}; filename="download${ext}"`)
  res.type(ext)
  res.sendFile(filePath)
}

filesRouter.get('/files/:filename', asyncHandler(async (req, res) => {
  const name = path.basename(req.params.filename)
  const filePath = path.join(uploadDir, name)
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'ไม่พบไฟล์')
  const url = `/api/files/${name}`

  // ผู้ดูแลเห็นทุกไฟล์ / ครูเห็นเฉพาะไฟล์ในห้องที่ตัวเองสอน / นักเรียนเห็นเฉพาะไฟล์ของตัวเองหรือห้องที่เข้าร่วม
  if (req.user.role === 'ADMIN') return sendAttachment(res, filePath)
  if (req.user.role === 'TEACHER') {
    const allowed = await prisma.assignment.findFirst({
      where: {
        OR: [
          { attachments: { contains: url }, classroom: { teacherId: req.user.id } },
          { submissions: { some: { files: { contains: url } } }, classroom: { teacherId: req.user.id } },
        ],
      },
      select: { id: true },
    })
    // ครูเจ้าของห้องที่นักเรียนแจ้งลาสามารถดูรูปใบรับรองในคำร้องได้
    const leave = await prisma.leaveRequest.findFirst({
      where: { attachments: { contains: url }, classroom: { teacherId: req.user.id } },
      select: { id: true },
    })
    if (!allowed && !leave) throw new ApiError(403, 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้')
    return sendAttachment(res, filePath)
  }
  const submission = await prisma.submission.findFirst({
    where: { userId: req.user.id, files: { contains: url } },
    select: { id: true },
  })
  const assignment = await prisma.assignment.findFirst({
    where: {
      attachments: { contains: url },
      classroom: { enrollments: { some: { userId: req.user.id } } },
    },
    select: { id: true },
  })
  // นักเรียนเห็นรูปที่ตัวเองแนบในคำร้องลาได้
  const leave = await prisma.leaveRequest.findFirst({
    where: { userId: req.user.id, attachments: { contains: url } },
    select: { id: true },
  })
  if (!submission && !assignment && !leave) throw new ApiError(403, 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้')
  sendAttachment(res, filePath)
}))
