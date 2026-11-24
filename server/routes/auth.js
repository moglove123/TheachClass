import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { ApiError, asyncHandler, ok, audit, notify } from '../utils.js'
import { jwtSecret, isProduction, minPasswordLength, passwordHint } from '../config.js'
import { loginLimiter, registerLimiter, forgotLimiter, resetLimiter } from '../rateLimit.js'

export const userSelect = {
  id: true, studentId: true, firstName: true, lastName: true, email: true,
  role: true, status: true, phone: true, avatarUrl: true, createdAt: true,
}

// ใช้ตรวจสิทธิ์ในทุก request (มี tokenVersion เพื่อรองรับการบังคับ logout ทุกเครื่อง)
const authUserSelect = { ...userSelect, tokenVersion: true }

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
})

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, ver: user.tokenVersion ?? 0 },
    jwtSecret(),
    { expiresIn: '7d' },
  )
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || 'ข้อมูลที่ส่งมาไม่ถูกต้อง')
  return parsed.data
}

const emailRule = z.string().trim().regex(/^\S+@\S+\.\S+$/, 'รูปแบบอีเมลไม่ถูกต้อง')
const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อและนามสกุล').default(''),
  lastName: z.string().trim().min(1, 'กรุณากรอกชื่อและนามสกุล').default(''),
  email: emailRule.default(''),
  password: z.string().min(minPasswordLength(), passwordHint()).default(''),
  studentId: z.string().trim().optional(),
  phone: z.string().trim().optional(),
})
const loginSchema = z.object({
  email: z.string().trim().default(''),
  password: z.string().default(''),
})
const forgotSchema = z.object({ email: emailRule.default('') })
const resetSchema = z.object({
  token: z.string().trim().min(1, 'รหัสเปลี่ยนรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว').default(''),
  newPassword: z.string().min(minPasswordLength(), passwordHint()).default(''),
})

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.token
  if (!token) throw new ApiError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน')
  let payload
  try {
    payload = jwt.verify(token, jwtSecret())
  } catch {
    throw new ApiError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  }
  const user = await prisma.user.findUnique({ where: { id: payload.id }, select: authUserSelect })
  if (!user) throw new ApiError(401, 'ไม่พบบัญชีผู้ใช้งาน')
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'บัญชีของคุณยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน')
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0))
    throw new ApiError(401, 'เซสชันถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่')
  req.user = user
  next()
})

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'))
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้'))
  next()
}

export const authRouter = Router()

authRouter.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  const input = parseBody(registerSchema, req.body)
  // การสมัครด้วยตนเองเป็นนักเรียนเท่านั้น สิทธิ์ครู/ผู้ดูแลต้องมาจากผู้ดูแลระบบในหน้าผู้ใช้
  const requestedRole = 'STUDENT'
  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (exists) throw new ApiError(409, 'อีเมลนี้มีอยู่ในระบบแล้ว')
  let sid = input.studentId?.trim() || null
  if (sid) {
    const dup = await prisma.user.findUnique({ where: { studentId: sid } })
    if (dup) throw new ApiError(409, 'รหัสนักเรียนซ้ำในระบบ')
  }
  const user = await prisma.user.create({
    data: {
      firstName: input.firstName, lastName: input.lastName,
      email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 10),
      role: requestedRole, status: 'ACTIVE', studentId: sid, phone: input.phone || null,
    },
    select: userSelect,
  })
  await notify(user.id, 'WELCOME', 'ยินดีต้อนรับเข้าสู่ TheachClass', 'บัญชีของคุณพร้อมใช้งานแล้ว เริ่มใช้งานได้ทันที')
  await audit(user.id, 'REGISTER', 'User', user.id, { email: user.email, role: requestedRole })
  ok(res, user, 'สมัครสมาชิกสำเร็จ บัญชีพร้อมใช้งานแล้ว')
}))

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body)
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new ApiError(401, 'Gmail หรือ password ของท่านผิด')
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'บัญชีของคุณยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน')
  res.cookie('token', signToken(user), cookieOptions())
  const { passwordHash, tokenVersion, ...safe } = user
  await audit(user.id, 'LOGIN', 'User', user.id)
  ok(res, safe, 'เข้าสู่ระบบสำเร็จ')
}))

