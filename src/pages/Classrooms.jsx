import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  School, Users, BookOpen, MapPin, Plus, Settings, Trash2, Pencil,
  ArrowLeft, KeyRound, UserPlus, BellRing, Save, Copy,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Advanced, Avatar, Badge, Button, Card, Confirm, Guide, Input, Loader, Modal, PageHeader, Pagination,
  SearchBox, Select, Table, Textarea, toast,
} from '../components/ui.jsx'
import { thaiDate, bangkokYear } from '../utils.js'

const defaultScales = [
  { grade: 'A', minScore: 80, maxScore: 100 }, { grade: 'B+', minScore: 75, maxScore: 79.99 },
  { grade: 'B', minScore: 70, maxScore: 74.99 }, { grade: 'C+', minScore: 65, maxScore: 69.99 },
  { grade: 'C', minScore: 60, maxScore: 64.99 }, { grade: 'D+', minScore: 55, maxScore: 59.99 },
  { grade: 'D', minScore: 50, maxScore: 54.99 }, { grade: 'F', minScore: 0, maxScore: 49.99 },
]
const emptyClass = (year) => ({
  name: '', subject: '', subjectCode: '', semester: '1', academicYear: String(year || bangkokYear()),
  gpsLat: '', gpsLng: '', gpsRadius: 100, lateAfterMinutes: 15,
  weightAssignment: 30, weightCollection: 20, weightMidterm: 20, weightFinal: 30, weightActivity: 0, weightBonus: 0,
})

/** กันไม่ให้ input ตัวเลขที่ถูกล้างทิ้งกลายเป็น 0 / -0 / NaN */
const normalizeClassroomNumbers = (form) => {
  const payload = { ...form }
  const ranges = {
    gpsRadius: { label: 'รัศมีเช็กชื่อ', min: 10 },
    lateAfterMinutes: { label: 'นาทีก่อนถือว่าสาย', min: 0 },
    gpsLat: { label: 'ละติจูด', min: -90, max: 90, nullable: true },
    gpsLng: { label: 'ลองจิจูด', min: -180, max: 180, nullable: true },
  }
  for (const [key, rule] of Object.entries(ranges)) {
    const raw = payload[key]
    if (raw === '' || raw == null) {
      if (rule.nullable) payload[key] = null
      else delete payload[key] // ปล่อยให้เซิร์ฟเวอร์ใช้ค่าเดิม/ค่าตั้งต้น
      continue
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < rule.min || (rule.max != null && value > rule.max))
      return { error: `${rule.label}ไม่ถูกต้อง` }
    payload[key] = value
  }
  return { payload }
}

