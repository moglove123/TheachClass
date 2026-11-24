import ExcelJS from 'exceljs'
import { prisma } from '../db.js'
import { computeGrade, defaultScales, thaiDateTime } from '../utils.js'

// ใช้ฟอนต์ที่รองรับภาษาไทยบน Excel/Windows ได้ทันที (Prompt อาจไม่มีติดเครื่อง)
const FONT = 'Tahoma'
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
const subFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
const border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } }

function styleHeader(ws, row = 1) {
  ws.getRow(row).eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = headerFill
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = border
  })
  ws.getRow(row).height = 30
}

function styleBody(ws, from = 2) {
  ws.eachRow((row, idx) => {
    if (idx < from) return
    row.eachCell((cell) => {
      cell.font = { name: FONT, size: 10 }
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  })
}

function finishSheet(ws, widths, headerRow = 1) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.views = [{ state: 'frozen', ySplit: headerRow }]
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: widths.length } }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
}

const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 100 : 0)

export async function getClassroomDataset(user, query) {
  const where = {}
  if (query.classroomId) where.id = Number(query.classroomId)
  if (query.semester) where.semester = String(query.semester)
  if (query.academicYear) where.academicYear = String(query.academicYear)
  if (query.subjectCode) where.subjectCode = String(query.subjectCode)
  if (user.role === 'TEACHER') where.teacherId = user.id

  const classrooms = await prisma.classroom.findMany({
    where,
    include: {
      teacher: { select: { firstName: true, lastName: true } },
      gradeScales: true,
      enrollments: { include: { user: { select: { id: true, studentId: true, firstName: true, lastName: true } } }, orderBy: { user: { studentId: 'asc' } } },
      assignments: { orderBy: { id: 'asc' } },
      attendances: true,
      gradeRecords: true,
    },
    orderBy: [{ academicYear: 'desc' }, { id: 'asc' }],
  })
  if (!classrooms.length) return null
  const assignmentIds = classrooms.flatMap((c) => c.assignments.map((a) => a.id))
  const submissions = await prisma.submission.findMany({ where: { assignmentId: { in: assignmentIds }, status: 'GRADED' }, orderBy: { attempt: 'desc' } })
  const latest = new Map()
  for (const s of submissions) if (!latest.has(`${s.assignmentId}:${s.userId}`)) latest.set(`${s.assignmentId}:${s.userId}`, s)
  return { classrooms, latest }
}

function buildSummarySheet(wb, rows, scales) {
  const ws = wb.addWorksheet('สรุปภาพรวม')
  const title = ws.getCell('A1')
  title.value = 'รายงานสรุปภาพรวมระบบจัดการชั้นเรียน'
  title.font = { name: FONT, size: 16, bold: true, color: { argb: 'FF1E3A8A' } }
  ws.mergeCells('A1:C1')
  ws.getCell('A2').value = `สร้างเมื่อ ${thaiDateTime(new Date())}`
  ws.getCell('A2').font = { name: FONT, size: 10, italic: true, color: { argb: 'FF64748B' } }
  const headers = ['รายการ', 'ค่า', 'หมายเหตุ']
  ws.addRow([])
  ws.addRow(headers)
  styleHeader(ws, 4)
  const totalStudents = rows.length
  const avg = rows.length ? rows.reduce((a, b) => a + b.total, 0) / rows.length : 0
  const attendanceAvg = rows.length ? rows.reduce((a, b) => a + b.attendancePercentage, 0) / rows.length : 0
  const complete = rows.filter((r) => r.missing === 0 && r.submitted > 0).length
  const distribution = scales.map((s) => [s.grade, rows.filter((r) => r.grade === s.grade).length])
  const data = [
    ['จำนวนนักเรียนทั้งหมด', totalStudents, 'จากทุกห้องเรียนที่เลือก'],
    ['คะแนนเฉลี่ยทั้งห้อง', Math.round(avg * 100) / 100, 'คะแนนเต็ม 100'],
    ['เปอร์เซ็นต์การเข้าเรียนเฉลี่ย', Math.round(attendanceAvg * 100) / 100, '%'],
    ['จำนวนผู้ส่งงานครบ', complete, 'ส่งครบทุกงาน'],
    ['จำนวนผู้ที่ยังส่งงานไม่ครบ', totalStudents - complete, ''],
    ...distribution.map(([grade, count]) => [`จำนวนเกรด ${grade}`, count, 'คน']),
  ]
  data.forEach((r) => ws.addRow(r))
  ws.addRow([])
  ws.addRow([`=AVERAGE('สรุปผลการเรียน'!F2:F1000)`, 'คะแนนเฉลี่ย (สูตร)', 'คำนวณจากชีตสรุปผลการเรียน'])
  ws.addRow([`=COUNTIF('สรุปผลการเรียน'!G2:G1000,"ผ่าน")`, 'จำนวนนักเรียนผ่าน (สูตร)', ''])
  styleBody(ws, 5)
  finishSheet(ws, [36, 18, 40], 4)
  ws.autoFilter = undefined
}