authRouter.post('/logout', asyncHandler(async (req, res) => {
  if (req.user) await audit(req.user.id, 'LOGOUT', 'User', req.user.id)
  res.clearCookie('token', { path: '/' })
  ok(res, null, 'ออกจากระบบสำเร็จ')
}))

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  ok(res, req.user)
}))

/**
 * ส่งลิงก์รีเซ็ตรหัสผ่านผ่าน HTTP email gateway ที่ตั้งค่าใน EMAIL_API_URL
 * (รองรับบริการใด ๆ ที่รับ JSON { to, subject, text, token, resetUrl } และ Bearer key)
 */
async function sendResetEmail(to, token) {
  const resetUrl = `${process.env.APP_BASE_URL || ''}/forgot-password?token=${encodeURIComponent(token)}`
  const headers = { 'content-type': 'application/json' }
  if (process.env.EMAIL_API_KEY) headers.authorization = `Bearer ${process.env.EMAIL_API_KEY}`
  let response
  try {
    response = await fetch(process.env.EMAIL_API_URL, {
      method: 'POST', headers,
      body: JSON.stringify({
        to,
        subject: 'ตั้งรหัสผ่านใหม่ — TheachClass',
        text: `ใช้รหัสนี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 1 ชั่วโมง): ${token}\nหรือเปิดลิงก์: ${resetUrl}`,
        token, resetUrl,
      }),
    })
  } catch {
    throw new ApiError(502, 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง')
  }
  if (!response.ok) throw new ApiError(502, 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง')
}

authRouter.post('/forgot-password', forgotLimiter, asyncHandler(async (req, res) => {
  const { email } = parseBody(forgotSchema, req.body)
  const respondGeneric = () => ok(res, null, 'หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว')

  if (isProduction() && !process.env.EMAIL_API_URL)
    throw new ApiError(503, 'ยังไม่ได้ตั้งค่าบริการส่งอีเมล (EMAIL_API_URL) กรุณาติดต่อผู้ดูแลระบบ')

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    // ใน production ไม่บอกว่าอีเมลมีอยู่หรือไม่ เพื่อป้องกัน user enumeration
    if (isProduction()) return respondGeneric()
    throw new ApiError(404, 'ไม่พบบัญชีที่ใช้อีเมลนี้')
  }
  const token = crypto.randomBytes(24).toString('hex')
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  })
  await notify(user.id, 'PASSWORD_RESET', 'ขอเปลี่ยนรหัสผ่าน', 'มีการขอเปลี่ยนรหัสผ่านสำหรับบัญชีของคุณ')
  if (isProduction()) {
    await sendResetEmail(user.email, token)
    return respondGeneric()
  }
  // โหมดพัฒนา/สาธิต: ไม่มีบริการอีเมล จึงคืน token ให้ทดสอบได้ (ดู README)
  ok(res, { token }, 'สร้างรหัสเปลี่ยนรหัสผ่านแล้ว (ใช้งานได้ 1 ชั่วโมง)')
}))

authRouter.post('/reset-password', resetLimiter, asyncHandler(async (req, res) => {
  const { token, newPassword } = parseBody(resetSchema, req.body)
  const record = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!record || record.usedAt || record.expiresAt < new Date())
    throw new ApiError(400, 'รหัสเปลี่ยนรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว')
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      // บังคับออกจากทุกอุปกรณ์หลังเปลี่ยนรหัสผ่าน
      data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])
  await audit(record.userId, 'RESET_PASSWORD', 'User', record.userId)
  ok(res, null, 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่')
}))
