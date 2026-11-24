import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileSpreadsheet, Download, Filter, Users, ClipboardCheck,
  GraduationCap, ClipboardList, Info,
} from 'lucide-react'
import { api, downloadFile } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Button, Card, ErrorState, PageHeader, Select, StatCard, toast } from '../components/ui.jsx'
import { safeThaiDateTime } from '../utils.js'

const REPORTS = [
  { key: 'student-scores', icon: GraduationCap, title: 'สรุปคะแนนนักเรียนทุกคน', desc: 'คะแนนงาน คะแนนสอบ คะแนนรวม เกรด และผลการเรียนของทุกคนในชั้นเรียนที่เลือก (ตั้งชื่อไฟล์ตามชื่อชั้นเรียน)', color: 'blue' },
  { key: 'full', icon: FileSpreadsheet, title: 'รายงานฉบับเต็ม', desc: 'ข้อมูลนักเรียน การเข้าเรียน คะแนนงาน คะแนนสอบ ผลการเรียน และสรุปภาพรวม รวมอยู่ในไฟล์เดียว', color: 'blue' },
  { key: 'attendance', icon: ClipboardCheck, title: 'รายงานการเข้าเรียน', desc: 'ข้อมูลนักเรียน สรุปการเข้าเรียนรายคน พร้อมสูตรคำนวณเปอร์เซ็นต์', color: 'emerald' },
  { key: 'grades', icon: GraduationCap, title: 'รายงานคะแนนสอบและเกรด', desc: 'คะแนนเก็บ กลางภาค ปลายภาค กิจกรรม คะแนนรวม และเกรด', color: 'violet' },
  { key: 'grading', icon: ClipboardList, title: 'รายงานคะแนนงาน', desc: 'คะแนนส่งงานรายงาน จำนวนงานที่ส่ง/ไม่ส่ง และผลการเรียน', color: 'amber' },
]
const tones = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
}

