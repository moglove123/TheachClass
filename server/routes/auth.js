import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Resend } from 'resend'
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

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
const GENERIC_FORGOT_MESSAGE = 'หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านไปแล้ว กรุณาตรวจสอบ inbox และ spam'
const RESET_LINK_BASE = (process.env.APP_BASE_URL || 'https://theach-class.vercel.app').replace(/\/+$/, '')
const RESET_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'TheachClass <onboarding@resend.dev>'

/**
 * ส่งลิงก์รีเซ็ตรหัสผ่านผ่าน Resend
 * - ต้อง await ให้ส่งเสร็จก่อนตอบ API (กัน Vercel function ถูกตัดก่อนส่งอีเมล)
 * - Resend คืน { data, error } แทนการ throw ตอนโดนปฏิเสธ → ต้องเช็ค error เอง
 */
async function sendResetEmail(to, token) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new ApiError(503, 'ยังไม่ได้ตั้งค่า RESEND_API_KEY กรุณาตั้งค่าใน Vercel → Project → Settings → Environment Variables')
  const resetUrl = `${RESET_LINK_BASE}/reset-password?token=${encodeURIComponent(token)}`
  const resend = new Resend(apiKey)
  try {
    const { data, error } = await resend.emails.send({
      from: RESET_FROM_EMAIL,
      to: [to],
      subject: 'ตั้งรหัสผ่านใหม่ — TheachClass',
      text: `ใช้ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 30 นาที):\n${resetUrl}\n\nหากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน กรุณาละเว้นอีเมลนี้`,
      html: `<p>ใช้ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 30 นาที):</p><p><a href="${resetUrl}">ตั้งรหัสผ่านใหม่</a></p><p>หากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน กรุณาละเว้นอีเมลนี้</p>`,
    })
    if (error) throw new Error(error.message || 'Resend ปฏิเสธการส่งอีเมล')
    return data
  } catch (err) {
    console.error('sendResetEmail failed:', err.message)
    throw new ApiError(502, 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง')
  }
}

authRouter.post('/forgot-password', forgotLimiter, asyncHandler(async (req, res) => {
  const { email } = parseBody(forgotSchema, req.body)
  // ตอบข้อความเดียวกันทุกกรณีเพื่อป้องกันการเดาอีเมล (user enumeration)
  const respondGeneric = () => ok(res, null, GENERIC_FORGOT_MESSAGE)

  if (isProduction() && !process.env.RESEND_API_KEY)
    throw new ApiError(503, 'ยังไม่ได้ตั้งค่า RESEND_API_KEY กรุณาติดต่อผู้ดูแลระบบ')

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) return respondGeneric()

  const token = crypto.randomBytes(24).toString('hex')
  const record = await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  })
  await notify(user.id, 'PASSWORD_RESET', 'ขอเปลี่ยนรหัสผ่าน', 'มีการขอเปลี่ยนรหัสผ่านสำหรับบัญชีของคุณ')
  if (isProduction()) {
    try {
      await sendResetEmail(user.email, token)
    } catch (err) {
      // ถ้าส่งไม่สำเร็จ ไม่เก็บ token ที่ใช้งานไม่ได้ไว้ใน DB
      await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {})
      throw err
    }
    return respondGeneric()
  }
  // โหมดพัฒนา/สาธิต: ไม่ส่งอีเมล จึงคืน token ให้ทดสอบได้ (ดู README)
  ok(res, { token }, 'สร้างรหัสเปลี่ยนรหัสผ่านแล้ว (ใช้งานได้ 30 นาที)')
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
    // ยกเลิก token อื่นที่ยังไม่ใช้ของผู้ใช้คนเดียวกัน
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
  ])
  await audit(record.userId, 'RESET_PASSWORD', 'User', record.userId)
  ok(res, null, 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่')
}))
