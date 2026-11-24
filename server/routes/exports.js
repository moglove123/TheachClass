import { Router } from 'express'
import { requireAuth, requireRole } from './auth.js'
import { prisma } from '../db.js'
import { asyncHandler, ApiError, audit, assertClassroomAccess, ok, sanitizeFileName } from '../utils.js'
import { buildWorkbook, buildClassroomScoreWorkbook } from '../services/exportExcel.js'

export const exportsRouter = Router()
exportsRouter.use(requireAuth, requireRole('ADMIN', 'TEACHER'))

// ตัวกรองสำหรับหน้ารายงาน: ครูได้เฉพาะวิชา/ห้องที่ตนเองเป็นเจ้าของ, ผู้ดูแลได้ทั้งหมด
exportsRouter.get('/options', asyncHandler(async (req, res) => {
  const where = req.user.role === 'TEACHER' ? { teacherId: req.user.id } : {}
  const classrooms = await prisma.classroom.findMany({
    where,
    select: {
      id: true, name: true, semester: true, academicYear: true,
      subject: true, subjectCode: true,
      _count: { select: { enrollments: true } },
    },
    orderBy: [{ academicYear: 'desc' }, { id: 'asc' }],
  })
  ok(res, {
    scope: req.user.role === 'TEACHER' ? 'OWN' : 'ALL',
    classrooms,
    semesters: [...new Set(classrooms.map((c) => c.semester))].sort(),
    years: [...new Set(classrooms.map((c) => c.academicYear))].sort().reverse(),
    subjects: [...new Map(classrooms.map((c) => [c.subjectCode, { code: c.subjectCode, name: c.subject }])).values()],
  })
}))

// กันครูส่ง subjectCode / semester / ปีการศึกษาของคนอื่นมาแม้จะปิด UI ทิ้ง
async function assertTeacherExportScope(req, query = req.query) {
  if (req.user.role !== 'TEACHER') return
  const { classroomId, semester, academicYear, subjectCode } = query
  if (!classroomId && !semester && !academicYear && !subjectCode) return
  const where = { teacherId: req.user.id }
  const cid = Number(classroomId)
  if (cid) where.id = cid
  if (semester) where.semester = String(semester)
  if (academicYear) where.academicYear = String(academicYear)
  if (subjectCode) where.subjectCode = String(subjectCode)
  const own = await prisma.classroom.findFirst({ where, select: { id: true } })
  if (!own) throw new ApiError(404, 'ไม่พบวิชาหรือห้องเรียนที่คุณสอนตามเงื่อนไขที่เลือก')
}

async function sendWorkbook(req, res, sheets, name, workbook, asciiFallback) {
  // student-scores ใช้เฉพาะ classroomId (workbook ถูกสร้างไว้แล้ว) ไม่ต้องเอา filter อื่นมาควบคุม
  await assertTeacherExportScope(req, workbook ? { classroomId: req.query.classroomId } : req.query)
  const wb = workbook || await buildWorkbook(req.user, req.query, sheets)
  if (!wb) throw new ApiError(404, 'ไม่พบข้อมูลตามเงื่อนไขที่เลือก')
  await audit(req.user.id, 'EXPORT_EXCEL', 'Report', null, { sheets, query: req.query })
  const fileName = `${sanitizeFileName(name)}.xlsx`
  // Node ไม่ยอมรับอักขระไทยใน filename ธรรมดา → ใช้ชื่อ ASCII สำรองที่อ่านรู้เรื่อง + filename* ตาม RFC 5987
  const asciiName = asciiFallback
    || (/^[\x20-\x7E]+$/.test(fileName) ? fileName : 'theachclass-report.xlsx')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  await wb.xlsx.write(res)
  res.end()
}

exportsRouter.get('/full', asyncHandler(async (req, res) => {
  await sendWorkbook(req, res, ['students', 'attendance', 'assignments', 'exams', 'results', 'summary'], 'theachclass-full-report')
}))

exportsRouter.get('/attendance', asyncHandler(async (req, res) => {
  await sendWorkbook(req, res, ['students', 'attendance', 'summary'], 'theachclass-attendance')
}))

exportsRouter.get('/grades', asyncHandler(async (req, res) => {
  await sendWorkbook(req, res, ['students', 'exams', 'results', 'summary'], 'theachclass-grades')
}))

exportsRouter.get('/grading', asyncHandler(async (req, res) => {
  await sendWorkbook(req, res, ['students', 'assignments', 'results', 'summary'], 'theachclass-grading')
}))

// สรุปคะแนนทั้งหมดของนักเรียนทุกคนในห้องเรียนเดียว ตั้งชื่อไฟล์ตามชื่อชั้นเรียน
exportsRouter.get('/student-scores', asyncHandler(async (req, res) => {
  const classroomId = Number(req.query.classroomId)
  if (!classroomId) throw new ApiError(400, 'กรุณาเลือกห้องเรียนก่อนดาวน์โหลด')
  let classroom
  try {
    classroom = await assertClassroomAccess(req.user, classroomId, { teacherOnly: req.user.role === 'TEACHER' })
  } catch (err) {
    // เหมือน sendWorkbook ของเดิม: ไม่เปิดเผยว่ามีห้องเรียนของครูคนอื่นอยู่
    if (err.status === 403) throw new ApiError(404, 'ไม่พบข้อมูลตามเงื่อนไขที่เลือก')
    throw err
  }
  const wb = await buildClassroomScoreWorkbook(req.user, { classroomId })
  if (!wb) throw new ApiError(404, 'ไม่พบข้อมูลนักเรียนในห้องเรียนนี้')
  // แทน / และ \ ด้วย - ก่อนส่งให้ sanitizeFileName (path.basename ตัดชื่อที่เครื่องหมาย /)
  const baseName = String(classroom.name).replace(/[\\/]/g, '-').trim() || `classroom-${classroom.id}`
  await sendWorkbook(req, res, ['summary-scores'], `${baseName}_สรุปคะแนน`, wb, `classroom-${classroom.id}-scores.xlsx`)
}))