export default function Reports() {
  const { user } = useAuth()
  const [filters, setFilters] = useState({ scope: 'ALL', classrooms: [], semesters: [], years: [], subjects: [] })
  const [classroomId, setClassroomId] = useState('')
  const [semester, setSemester] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [subjectCode, setSubjectCode] = useState('')
  const [usage, setUsage] = useState(null)
  const [busy, setBusy] = useState('')
  const [metaError, setMetaError] = useState(false)

  const loadMeta = () => {
    setMetaError(false)
    // ตัวกรองมาจาก API ที่แยกตามสิทธิ์แล้ว: ครูได้เฉพาะวิชาในห้องที่ตนสอน, ผู้ดูแลได้ทั้งหมด
    const requests = [api.get('/exports/options').then((res) => setFilters(res.data))]
    if (user.role === 'ADMIN') requests.push(api.get('/admin/usage').then((res) => setUsage(res.data)))
    Promise.all(requests).catch(() => setMetaError(true))
  }
  useEffect(loadMeta, [user.role])

  const query = () => {
    const q = new URLSearchParams()
    if (classroomId) q.set('classroomId', classroomId)
    if (semester) q.set('semester', semester)
    if (academicYear) q.set('academicYear', academicYear)
    if (subjectCode) q.set('subjectCode', subjectCode)
    return q.toString()
  }
  const exportFile = async (key, title) => {
    if (busy) return
    if (key === 'student-scores' && !classroomId)
      return toast('กรุณาเลือกห้องเรียนก่อนดาวน์โหลด', 'error')
    setBusy(key)
    try {
      const selected = filters.classrooms.find((c) => String(c.id) === String(classroomId))
      const fileName = key === 'student-scores'
        ? `${String(selected?.name || 'ชั้นเรียน').replace(/[\\/]/g, '-').replace(/\s+/g, '_')}_สรุปคะแนน.xlsx`
        : `TheachClass-${key}-${Date.now()}.xlsx`
      await downloadFile(`/exports/${key}?${query()}`, fileName)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message: `ดาวน์โหลด${title}สำเร็จ` } }))
    } catch { /* toast handled by interceptor */ } finally { setBusy('') }
  }
  return (
    <>
      <PageHeader title="รายงานและส่งออกข้อมูล" subtitle="สร้างไฟล์ Excel จริงจากข้อมูลในฐานข้อมูล พร้อมตัวกรองตามห้องเรียน ภาคเรียน ปีการศึกษา และรายวิชา" />
      {metaError && <Card className="mb-5 border-rose-200 p-4 dark:border-rose-500/25"><ErrorState message="ไม่สามารถโหลดตัวเลือกตัวกรองได้" onRetry={loadMeta} /></Card>}
      <Card className="mb-5 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><Filter className="h-4 w-4 text-blue-500" /> ตัวกรองข้อมูล</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="ห้องเรียน" value={classroomId} onChange={(e) => setClassroomId(e.target.value)}><option value="">ทุกห้องเรียน</option>{filters.classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="ภาคเรียน" value={semester} onChange={(e) => setSemester(e.target.value)}><option value="">ทุกภาคเรียน</option>{filters.semesters.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Select label="ปีการศึกษา" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}><option value="">ทุกปีการศึกษา</option>{filters.years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          <Select label={user.role === 'TEACHER' ? 'รายวิชาที่คุณสอน' : 'รายวิชา'} value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)}><option value="">ทุกรายวิชา</option>{filters.subjects.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}</Select>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Info className="h-4 w-4 text-blue-500" /> จะส่งออก: {filters.classrooms.length} ห้องเรียน · นักเรียน {filters.classrooms.reduce((n, c) => n + (c._count?.enrollments || 0), 0)} คน {semester && `· ภาคเรียน ${semester}`} {academicYear && `· ปี ${academicYear}`} {subjectCode && `· วิชา ${subjectCode}`}</p>
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
          {user.role === 'TEACHER'
            ? 'เฉพาะวิชา/ห้องที่คุณเป็นครูผู้สอนเท่านั้น — ระบบตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์อีกชั้น'
            : 'ผู้ดูแลสามารถเลือกส่งออกได้ทุกวิชาในระบบ'}
        </p>
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">รายงาน “สรุปคะแนนนักเรียนทุกคน” ต้องเลือกห้องเรียน และไฟล์จะตั้งชื่อตามห้องเรียนที่เลือก</p>
      </Card>

      {usage && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="ครั้งที่เข้าสู่ระบบ" value={usage.logins} tone="blue" />
        <StatCard icon={ClipboardCheck} label="ครั้งที่เช็กชื่อ" value={usage.checkins} tone="green" />
        <StatCard icon={ClipboardList} label="ครั้งที่ส่งงาน" value={usage.submissions} tone="amber" />
        <StatCard icon={GraduationCap} label="ครั้งที่เปลี่ยนคะแนน" value={usage.gradeChanges} tone="violet" />
      </div>}

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon
          return <Card key={r.key} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[r.color]}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0"><h3 className="font-bold text-slate-900 dark:text-white">{r.title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{r.desc}</p></div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
              <span className="text-xs text-slate-400">Excel .xlsx · ภาษาไทย</span>
              <Button size="sm" loading={busy === r.key} disabled={Boolean(busy)} onClick={() => exportFile(r.key, r.title)}><Download className="h-4 w-4" /> ดาวน์โหลด</Button>
            </div>
          </Card>
        })}
      </div>

      {user.role === 'ADMIN' && <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
        ต้องการสำรองข้อมูลทั้งระบบ? <Link to="/settings" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">ไปที่ตั้งค่าระบบ →</Link>
        {usage && <span className="text-slate-400"> · ข้อมูลล่าสุด {safeThaiDateTime(usage.generatedAt)}</span>}
      </p>}
    </>
  )
}
