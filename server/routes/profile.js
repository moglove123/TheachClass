import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../db.js'
import { requireAuth, userSelect } from './auth.js'
import { ApiError, asyncHandler, audit, ok } from '../utils.js'
import { assertRealImage } from '../fileValidation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const avatarDir = path.resolve(__dirname, '../../uploads/avatars')
fs.mkdirSync(avatarDir, { recursive: true })

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MAX_AVATAR_MB = 5

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXT.has(path.extname(file.originalname).toLowerCase()))
      return cb(new ApiError(400, 'รองรับเฉพาะรูปภาพ PNG, JPG, GIF, WEBP'))
    cb(null, true)
  },
})

const uploadAvatar = (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) return next(err instanceof ApiError ? err : new ApiError(400, err.message))
    next()
  })
}

const avatarUrlOf = (filename) => `/api/profile/avatar/${filename}`

/** ลบไฟล์รูปเก่าหากไม่มีผู้ใช้คนอื่นอ้างอิงอยู่ */
export async function removeAvatarFile(url, exceptUserId) {
  if (!url?.startsWith('/api/profile/avatar/')) return
  const filename = path.basename(url.slice('/api/profile/avatar/'.length))
  const stillUsed = await prisma.user.count({
    where: { avatarUrl: url, id: { not: exceptUserId } },
  })
  if (stillUsed) return
  const filePath = path.join(avatarDir, filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

export const profileRouter = Router()
profileRouter.use(requireAuth)

// แก้ไขข้อมูลส่วนตัวของตัวเอง (ทุกสิทธิ์: ADMIN / TEACHER / STUDENT)
profileRouter.patch('/', asyncHandler(async (req, res) => {
  const data = {}
  for (const key of ['firstName', 'lastName', 'phone']) {
    if (req.body?.[key] === undefined) continue
    const value = String(req.body[key] ?? '').trim()
    if ((key === 'firstName' || key === 'lastName') && !value)
      throw new ApiError(400, 'กรุณากรอกชื่อและนามสกุล')
    data[key] = value || null
  }
  const user = await prisma.user.update({
    where: { id: req.user.id }, data, select: userSelect,
  })
  await audit(req.user.id, 'UPDATE_PROFILE', 'User', req.user.id, { fields: Object.keys(data) })
  ok(res, user, 'บันทึกข้อมูลส่วนตัวสำเร็จ')
}))

// อัปโหลด/เปลี่ยนรูปโปรไฟล์ของตัวเอง
profileRouter.post('/avatar', uploadAvatar, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'กรุณาเลือกไฟล์รูปภาพ')
  const ext = path.extname(req.file.originalname).toLowerCase()
  assertRealImage(req.file.buffer, ext)

  const filename = `avatar-${req.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  fs.writeFileSync(path.join(avatarDir, filename), req.file.buffer)

  const previous = req.user.avatarUrl
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: avatarUrlOf(filename) },
      select: userSelect,
    })
    await removeAvatarFile(previous, req.user.id)
    await audit(req.user.id, 'UPLOAD_AVATAR', 'User', req.user.id, { avatarUrl: user.avatarUrl })
    ok(res, user, 'อัปโหลดรูปโปรไฟล์สำเร็จ')
  } catch (err) {
    // ถ้าบันทึกฐานข้อมูลไม่สำเร็จ อย่าทิ้งไฟล์ค้างไว้
    const filePath = path.join(avatarDir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    throw err
  }
}))

// ลบรูปโปรไฟล์ของตัวเอง
profileRouter.delete('/avatar', asyncHandler(async (req, res) => {
  const previous = req.user.avatarUrl
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl: null },
    select: userSelect,
  })
  await removeAvatarFile(previous, req.user.id)
  await audit(req.user.id, 'DELETE_AVATAR', 'User', req.user.id)
  ok(res, user, 'ลบรูปโปรไฟล์สำเร็จ')
}))

// เสิร์ฟรูปให้ผู้ใช้ที่ล็อกอินทุกคนได้เห็น (ตรวจว่ามีคนอ้างอิงรูปนี้อยู่จริง)
profileRouter.get('/avatar/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename)
  const url = avatarUrlOf(filename)
  const used = await prisma.user.count({ where: { avatarUrl: url } })
  if (!used) throw new ApiError(404, 'ไม่พบรูปโปรไฟล์')
  const filePath = path.join(avatarDir, filename)
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'ไม่พบรูปโปรไฟล์')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(filePath)
}))
