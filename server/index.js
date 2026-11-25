import 'dotenv/config'
// ใช้เขตเวลาประเทศไทยสำหรับการแปลงวันที่/เวลาทั้งหมดในฝั่งเซิร์ฟเวอร์
// (สำคัญตอน parse ค่า datetime-local ที่ส่งมาเป็นข้อความไม่มีเขตเวลา)
process.env.TZ ||= 'Asia/Bangkok'
import express from 'express'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ApiError, fail } from './utils.js'
import { assertProductionConfig, isProduction } from './config.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { classroomsRouter } from './routes/classrooms.js'
import { attendanceRouter } from './routes/attendance.js'
import { leavesRouter } from './routes/leaves.js'
import { assignmentsRouter } from './routes/assignments.js'
import { submissionsRouter } from './routes/submissions.js'
import { gradesRouter } from './routes/grades.js'
import { notificationsRouter } from './routes/notifications.js'
import { exportsRouter } from './routes/exports.js'
import { adminRouter } from './routes/admin.js'
import { dashboardRouter } from './routes/dashboard.js'
import { announcementsRouter } from './routes/announcements.js'
import { filesRouter } from './routes/files.js'
import { profileRouter } from './routes/profile.js'
import { startReminders } from './reminders.js'

// กันการเปิด production ด้วย secret ตัวอย่าง/สั้นเกินไป (ควร fail-fast ตอน start)
assertProductionConfig()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const app = express()
app.disable('x-powered-by')

// Security headers แบบไม่ต้องพึ่งแพ็กเก็ตเพิ่ม (CSP แบบเต็มใช้เฉพาะ production เพื่อไม่ให้ Vite HMR ใน dev พัง)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()')
  if (isProduction()) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '))
  }
  next()
})

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'TheachClass API', time: new Date().toISOString() }))

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/classrooms', classroomsRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api/leaves', leavesRouter)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/submissions', submissionsRouter)
app.use('/api/grades', gradesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/exports', exportsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/announcements', announcementsRouter)
app.use('/api/profile', profileRouter)
app.use('/api', filesRouter)

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(dist, 'index.html'))
    next()
  })
}

app.use((req, res) => fail(res, 404, `ไม่พบเส้นทาง ${req.method} ${req.originalUrl}`))

app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return fail(res, err.status, err.message, err.extra)
  if (err.code === 'JWT_SECRET_INVALID') return fail(res, 500, err.message)
  if (err.code === 'P2002') return fail(res, 409, 'ข้อมูลซ้ำในระบบ (อาจเป็นอีเมล รหัส หรือรหัสห้องเรียน)')
  if (err.code === 'P2025') return fail(res, 404, 'ไม่พบข้อมูลที่ต้องการแก้ไข')
  if (err.name === 'MulterError') return fail(res, 400, `ข้อผิดพลาดในการอัปโหลดไฟล์: ${err.message}`)
  console.error(err)
  fail(res, 500, 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่ภายหลัง')
})

export { app }
// @vercel/node ต้องการ default export (Express app เป็น request handler ได้เลย)
export default app

// บน Vercel ไม่ควรเรียก app.listen หรือ startReminders() — function ถูกเรียกตาม request
const isServerless = Boolean(process.env.VERCEL)
if (process.env.NODE_ENV !== 'test' && !isServerless) {
  const port = Number(process.env.PORT || 4000)
  app.listen(port, () => {
    console.log(`TheachClass API running at http://localhost:${port}`)
    startReminders()
  })
}