export function buildScoreRows(classrooms, latest) {
  const rows = []
  for (const c of classrooms) {
    for (const e of c.enrollments) {
      const u = e.user
      const att = c.attendances.filter((a) => a.userId === u.id)
      const present = att.filter((a) => a.status === 'PRESENT').length
      const late = att.filter((a) => a.status === 'LATE').length
      const absent = att.filter((a) => a.status === 'ABSENT').length
      const leave = att.filter((a) => a.status === 'LEAVE').length
      const assignmentScores = {}
      let submitted = 0
      for (const a of c.assignments) {
        const s = latest.get(`${a.id}:${u.id}`)
        if (s) submitted++
        assignmentScores[a.id] = s?.score ?? null
      }
      const myRecords = c.gradeRecords.filter((r) => r.userId === u.id)
      const recs = Object.fromEntries(myRecords.map((r) => [r.category, r.score]))
      const recordMax = Object.fromEntries(myRecords.map((r) => [r.category, r.maxScore]))
      const scales = c.gradeScales.length ? c.gradeScales : defaultScales
      const assignmentMax = c.assignments.reduce((sum, a) => sum + a.maxScore + a.bonusScore, 0)
      const raw = c.assignments.reduce((sum, a) => sum + (assignmentScores[a.id] || 0), 0)
      const assignmentWeighted = assignmentMax ? (raw / assignmentMax) * c.weightAssignment : 0
      const weighted = (cat, weight) => recs[cat] ? Math.min((recs[cat] / (recordMax[cat] || weight)) * weight, weight) : 0
      const total = Math.min(100, Math.round((assignmentWeighted + weighted('COLLECTION', c.weightCollection) + weighted('MIDTERM', c.weightMidterm) + weighted('FINAL', c.weightFinal) + weighted('ACTIVITY', c.weightActivity) + (recs.BONUS || 0)) * 100) / 100)
      rows.push({
        classroom: c, user: u, present, late, absent, leave,
        attendancePercentage: pct(present + late, present + late + absent + leave),
        assignmentScores, submitted, missing: c.assignments.length - submitted,
        assignmentWeighted, records: recs, total, grade: computeGrade(total, scales),
      })
    }
  }
  return rows
}