function ClassForm({ open, onClose, onSaved, initial, teachers = [], isAdmin }) {
  const [form, setForm] = useState(initial || emptyClass())
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setForm(initial ? { ...initial } : emptyClass()) }, [open, initial])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const weightKeys = ['weightAssignment', 'weightCollection', 'weightMidterm', 'weightFinal', 'weightActivity', 'weightBonus']
  const weightSum = weightKeys.reduce((s, k) => s + (Number(form[k]) || 0), 0)
  const submit = async (e) => {
    e.preventDefault()
    if (weightSum !== 100) return toast('สัดส่วนคะแนนต้องรวม 100', 'error')
    const { payload, error } = normalizeClassroomNumbers(form)
    if (error) return toast(error, 'error')
    setSaving(true)
    try {
      if (initial) await api.patch(`/classrooms/${initial.id}`, payload)
      else await api.post('/classrooms', payload)
      toast(initial ? 'อัปเดตห้องเรียนสำเร็จ' : 'สร้างห้องเรียนสำเร็จ')
      onSaved?.()
      onClose()
    } catch { /* toast handled */ } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} wide title={initial ? 'แก้ไขห้องเรียน' : 'สร้างห้องเรียนใหม่'}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button form="class-form" type="submit" loading={saving} disabled={weightSum !== 100} title={weightSum !== 100 ? 'สัดส่วนคะแนนต้องรวม 100' : 'บันทึก'}><Save className="h-4 w-4" /> บันทึก</Button></>}>
      <form id="class-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ชื่อห้องเรียน *" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น ม.5/1 — วิทยาการคอมพิวเตอร์" />
          <Input label="ชื่อวิชา *" required value={form.subject} onChange={(e) => set('subject', e.target.value)} />
          <Input label="รหัสวิชา *" required value={form.subjectCode} onChange={(e) => set('subjectCode', e.target.value)} />
          {isAdmin && <Select label="ครูผู้สอน" value={form.teacherId || ''} onChange={(e) => set('teacherId', Number(e.target.value))}>
            <option value="">— เลือกครู —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </Select>}
          <Input label="ภาคเรียน" value={form.semester} onChange={(e) => set('semester', e.target.value)} />
          <Input label="ปีการศึกษา" value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)} />
        </div>
        <Advanced title="ตั้งค่าการเช็กชื่อ (GPS)" hint="ตอนเปิดรอบระบบจะใช้พิกัดปัจจุบันของครูอยู่แล้ว">
          <p className="mb-3 text-xs text-slate-500">พิกัดด้านล่างเป็นค่าสำรองสำหรับข้อมูลเดิม/กรณีอ่าน GPS ไม่ได้ ไม่ต้องกรอกก็ได้</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input label="ละติจูด (สำรอง)" type="number" step="any" value={form.gpsLat} onChange={(e) => set('gpsLat', e.target.value)} placeholder="13.7563" />
            <Input label="ลองจิจูด (สำรอง)" type="number" step="any" value={form.gpsLng} onChange={(e) => set('gpsLng', e.target.value)} placeholder="100.5018" />
            <Input label="รัศมี (เมตร)" type="number" min="10" value={form.gpsRadius} onChange={(e) => set('gpsRadius', e.target.value)} />
            <Input label="สายหลัง (นาที)" type="number" min="0" value={form.lateAfterMinutes} onChange={(e) => set('lateAfterMinutes', e.target.value)} />
          </div>
        </Advanced>
        <Advanced title="สัดส่วนคะแนน" hint="ต้องรวมให้ได้ 100">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['weightAssignment', 'งาน'], ['weightCollection', 'เก็บคะแนน'], ['weightMidterm', 'กลางภาค'],
              ['weightFinal', 'ปลายภาค'], ['weightActivity', 'กิจกรรม'], ['weightBonus', 'พิเศษ'],
            ].map(([k, label]) => <Input key={k} label={label} type="number" min="0" max="100" value={form[k]} onChange={(e) => set(k, e.target.value)} />)}
          </div>
          <p className={`mt-2 text-xs font-semibold ${weightSum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>รวม {weightSum} / 100 {weightSum !== 100 && '· ปรับให้ครบ 100 ก่อนบันทึก'}</p>
        </Advanced>
      </form>
    </Modal>
  )
}

function ListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [allItems, setAllItems] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [semester, setSemester] = useState('')
  const [year, setYear] = useState('')
  const [subject, setSubject] = useState('')
  const [academics, setAcademics] = useState({ semesters: [], years: [], subjects: [] })
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const canManage = ['ADMIN', 'TEACHER'].includes(user.role)

  const load = () => {
    setLoading(true)
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (semester) q.set('semester', semester)
    if (year) q.set('academicYear', year)
    if (subject) q.set('subjectCode', subject)
    api.get(`/classrooms?${q}`).then((res) => setItems(res.data)).finally(() => setLoading(false))
  }
  const loadOptions = () => {
    api.get('/classrooms').then((res) => setAllItems(res.data)).catch(() => {})
  }
  useEffect(() => { load() }, [search, semester, year, subject])
  useEffect(() => { loadOptions() }, [])
  useEffect(() => {
    if (user.role === 'ADMIN') api.get('/users?role=TEACHER&status=ACTIVE&limit=100').then((res) => setTeachers(res.data.items)).catch(() => {})
  }, [user.role])

  useEffect(() => {
    setAcademics({
      semesters: [...new Set(allItems.map((c) => c.semester))].sort(),
      years: [...new Set(allItems.map((c) => c.academicYear))].sort().reverse(),
      subjects: [...new Map(allItems.map((c) => [c.subjectCode, { code: c.subjectCode, name: c.subject }])).values()],
    })
  }, [allItems])

  const filtered = useMemo(() => items, [items])
  const perPage = 9
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const shown = filtered.slice((page - 1) * perPage, page * perPage)
  useEffect(() => { setPage(1) }, [search, semester, year, subject])

  const join = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/classrooms/join', { joinCode })
      toast(res.message)
      setJoinOpen(false); setJoinCode(''); load(); loadOptions()
    } catch { /* handled */ }
  }

  return (
    <>
      <PageHeader title="ห้องเรียน"
        subtitle={user.role === 'ADMIN' ? 'ผู้ดูแลเห็นทุกห้องเรียนในระบบ'
          : user.role === 'TEACHER' ? 'เฉพาะห้องเรียนที่คุณสร้าง — ครูคนอื่นไม่เห็น'
            : 'ห้องเรียนที่คุณเข้าร่วม'}
        actions={canManage
          ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> สร้างห้องเรียน</Button>
          : <Button onClick={() => setJoinOpen(true)}><KeyRound className="h-4 w-4" /> เข้าร่วมด้วยรหัส</Button>} />
      <Guide steps={user.role === 'TEACHER'
        ? ['สร้างห้องเรียนของคุณเอง — ระบบจะตั้งให้คุณเป็นครูเจ้าของห้องทันที', 'คุณเห็นเฉพาะห้องที่คุณสร้าง ครูคนอื่นไม่เห็นและแก้ไขไม่ได้', 'นำรหัสเข้าห้องเรียนไปให้นักเรียนกรอกในหน้าของพวกเขา']
        : user.role === 'ADMIN'
          ? ['สร้างห้องเรียนแล้วเลือกครูผู้สอนที่เป็นเจ้าของห้อง', 'ครูจะเห็นเฉพาะห้องที่ตนเองเป็นเจ้าของ', 'คุณในฐานะผู้ดูแลเห็นและจัดการได้ทุกห้อง']
          : ['ขอรหัสเข้าห้องเรียนจากครูผู้สอน', 'กด “เข้าร่วมด้วยรหัส” แล้วกรอกรหัส', 'เปิดการ์ดห้องเรียนเพื่อดูงานและประกาศ']} />
      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อห้องเรียน / วิชา / รหัส..." />
          <Select value={semester} onChange={(e) => setSemester(e.target.value)} className="lg:w-36">
            <option value="">ทุกภาคเรียน</option>
            {academics.semesters.map((s) => <option key={s} value={s}>ภาคเรียน {s}</option>)}
          </Select>
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="lg:w-36">
            <option value="">ทุกปีการศึกษา</option>
            {academics.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="lg:w-52">
            <option value="">ทุกรายวิชา</option>
            {academics.subjects.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </Select>
          <span className="ml-auto text-xs text-slate-400">ทั้งหมด {filtered.length} ห้อง</span>
        </div>
      </Card>
      {loading ? <Loader /> : shown.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <Card key={c.id} className="group transition hover:border-slate-300 dark:hover:border-slate-600">
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{c.subjectCode} · {c.code}</p>
                    <h3 className="mt-1 truncate font-bold text-slate-900 dark:text-white">{c.name}</h3>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"><School className="h-5 w-5" /></div>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.subject}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-600 dark:bg-slate-700/40">ภาคเรียน {c.semester}/{c.academicYear}</span>
                  <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-700/40"><Users className="h-3 w-3" /> {c._count.enrollments} คน</span>
                  <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-700/40"><BookOpen className="h-3 w-3" /> {c._count.assignments} งาน</span>
                </div>
                <p className="mt-3 truncate text-xs text-slate-400">ครู {c.teacher?.firstName} {c.teacher?.lastName}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Button size="sm" onClick={() => navigate(`/classrooms/${c.id}`)}>เปิดห้องเรียน</Button>
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" title="แก้ไขข้อมูลห้องเรียน" onClick={() => { setEditing(c); setFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /><span className="hidden xl:inline">แก้ไข</span></Button>
                      <Button size="sm" variant="ghost" title="ตั้งค่าห้องเรียน" onClick={() => navigate(`/classrooms/${c.id}?tab=settings`)}><Settings className="h-3.5 w-3.5" /><span className="hidden xl:inline">ตั้งค่า</span></Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : <Card className="p-12 text-center text-slate-400">ไม่พบห้องเรียนตามเงื่อนไขที่เลือก</Card>}
      <div className="mt-5"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>

      <ClassForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} teachers={teachers} isAdmin={user.role === 'ADMIN'} onSaved={() => { load(); loadOptions() }} />
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="เข้าร่วมห้องเรียน"
        footer={<Button form="join-form" type="submit">เข้าร่วม</Button>}>
        <form id="join-form" onSubmit={join} className="space-y-3">
          <Input label="รหัสเข้าห้องเรียน" required value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="เช่น JOIN001" />
          <p className="text-xs text-slate-500">ขอรหัสจากครูผู้สอน แล้วกรอกที่นี่เพื่อเข้าร่วมห้องเรียน</p>
        </form>
      </Modal>
    </>
  )
}

function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const setTab = (next) => setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true })
  const [data, setData] = useState(null)
  const [students, setStudents] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [gradeData, setGradeData] = useState(null)
  const [memberId, setMemberId] = useState('')
  const [announcement, setAnnouncement] = useState(null)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const canManage = ['ADMIN', 'TEACHER'].includes(user.role) && (user.role === 'ADMIN' || data?.teacher?.id === user.id)

  const load = () => {
    api.get(`/classrooms/${id}`).then((res) => setData(res.data)).catch(() => navigate('/classrooms'))
    if (canManage) {
      api.get(`/classrooms/${id}/students`).then((res) => setStudents(res.data)).catch(() => {})
      api.get(`/grades/classroom/${id}`).then((res) => setGradeData(res.data)).catch(() => {})
    }
    api.get(`/announcements?classroomId=${id}`).then((res) => setAnnouncements(res.data)).catch(() => {})
  }
  useEffect(() => { load() }, [id])
  useEffect(() => {
    if (!canManage) return
    if (!students.length) api.get(`/classrooms/${id}/students`).then((res) => setStudents(res.data)).catch(() => {})
    if (!gradeData) api.get(`/grades/classroom/${id}`).then((res) => setGradeData(res.data)).catch(() => {})
  }, [id, canManage])

  const addMember = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const res = await api.post(`/classrooms/${id}/members`, { identifier: memberId })
      toast(res.message); setMemberId(''); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const removeMember = async () => {
    setBusy(true)
    try { const res = await api.delete(`/classrooms/${id}/members/${confirm.id}`); toast(res.message); setConfirm(null); load() }
    catch { /* handled */ } finally { setBusy(false) }
  }
  const saveAnnouncement = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      if (announcement?.id) await api.patch(`/announcements/${announcement.id}`, announcement)
      else await api.post('/announcements', { ...announcement, classroomId: Number(id) })
      toast('บันทึกประกาศสำเร็จ'); setAnnouncementOpen(false); setAnnouncement(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }

  useEffect(() => { if (data && !canManage && tab !== 'overview') setTab('overview') }, [data, canManage])

  if (!data) return <Loader />
  const tabs = [
    ['overview', 'ภาพรวม'],
    ...(canManage ? [['students', 'สมาชิก'], ['settings', 'ตั้งค่า'], ['announcements', 'ประกาศ']] : []),
  ]

  return (
    <>
      <PageHeader title={data.name} subtitle={`${data.subjectCode} · ${data.subject} · ภาคเรียน ${data.semester}/${data.academicYear} · ครู ${data.teacher?.firstName} ${data.teacher?.lastName}`}
        actions={<Button variant="secondary" onClick={() => navigate('/classrooms')}><ArrowLeft className="h-4 w-4" /> กลับ</Button>} />
      <Guide steps={canManage
        ? ['ดูภาพรวม งาน และประกาศได้ที่แท็บด้านล่าง', 'เพิ่มนักเรียนด้วยรหัสนักเรียนหรืออีเมลที่แท็บ “สมาชิก”', 'ตั้งค่า GPS และสัดส่วนคะแนนได้ที่แท็บ “ตั้งค่า”']
        : ['ดูงานและกำหนดส่งได้จากการ์ด “งานล่าสุด”', 'อ่านประกาศของครูได้จากการ์ดด้านขวา', 'เช็กชื่อได้จากเมนู “เช็กชื่อ / การเข้าเรียน”']} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}
        {canManage && <span className="ml-auto rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          รหัสเข้าห้องเรียน: <span className="select-all font-mono">{data.joinCode || '—'}</span>
          {data.joinCode && <button title="คัดลอกรหัสไปให้นักเรียน" onClick={() => { navigator.clipboard?.writeText(data.joinCode); toast('คัดลอกรหัสแล้ว') }} className="ml-2"><Copy className="inline h-3.5 w-3.5" /></button>}
        </span>}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center"><p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{data._count.enrollments}</p><p className="text-xs text-slate-500">นักเรียน</p></Card>
              <Card className="p-4 text-center"><p className="text-2xl font-bold text-violet-600 dark:text-violet-300">{data._count.assignments}</p><p className="text-xs text-slate-500">งาน</p></Card>
              <Card className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{data._count.attendances}</p><p className="text-xs text-slate-500">บันทึกเช็กชื่อ</p></Card>
            </div>
            <Card className="p-5">
              <h2 className="mb-3 font-semibold text-slate-800 dark:text-white">งานล่าสุด</h2>
              {data.assignments?.length ? data.assignments.map((a) => (
                <Link key={a.id} to={`/assignments/${a.id}`} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0 hover:text-blue-600 dark:border-slate-700">
                  <BookOpen className="h-4 w-4 text-blue-500" /><span className="flex-1 text-sm">{a.title}</span>
                  <Badge status={a.isOpen ? 'ACTIVE' : 'SUSPENDED'}>{a.isOpen ? 'เปิดรับ' : 'ปิดรับ'}</Badge>
                  <span className="text-xs text-slate-400">{thaiDate(a.dueAt)}</span>
                </Link>
              )) : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีงาน</p>}
              {canManage && <Button size="sm" className="mt-3" onClick={() => navigate('/assignments')}><Plus className="h-4 w-4" />จัดการงาน</Button>}
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><BellRing className="h-4 w-4 text-amber-500" /> ประกาศล่าสุด</h2>
              {data.announcements?.slice(0, 5).map((a) => (
                <div key={a.id} className="mb-3 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.pinned && <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">ปักหมุด</span>}{a.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{a.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{thaiDate(a.createdAt)}</p>
                </div>
              ))}
              {!data.announcements?.length && <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีประกาศ</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><MapPin className="h-4 w-4 text-blue-500" /> ข้อมูลเช็กชื่อ</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">รูปแบบ: <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">เปิดเป็นรอบเมื่อต้องการ</Badge></p>
              <p className="mt-2 text-xs text-slate-500">ระบบจะใช้ตำแหน่งปัจจุบันของครูตอนเปิดรอบเป็นจุดอ้างอิง</p>
              <p className="mt-1 text-xs text-slate-500">รัศมี {data.gpsRadius} เมตร · สายหลัง {data.lateAfterMinutes} นาที</p>
              <Button size="sm" className="mt-3" onClick={() => navigate('/attendance')}>ไปเปิดรอบเช็กชื่อ</Button>
            </Card>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <Card className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-white">สมาชิกในห้องเรียน ({students.length})</h2>
            {canManage && <form onSubmit={addMember} className="flex gap-2">
              <Input placeholder="รหัสนักเรียนหรืออีเมล" value={memberId} onChange={(e) => setMemberId(e.target.value)} required className="sm:w-64" />
              <Button type="submit" loading={busy}><UserPlus className="h-4 w-4" /> เพิ่ม</Button>
            </form>}
          </div>
          <Table headers={['ชื่อ-นามสกุล', 'รหัสนักเรียน', 'อีเมล', 'เข้าเรียน', 'ส่งงาน', '', '']} empty={!students.length}>
            {students.map((s) => <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar user={s} size="md" />
                  <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{s.firstName} {s.lastName}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{s.studentId || '—'}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{s.email}</td>
              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{s.attendance?.percentage ?? 0}% ({s.attendance?.present ?? 0}/{s.attendance?.total ?? 0})</td>
              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{s.assignments?.submitted ?? 0} ส่ง / {s.assignments?.graded ?? 0} ตรวจแล้ว</td>
              <td className="px-4 py-3"><Badge status={s.status} /></td>
              <td className="px-4 py-3">{canManage && <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: s.id, name: `${s.firstName} ${s.lastName}` })}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}</td>
            </tr>)}
          </Table>
        </Card>
      )}

      {tab === 'announcements' && canManage && (
        <Card className="p-5">
          <div className="mb-4 flex justify-between"><h2 className="font-semibold text-slate-800 dark:text-white">ประกาศ ({announcements.length})</h2>
            <Button size="sm" onClick={() => { setAnnouncement({ title: '', body: '', pinned: false }); setAnnouncementOpen(true) }}><Plus className="h-4 w-4" /> เขียนประกาศ</Button></div>
          <div className="space-y-3">
            {announcements.map((a) => <div key={a.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4 dark:border-slate-700">
              <div className="flex-1"><p className="font-semibold text-slate-800 dark:text-white">{a.pinned && <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">ปักหมุด</span>}{a.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{a.body}</p>
                <p className="mt-2 text-xs text-slate-400">{a.author?.firstName} {a.author?.lastName} · {thaiDate(a.createdAt)}</p></div>
              <Button size="sm" variant="ghost" onClick={() => { setAnnouncement({ ...a }); setAnnouncementOpen(true) }}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm({ announcementId: a.id })}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
            </div>)}
            {!announcements.length && <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีประกาศ</p>}
          </div>
        </Card>
      )}

      {tab === 'settings' && canManage && gradeData && (
        <SettingsTab data={data} gradeData={gradeData} reload={load} onDelete={() => setConfirm({ classroomId: Number(id) })} />
      )}

      <Modal open={announcementOpen} onClose={() => setAnnouncementOpen(false)} title={announcement?.id ? 'แก้ไขประกาศ' : 'เขียนประกาศ'}
        footer={<><Button variant="secondary" onClick={() => setAnnouncementOpen(false)}>ยกเลิก</Button><Button form="ann-form" loading={busy} type="submit">เผยแพร่</Button></>}>
        <form id="ann-form" onSubmit={saveAnnouncement} className="space-y-3">
          <Input label="หัวข้อ" required value={announcement?.title || ''} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })} />
          <Textarea label="เนื้อหา" rows={5} required value={announcement?.body || ''} onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={Boolean(announcement?.pinned)} onChange={(e) => setAnnouncement({ ...announcement, pinned: e.target.checked })} /> ปักหมุดประกาศนี้</label>
        </form>
      </Modal>
      <Confirm open={Boolean(confirm)} onClose={() => setConfirm(null)} loading={busy}
        title={confirm?.classroomId ? 'ลบห้องเรียน' : confirm?.announcementId ? 'ลบประกาศ' : 'นำนักเรียนออก'}
        message={confirm?.classroomId ? 'ห้องเรียนและข้อมูลทั้งหมดจะถูกลบถาวร ต้องการดำเนินการต่อหรือไม่?' : `ต้องการ${confirm?.announcementId ? 'ลบประกาศนี้' : `นำ ${confirm?.name} ออกจากห้องเรียน`}ใช่หรือไม่?`}
        onConfirm={async () => {
          setBusy(true)
          try {
            if (confirm.classroomId) { const r = await api.delete(`/classrooms/${id}`); toast(r.message); navigate('/classrooms') }
            else if (confirm.announcementId) { const r = await api.delete(`/announcements/${confirm.announcementId}`); toast(r.message) }
            else await removeMember()
            setConfirm(null); load()
          } catch { /* handled */ } finally { setBusy(false) }
        }} />
    </>
  )
}

function SettingsTab({ data, gradeData, reload, onDelete }) {
  const [form, setForm] = useState({
    name: data.name, subject: data.subject, subjectCode: data.subjectCode,
    semester: data.semester, academicYear: data.academicYear,
    gpsLat: data.gpsLat ?? '', gpsLng: data.gpsLng ?? '', gpsRadius: data.gpsRadius,
    lateAfterMinutes: data.lateAfterMinutes,
  })
  const [weights, setWeights] = useState(gradeData.classroom.weights)
  const [scales, setScales] = useState(gradeData.scales.map(({ grade, minScore, maxScore }) => ({ grade, minScore, maxScore })))
  const [busy, setBusy] = useState(false)
  const weightSum = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0)

  const saveGeneral = async (e) => {
    e.preventDefault()
    const { payload, error } = normalizeClassroomNumbers(form)
    if (error) return toast(error, 'error')
    setBusy(true)
    try { const r = await api.patch(`/classrooms/${data.id}`, payload); toast(r.message); reload() }
    catch { /* handled */ } finally { setBusy(false) }
  }
  const saveWeights = async (e) => {
    e.preventDefault()
    if (Object.values(weights).some((v) => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100))
      return toast('สัดส่วนคะแนนแต่ละหมวดต้องเป็นตัวเลข 0–100', 'error')
    if (weightSum !== 100) return toast('สัดส่วนคะแนนต้องรวม 100', 'error')
    setBusy(true)
    try { const r = await api.patch(`/grades/classroom/${data.id}/weights`, weights); toast(r.message); reload() }
    catch { /* handled */ } finally { setBusy(false) }
  }
  const saveScales = async (e) => {
    e.preventDefault()
    const invalid = scales.some((s) => !String(s.grade).trim() || s.minScore === '' || s.maxScore === ''
      || !Number.isFinite(Number(s.minScore)) || !Number.isFinite(Number(s.maxScore))
      || Number(s.minScore) > Number(s.maxScore))
    if (!scales.length || invalid) return toast('เกณฑ์ตัดเกรดไม่ถูกต้อง กรุณากรอกเกรดและช่วงคะแนนให้ครบ', 'error')
    setBusy(true)
    try { const r = await api.put(`/grades/classroom/${data.id}/scales`, { scales }); toast(r.message); reload() }
    catch { /* handled */ } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-semibold text-slate-800 dark:text-white">ข้อมูลทั่วไป</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">แก้ชื่อห้อง รายวิชา และภาคเรียน (เช็กชื่อเปิดเป็นรอบในหน้าเช็กชื่อ)</p>
        <form onSubmit={saveGeneral} className="max-w-3xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="ชื่อห้องเรียน" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="ชื่อวิชา" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <Input label="รหัสวิชา" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value })} />
            <Input label="ภาคเรียน" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
            <Input label="ปีการศึกษา" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
          </div>
          <Advanced title="ค่าตั้งต้นการเช็กชื่อ (GPS)" hint="ตอนเปิดรอบระบบจะใช้พิกัดปัจจุบันของครู">
            <p className="mb-3 text-xs text-slate-500">ค่าด้านล่างเป็นค่าสำรองสำหรับข้อมูลเดิม ไม่ต้องเปิดเช็กชื่อที่นี่</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="รัศมีเช็กชื่อ (เมตร)" type="number" min="10" value={form.gpsRadius} onChange={(e) => setForm({ ...form, gpsRadius: e.target.value })} />
              <Input label="นาทีก่อนถือว่าสาย" type="number" min="0" value={form.lateAfterMinutes} onChange={(e) => setForm({ ...form, lateAfterMinutes: e.target.value })} />
              <Input label="ละติจูด (สำรอง)" type="number" step="any" value={form.gpsLat} onChange={(e) => setForm({ ...form, gpsLat: e.target.value })} />
              <Input label="ลองจิจูด (สำรอง)" type="number" step="any" value={form.gpsLng} onChange={(e) => setForm({ ...form, gpsLng: e.target.value })} />
            </div>
          </Advanced>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึกข้อมูลทั่วไป</Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-slate-800 dark:text-white">สัดส่วนคะแนน</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">สัดส่วนต้องรวม 100 ระบบจะคำนวณคะแนนรวมและเกรดใหม่ทันที</p>
        <form onSubmit={saveWeights} className="max-w-2xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(weights).map(([k, v]) => <Input key={k} label={{ ASSIGNMENT: 'คะแนนงาน', COLLECTION: 'คะแนนเก็บ', MIDTERM: 'กลางภาค', FINAL: 'ปลายภาค', ACTIVITY: 'กิจกรรม', BONUS: 'คะแนนพิเศษ' }[k]} type="number" min="0" max="100" value={v} onChange={(e) => setWeights({ ...weights, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />)}
          </div>
          <p className={`text-sm font-semibold ${weightSum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>รวม {weightSum} / 100 {weightSum !== 100 && '· ปรับให้ครบ 100 ก่อนบันทึก'}</p>
          <Button type="submit" loading={busy} disabled={weightSum !== 100}><Save className="h-4 w-4" /> บันทึกสัดส่วนคะแนน</Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-slate-800 dark:text-white">เกณฑ์ตัดเกรด</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">กำหนดช่วงคะแนนของแต่ละเกรด ระบบจะตัดเกรดให้อัตโนมัติ</p>
        <form onSubmit={saveScales} className="max-w-2xl space-y-3">
          <div className="space-y-2">
            {scales.map((s, i) => <div key={i} className="grid grid-cols-3 gap-2">
              <Input value={s.grade} onChange={(e) => setScales(scales.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))} />
              <Input type="number" step="0.01" value={s.minScore} onChange={(e) => setScales(scales.map((x, j) => j === i ? { ...x, minScore: e.target.value === '' ? '' : Number(e.target.value) } : x))} />
              <Input type="number" step="0.01" value={s.maxScore} onChange={(e) => setScales(scales.map((x, j) => j === i ? { ...x, maxScore: e.target.value === '' ? '' : Number(e.target.value) } : x))} />
            </div>)}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setScales([...scales, { grade: '', minScore: 0, maxScore: 0 }])}><Plus className="h-4 w-4" /> เพิ่มเกณฑ์</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setScales(defaultScales.map((s) => ({ ...s })))}>ใช้ค่ามาตรฐาน</Button>
          <div><Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึกเกณฑ์ตัดเกรด</Button></div>
        </form>
      </Card>

      <Card className="border-rose-200 p-5 dark:border-rose-500/30">
        <h2 className="font-semibold text-rose-700 dark:text-rose-300">ลบห้องเรียน</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">ห้องเรียนและข้อมูลที่เกี่ยวข้องจะถูกลบถาวร ไม่สามารถกู้คืนได้</p>
        <Button variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /> ลบห้องเรียน</Button>
      </Card>
    </div>
  )
}

export default function Classrooms() {
  const { id } = useParams()
  return id ? <DetailPage /> : <ListPage />
}