export async function buildWorkbook(user, query, sheets = ['students', 'attendance', 'assignments', 'exams', 'results', 'summary']) {
  const dataset = await getClassroomDataset(user, query)
  if (!dataset) return null
  const { classrooms, latest } = dataset
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TheachClass'
  wb.created = new Date()

  const rows = buildScoreRows(classrooms, latest)

  if (sheets.includes('students')) {
    const ws = wb.addWorksheet('ข้อมูลนักเรียน')
    ws.addRow(['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'วิชา', 'รหัสวิชา', 'ภาคเรียน', 'ปีการศึกษา'])
    rows.forEach((r, i) => ws.addRow([i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`, r.classroom.name, r.classroom.subject, r.classroom.subjectCode, r.classroom.semester, r.classroom.academicYear]))
    styleHeader(ws); styleBody(ws); finishSheet(ws, [8, 16, 28, 26, 22, 14, 10, 14])
  }

  if (sheets.includes('attendance')) {
    const ws = wb.addWorksheet('สรุปการเข้าเรียน')
    ws.addRow(['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'มาเรียน', 'มาสาย', 'ขาดเรียน', 'ลา', 'เปอร์เซ็นต์การเข้าเรียน'])
    rows.forEach((r, i) => {
      const n = i + 2
      ws.addRow([i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`, r.classroom.name, r.present, r.late, r.absent, r.leave,
        { formula: `IF((E${n}+F${n}+G${n}+H${n})=0,0,ROUND((E${n}+F${n})/(E${n}+F${n}+G${n}+H${n})*100,2))`, result: r.attendancePercentage }])
    })
    styleHeader(ws); styleBody(ws); finishSheet(ws, [8, 16, 28, 26, 12, 12, 12, 10, 22])
  }

  if (sheets.includes('assignments')) {
    const ws = wb.addWorksheet('คะแนนงาน')
    const allAssignments = classrooms.flatMap((c) => c.assignments.map((a) => ({ ...a, className: c.name })))
    ws.addRow(['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', ...allAssignments.map((a) => `${a.title} (${a.maxScore + a.bonusScore})`), 'คะแนนรวม', 'จำนวนงานที่ส่ง', 'จำนวนงานที่ไม่ส่ง'])
    rows.forEach((r, i) => {
      const n = i + 2
      const firstCol = 5
      const lastCol = 4 + allAssignments.length
      const values = allAssignments.map((a) => r.assignmentScores[a.id] ?? 0)
      ws.addRow([
        i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`, r.classroom.name,
        ...values,
        { formula: `SUM(${ws.getColumn(firstCol).letter}${n}:${ws.getColumn(lastCol).letter}${n})`, result: values.reduce((a, b) => a + b, 0) },
        r.submitted, r.missing,
      ])
    })
    styleHeader(ws); styleBody(ws); finishSheet(ws, [8, 16, 28, 24, ...allAssignments.map(() => 18), 14, 16, 16])
  }

  if (sheets.includes('exams')) {
    const ws = wb.addWorksheet('คะแนนสอบ')
    ws.addRow(['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'คะแนนเก็บ', 'คะแนนกลางภาค', 'คะแนนปลายภาค', 'คะแนนกิจกรรม', 'คะแนนพิเศษ'])
    rows.forEach((r, i) => ws.addRow([
      i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`, r.classroom.name,
      r.records.COLLECTION ?? 0, r.records.MIDTERM ?? 0, r.records.FINAL ?? 0, r.records.ACTIVITY ?? 0, r.records.BONUS ?? 0,
    ]))
    styleHeader(ws); styleBody(ws); finishSheet(ws, [8, 16, 28, 26, 14, 16, 16, 16, 16])
  }

  if (sheets.includes('results')) {
    const ws = wb.addWorksheet('สรุปผลการเรียน')
    const scales = classrooms[0].gradeScales.length ? classrooms[0].gradeScales : defaultScales
    const sorted = [...scales].sort((a, b) => b.minScore - a.minScore)
    const gradeFormula = (cell) => {
      let f = `"${sorted[sorted.length - 1].grade}"`
      for (const s of [...sorted].reverse().slice(0, -1)) f = `IF(${cell}>=${s.minScore},"${s.grade}",${f})`
      return f
    }
    ws.addRow(['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'คะแนนรวมทั้งหมด', 'เกรด', 'สถานะ'])
    rows.forEach((r, i) => {
      const n = i + 2
      ws.addRow([
        i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`, r.classroom.name,
        r.total, { formula: gradeFormula(`E${n}`), result: r.grade },
        { formula: `IF(E${n}>=50,"ผ่าน","ไม่ผ่าน")`, result: r.total >= 50 ? 'ผ่าน' : 'ไม่ผ่าน' },
      ])
    })
    styleHeader(ws); styleBody(ws); finishSheet(ws, [8, 16, 28, 26, 20, 12, 14])
  }

  if (sheets.includes('summary')) buildSummarySheet(wb, rows, classrooms[0].gradeScales.length ? classrooms[0].gradeScales : defaultScales)
  return wb
}

// ไฟล์สรุปคะแนนของทุกคนใน 1 ห้องเรียน (ใช้ชื่อห้องเรียนเป็นชื่อไฟล์ฝั่ง route)
export async function buildClassroomScoreWorkbook(user, query) {
  const dataset = await getClassroomDataset(user, query)
  if (!dataset) return null
  const { classrooms, latest } = dataset
  const wb = await buildWorkbook(user, query, ['students', 'attendance', 'assignments', 'exams', 'results', 'summary'])
  const rows = buildScoreRows(classrooms, latest)
  const assignments = classrooms[0].assignments

  const ws = wb.addWorksheet('สรุปคะแนนทั้งหมด')
  ws.addRow([
    'ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้องเรียน', 'วิชา',
    ...assignments.map((a) => `${a.title} (${a.maxScore + a.bonusScore})`),
    'คะแนนงานถ่วงน้ำหนัก', 'คะแนนเก็บ', 'คะแนนกลางภาค', 'คะแนนปลายภาค',
    'คะแนนกิจกรรม', 'คะแนนพิเศษ', 'คะแนนรวมทั้งหมด', 'เกรด', 'ผลการเรียน',
    'งานที่ส่ง', 'งานที่ขาดส่ง',
  ])
  rows.forEach((r, i) => {
    ws.addRow([
      i + 1, r.user.studentId || '-', `${r.user.firstName} ${r.user.lastName}`,
      r.classroom.name, r.classroom.subject,
      ...assignments.map((a) => r.assignmentScores[a.id] ?? 0),
      Math.round(r.assignmentWeighted * 100) / 100,
      r.records.COLLECTION ?? 0, r.records.MIDTERM ?? 0, r.records.FINAL ?? 0,
      r.records.ACTIVITY ?? 0, r.records.BONUS ?? 0,
      r.total, r.grade, r.total >= 50 ? 'ผ่าน' : 'ไม่ผ่าน',
      r.submitted, r.missing,
    ])
  })
  styleHeader(ws)
  styleBody(ws)
  finishSheet(ws, [8, 16, 28, 26, 22, ...assignments.map(() => 18), 20, 14, 16, 16, 16, 14, 18, 10, 14, 12, 14])
  return wb
}
