import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  MapPin, ClipboardCheck, Search, Clock, History, CheckCircle2,
  AlertTriangle, Download, CalendarDays, ShieldAlert, Navigation, Ban, Check,
  CalendarClock, FileText, Send, ImagePlus, Stethoscope, BriefcaseBusiness, Clock3,
} from 'lucide-react'
import { api, downloadFile } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Badge, Button, Card, Countdown, EmptyState, ErrorState, Guide, Input, Loader, Modal, PageHeader,
  Pagination, SearchBox, Select, StatCard, Table, Textarea, toast,
} from '../components/ui.jsx'
import { thaiDateTime, bangkokToday } from '../utils.js'

const STATUS_ORDER = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE']
const STATUS_LABEL = { PRESENT: 'มาเรียน', LATE: 'มาสาย', ABSENT: 'ขาดเรียน', LEAVE: 'ลา' }
const LEAVE_LABEL = { PENDING: 'รอครูตรวจ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' }
const leaveBadgeClass = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function LeaveBadge({ status }) {
  return <Badge className={leaveBadgeClass[status]}>{LEAVE_LABEL[status] || status}</Badge>
}

const LEAVE_TYPES = [
  { value: 'SICK', label: 'ลาป่วย', icon: Stethoscope },
  { value: 'PERSONAL', label: 'ลากิจ', icon: BriefcaseBusiness },
]
const LEAVE_TYPE_LABEL = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', OTHER: 'ลาทั่วไป' }
const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

/** แสดงประเภทและช่วงเวลาของคำร้อง (OTHER = คำร้องเก่าที่ยังไม่ได้เลือกประเภท) */
function LeaveMeta({ leave }) {
  return <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {LEAVE_TYPE_LABEL[leave.leaveType] || LEAVE_TYPE_LABEL.OTHER}
    </span>
    {leave.isHourly && <span className="flex items-center gap-1 text-blue-600 dark:text-blue-300">
      <Clock3 className="h-3 w-3" /> ลารายชั่วโมง {leave.startTime}–{leave.endTime} น.
    </span>}
  </p>
}

/** รูปที่แนบในคำร้องลา — กดเพื่อขยาย (ไฟล์ Endpoint ตรวจสิทธิ์และแสดงผลแบบ inline) */
function LeaveImages({ files = [] }) {
  if (!files.length) return null
  return <div className="mt-2 flex flex-wrap gap-2">
    {files.map((f, i) => <a key={f.url || i} href={f.url} target="_blank" rel="noreferrer" title={f.name || 'รูปแนบคำร้องลา'} className="rounded-lg border border-slate-200 p-0.5 transition hover:border-blue-400 dark:border-slate-600">
      <img src={f.url} alt={f.name || 'รูปแนบคำร้องลา'} loading="lazy" className="h-12 w-12 rounded-md object-cover" />
    </a>)}
  </div>
}

/** อัปโหลดรูปก่อนส่งคำร้อง (ใช้ /api/upload เหมือนไฟล์แนบงาน แต่จำกัดเป็นรูปภาพ) */
function LeaveImageUploader({ images, onChange, onBusyChange }) {
  const [uploading, setUploading] = useState(false)
  // ใช้ URL เครื่อง.local แสดงตัวอย่างก่อนบันทึกคำร้อง (ไฟล์ยังไม่มีสิทธิ์ให้เปิดผ่าน /api/files)
  const previews = useRef([])
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const upload = async (e) => {
    const list = [...e.target.files]
    e.target.value = ''
    if (!list.length) return
    const room = 3 - images.length
    if (room <= 0) return toast('แนบรูปภาพได้ไม่เกิน 3 รูป', 'error')
    const picked = list.slice(0, room)
    const localUrls = picked.map((f) => URL.createObjectURL(f))
    previews.current.push(...localUrls)
    setUploading(true); onBusyChange?.(true)
    try {
      const fd = new FormData()
      picked.forEach((f) => fd.append('files', f))
      const res = await api.post('/upload', fd)
      onChange([...images, ...res.data.map((f, i) => ({ ...f, preview: localUrls[i] }))])
      if (list.length > room) toast(`แนบได้ไม่เกิน 3 รูป จึงเพิ่มเพียง ${room} รูป`, 'error')
    } catch { /* handled */ } finally { setUploading(false); onBusyChange?.(false) }
  }
  return <div>
    <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-600 dark:hover:bg-blue-500/10 ${uploading || images.length >= 3 ? 'opacity-60' : ''}`}>
      <ImagePlus className="h-5 w-5 text-blue-500" />
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{uploading ? 'กำลังอัปโหลดรูป...' : 'แนบรูปใบรับรอง / หลักฐาน (ไม่บังคับ)'}</span>
      <span className="text-xs text-slate-400">PNG, JPG, GIF, WEBP · ไม่เกิน 3 รูป · 20MB ต่อรูป</span>
      <input type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={upload} className="hidden" disabled={uploading || images.length >= 3} />
    </label>
    {!!images.length && <div className="mt-2 flex flex-wrap gap-2">
      {images.map((f, i) => <div key={f.url || i} className="relative">
        <img src={f.preview || f.url} alt={f.name || 'รูปที่แนบ'} className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-600" />
        <button type="button" title="ลบรูป" onClick={() => onChange(images.filter((_, j) => j !== i))}
          className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white shadow">×</button>
      </div>)}
    </div>}
  </div>
}

function StudentAttendance() {
  const [today, setToday] = useState(bangkokToday())
  // เปิดหน้าไว้ข้ามเที่ยงคืนยังนับ "วันนี้" ให้ถูกต้อง
  useEffect(() => {
    const refreshDay = () => setToday(bangkokToday())
    window.addEventListener('focus', refreshDay)
    document.addEventListener('visibilitychange', refreshDay)
    return () => {
      window.removeEventListener('focus', refreshDay)
      document.removeEventListener('visibilitychange', refreshDay)
    }
  }, [])
  const [loadError, setLoadError] = useState(false)
  const [classrooms, setClassrooms] = useState([])
  const [selected, setSelected] = useState('')
  const [history, setHistory] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [leaves, setLeaves] = useState([])
  const [locating, setLocating] = useState(false)
  const [consent, setConsent] = useState(localStorage.getItem('cf-gps-consent') === 'true')
  const [result, setResult] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveUploading, setLeaveUploading] = useState(false)
  const [cancelBusyId, setCancelBusyId] = useState(null)
  const [leaveForm, setLeaveForm] = useState({
    classroomId: '', date: today, reason: '', attachments: [],
    leaveType: '', isHourly: false, startTime: '', endTime: '',
  })

  const load = () => {
    Promise.all([
      api.get('/classrooms'),
      api.get('/attendance/me' + (selected ? `?classroomId=${selected}` : '')),
      api.get('/attendance/sessions/active'),
      api.get('/leaves?limit=20'),
    ]).then(([classRes, historyRes, sessionRes, leaveRes]) => {
      setClassrooms(classRes.data)
      if (!selected && classRes.data.length) setSelected(String(classRes.data[0].id))
      setHistory(historyRes.data)
      setActiveSessions(sessionRes.data)
      setLeaves(leaveRes.data.items)
      setLoadError(false)
    }).catch(() => setLoadError(true))
  }
  useEffect(() => { load() }, [selected])
  useEffect(() => {
    if (selected && !leaveForm.classroomId) setLeaveForm((f) => ({ ...f, classroomId: String(selected) }))
  }, [selected])

  const active = activeSessions.find((s) => s.classroomId === Number(selected))

  const checkin = () => {
    if (!consent) return toast('กรุณายืนยันการอนุญาตใช้ตำแหน่งก่อนเช็กชื่อ', 'error')
    if (!selected) return toast('กรุณาเลือกห้องเรียน', 'error')
    if (!active) return toast('ครูยังไม่เปิดรอบเช็กชื่อสำหรับวิชานี้', 'error')
    if (!navigator.geolocation) return toast('เบราว์เซอร์นี้ไม่รองรับ GPS', 'error')
    setLocating(true); setResult(null)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await api.post('/attendance/checkin', {
          classroomId: Number(selected), lat: pos.coords.latitude,
          lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        })
        setResult({ ok: true, message: res.message, data: res.data })
        toast(res.message)
        load()
      } catch (err) {
        setResult({ ok: false, message: err.response?.data?.message || 'เช็กชื่อไม่สำเร็จ', extra: err.response?.data })
      } finally { setLocating(false) }
    }, (err) => {
      setLocating(false)
      toast(err.code === 1 ? 'คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาอนุญาตในเบราว์เซอร์' : 'ไม่สามารถอ่านตำแหน่ง GPS ได้ กรุณาลองใหม่', 'error')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const submitLeave = async (e) => {
    e.preventDefault()
    if (!leaveForm.classroomId) return toast('กรุณาเลือกห้องเรียน', 'error')
    if (!leaveForm.leaveType) return toast('กรุณาเลือกประเภทการลา (ลาป่วย / ลากิจ)', 'error')
    if (leaveUploading) return toast('กรุณารออัปโหลดรูปภาพให้เสร็จก่อนส่งคำร้อง', 'error')
    if (leaveForm.isHourly) {
      if (!leaveForm.startTime || !leaveForm.endTime) return toast('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดของการลา', 'error')
      if (toMinutes(leaveForm.endTime) <= toMinutes(leaveForm.startTime))
        return toast('เวลาสิ้นสุดการลาต้องอยู่หลังเวลาเริ่มต้น', 'error')
    }
    setLeaveBusy(true)
    try {
      const res = await api.post('/leaves', {
        classroomId: Number(leaveForm.classroomId), date: leaveForm.date, reason: leaveForm.reason,
        leaveType: leaveForm.leaveType, isHourly: leaveForm.isHourly,
        startTime: leaveForm.isHourly ? leaveForm.startTime : null,
        endTime: leaveForm.isHourly ? leaveForm.endTime : null,
        // กัน URL ชั่วคราวของตัวอย่าง (blob:) ถูกส่งไปเก็บในฐานข้อมูล
        attachments: leaveForm.attachments.map(({ preview, ...file }) => file),
      })
      toast(res.message)
      setLeaveOpen(false)
      setLeaveForm({
        classroomId: String(selected), date: today, reason: '', attachments: [],
        leaveType: '', isHourly: false, startTime: '', endTime: '',
      })
      load()
    } catch { /* handled */ } finally { setLeaveBusy(false) }
  }

  const cancelLeave = async (id) => {
    if (cancelBusyId) return
    setCancelBusyId(id)
    try { const res = await api.delete(`/leaves/${id}`); toast(res.message); load() }
    catch { /* handled */ } finally { setCancelBusyId(null) }
  }

  const todayRecords = history.filter((h) => h.date === today)
  const present = history.filter((h) => h.status === 'PRESENT').length
  const late = history.filter((h) => h.status === 'LATE').length
  const filtered = history.filter((h) => !search || h.classroom?.name?.includes(search) || h.date.includes(search))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const shown = filtered.slice((page - 1) * 10, page * 10)

  return (
    <>
      <PageHeader title="เช็กชื่อและการเข้าเรียน" subtitle="ระบบใช้ตำแหน่งปัจจุบันของคุณเช็กในรอบที่ครูเปิดไว้ พร้อมแจ้งลาได้ทันที"
        actions={<Button variant="secondary" onClick={() => setLeaveOpen(true)}><FileText className="h-4 w-4" /> แจ้งลา</Button>} />
      <Guide steps={[
        'รอครูเปิดรอบเช็กชื่อในวิชาที่คุณเรียน ระบบจะแจ้งเตือนให้ทราบ',
        'ยืนยันความยินยอม GPS แล้วกดปุ่มเช็กชื่อ ระบบจะอ่านตำแหน่งปัจจุบันให้เอง',
        'หากไม่สามารถมาเรียนได้ ให้กด “แจ้งลา” เลือกประเภทลาป่วย/ลากิจ พร้อมระบุเหตุผล เพื่อให้ครูพิจารณา',
        'กรณีลาเฉพาะบางคาบ ให้ติ๊ก “ลารายชั่วโมง” แล้วระบุช่วงเวลาเริ่ม–สิ้นสุด',
      ]} />
      {loadError && <Card className="mb-5 border-rose-200 p-4 dark:border-rose-500/25"><ErrorState message="ไม่สามารถโหลดข้อมูลการเข้าเรียนได้ กรุณาตรวจสอบการเชื่อมต่อ" onRetry={load} /></Card>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={MapPin} label="เช็กชื่อวันนี้" value={todayRecords.length} tone="blue" />
        <StatCard icon={CheckCircle2} label="มาเรียนสะสม" value={present} tone="green" />
        <StatCard icon={Clock} label="มาสายสะสม" value={late} tone="amber" />
        <StatCard icon={CalendarDays} label="บันทึกทั้งหมด" value={history.length} tone="violet" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><CalendarClock className="h-5 w-5 text-blue-500" /> รอบเช็กชื่อที่เปิดอยู่</h2>
            {activeSessions.length ? <div className="space-y-2">
              {activeSessions.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"><Navigation className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{s.classroom?.name}</p>
                  <p className="text-xs text-slate-500">{s.title} · เปิดเมื่อ {thaiDateTime(s.openedAt)}</p>
                </div>
                <Countdown dueAt={s.closesAt} className="text-xs" />
              </div>)}
            </div> : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีรอบเช็กชื่อเปิดอยู่ในขณะนี้</p>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><Navigation className="h-5 w-5 text-blue-500" /> เช็กชื่อด้วยตำแหน่งปัจจุบัน</h2>
            <Select label="ห้องเรียน" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>)}
            </Select>
            {active && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              เปิดถึง {thaiDateTime(active.closesAt)} · รัศมี {active.gpsRadius} เมตร
            </p>}
            {!active && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              วิชานี้ยังไม่มีรอบเช็กชื่อเปิดอยู่ กรุณารอครูเปิดรอบก่อน
            </p>}
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); localStorage.setItem('cf-gps-consent', String(e.target.checked)) }} className="mt-0.5 h-4 w-4" />
              <span>ข้าพเจ้ายินยอมให้ระบบเก็บตำแหน่ง GPS ขณะเช็กชื่อ เพื่อตรวจว่าอยู่ในพื้นที่ที่ครูกำหนด ข้อมูลจะถูกใช้เพื่อการเช็กชื่อเท่านั้น</span>
            </label>
            <Button className="mt-4 w-full" size="lg" loading={locating} onClick={checkin} disabled={!consent || !selected || !active}>
              <MapPin className="h-5 w-5" /> {locating ? 'กำลังอ่านตำแหน่ง GPS...' : 'เช็กชื่อตอนนี้ (ใช้พิกัดปัจจุบัน)'}
            </Button>
            {result && <div className={`mt-4 rounded-xl border p-4 text-sm ${result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'}`}>
              <p className="flex items-center gap-2 font-semibold">{result.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{result.message}</p>
              {result.ok && <p className="mt-2 text-xs">สถานะ: <Badge status={result.data.status} /> · ระยะห่าง {Math.round(result.data.distanceM)} เมตร</p>}
              {result.extra?.distanceM != null && <p className="mt-1 text-xs">ระยะห่างของคุณ {result.extra.distanceM} เมตรจากจุดที่ครูเปิดรอบ</p>}
              {result.data?.warnings?.length > 0 && <p className="mt-2 text-xs">⚠️ {result.data.warnings.join(', ')}</p>}
            </div>}
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> ระบบตรวจระยะทางจากพิกัดปัจจุบันของอุปกรณ์และตรวจจับความผิดปกติเบื้องต้น ไม่สามารถยืนยันการปลอม GPS ได้ 100%</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-800 dark:text-white">สถานะวันนี้</h2>
            {classrooms.map((c) => {
              const rec = todayRecords.find((r) => r.classroomId === c.id)
              return <div key={c.id} className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-700">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{c.subject}</p><p className="text-xs text-slate-400">{rec ? thaiDateTime(rec.checkinAt || rec.createdAt) : 'ยังไม่เช็กชื่อ'}</p></div>
                {rec ? <Badge status={rec.status} /> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">ยังไม่เช็กชื่อ</span>}
              </div>
            })}
            {!classrooms.length && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีห้องเรียน</p>}
            <Link to="/classrooms" className="mt-2 block text-center text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">เข้าร่วมห้องเรียนด้วยรหัส →</Link>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800 dark:text-white">การลาของฉัน</h2>
              <Button size="sm" variant="outline" onClick={() => setLeaveOpen(true)}><Send className="h-3.5 w-3.5" /> แจ้งลา</Button>
            </div>
            {leaves.length ? leaves.map((l) => <div key={l.id} className="mb-2 rounded-lg border border-slate-100 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{l.classroom?.subject} · {l.date}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{l.reason}</p>
                  <LeaveMeta leave={l} />
                  <LeaveImages files={l.attachments} /></div>
                <LeaveBadge status={l.status} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">ส่งเมื่อ {thaiDateTime(l.createdAt)}</p>
                {l.status === 'PENDING' && <Button size="sm" variant="ghost" loading={cancelBusyId === l.id} disabled={Boolean(cancelBusyId) && cancelBusyId !== l.id} onClick={() => cancelLeave(l.id)}>ยกเลิก</Button>}
              </div>
            </div>) : <p className="py-5 text-center text-sm text-slate-400">ยังไม่มีคำร้องลา</p>}
          </Card>
        </div>
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-white">ประวัติการเข้าเรียน</h2>
          <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาวันที่ / ห้องเรียน..." />
        </div>
        <Table headers={['วันที่', 'ห้องเรียน / วิชา', 'สถานะ', 'เวลาเช็กชื่อ', 'ระยะห่าง', 'หมายเหตุ']} empty={!shown.length}>
          {shown.map((h) => <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
            <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{h.date}</td>
            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{h.classroom?.name}</td>
            <td className="px-4 py-3"><Badge status={h.status} /></td>
            <td className="px-4 py-3 text-xs text-slate-500">{h.checkinAt ? thaiDateTime(h.checkinAt) : '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{h.distanceM != null ? `${Math.round(h.distanceM)} ม.` : '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{h.note || '—'}</td>
          </tr>)}
        </Table>
        <div className="mt-4"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
      </Card>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="แจ้งลาให้ครูทราบ"
        footer={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>ยกเลิก</Button><Button form="leave-form" type="submit" loading={leaveBusy || leaveUploading} disabled={leaveUploading}>ส่งคำร้อง</Button></>}>
        <form id="leave-form" onSubmit={submitLeave} className="space-y-4">
          <Select label="ห้องเรียน *" value={leaveForm.classroomId} onChange={(e) => setLeaveForm({ ...leaveForm, classroomId: e.target.value })} required>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>)}
          </Select>
          <Input label="วันที่ลา *" type="date" min={today} value={leaveForm.date} onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })} required />
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">ประเภทการลา *</span>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map(({ value, label, icon: Icon }) => {
                const checked = leaveForm.leaveType === value
                return <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${checked
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40'}`}>
                  <input type="checkbox" name="leaveType" checked={checked}
                    onChange={() => setLeaveForm((f) => ({ ...f, leaveType: checked ? '' : value }))}
                    className="h-4 w-4 accent-blue-600" />
                  <Icon className="h-4 w-4" /> {label}
                </label>
              })}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={leaveForm.isHourly}
              onChange={(e) => setLeaveForm((f) => ({ ...f, isHourly: e.target.checked, startTime: '', endTime: '' }))}
              className="h-4 w-4 accent-blue-600" />
            <Clock3 className="h-4 w-4 text-blue-500" /> ลารายชั่วโมงระหว่างวัน (ไม่ใช่ลาทั้งวัน)
          </label>
          {leaveForm.isHourly && <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-700/30">
            <Input label="เวลาเริ่ม *" type="time" value={leaveForm.startTime} onChange={(e) => setLeaveForm({ ...leaveForm, startTime: e.target.value })} required />
            <Input label="เวลาสิ้นสุด *" type="time" value={leaveForm.endTime} onChange={(e) => setLeaveForm({ ...leaveForm, endTime: e.target.value })} required />
            <p className="col-span-2 text-xs leading-relaxed text-slate-500">ขอเพิ่มได้หลายช่วงในวันเดียวกัน แต่ช่วงเวลาต้องไม่ทับกับคำร้องที่มีอยู่ หลังครูอนุมัติจะบันทึกช่วงเวลาในหมายเหตุโดยไม่เปลี่ยนสถานะการเข้าเรียนทั้งวัน</p>
          </div>}
          <Textarea label="เหตุผลการลา *" rows={4} required minLength={5} value={leaveForm.reason}
            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
            placeholder="เช่น ลาป่วย มีใบรับรองแพทย์ / ลากิจจำเป็น" />
          <LeaveImageUploader images={leaveForm.attachments} onBusyChange={setLeaveUploading}
            onChange={(attachments) => setLeaveForm({ ...leaveForm, attachments })} />
          <p className="text-xs text-slate-500">ครูของห้องเรียนจะได้รับการแจ้งเตือน และจะบันทึกสถานะ “ลา” ให้หลังอนุมัติคำร้อง (ลารายชั่วโมงจะถูกบันทึกเป็นหมายเหตุ ไม่เปลี่ยนสถานะทั้งวัน)</p>
        </form>
      </Modal>
    </>
  )
}

function TeacherAttendance() {
  const [classrooms, setClassrooms] = useState([])
  const [classroomId, setClassroomId] = useState('')
  const [date, setDate] = useState(bangkokToday())
  const [data, setData] = useState(null)
  const [sessions, setSessions] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [locating, setLocating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [edit, setEdit] = useState(null)
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState(false)
  const [leaveBusyId, setLeaveBusyId] = useState(null)
  const [teacherConsent, setTeacherConsent] = useState(localStorage.getItem('cf-teacher-gps-consent') === 'true')
  const [searchParams] = useSearchParams()
  const leaveParam = searchParams.get('leave')
  const [focusLeaveId, setFocusLeaveId] = useState(null)

  const activeSession = data?.activeSession || null

  const load = () => {
    if (!classroomId) return
    setLoading(true); setLoadError(false)
    Promise.all([
      api.get(`/attendance/classroom/${classroomId}?date=${date}`),
      api.get(`/attendance/sessions?classroomId=${classroomId}`),
      api.get(`/leaves?classroomId=${classroomId}&limit=50`),
    ]).then(([attRes, sessionRes, leaveRes]) => {
      setData(attRes.data)
      setSessions(sessionRes.data)
      setLeaves(leaveRes.data.items)
    }).catch(() => setLoadError(true)).finally(() => setLoading(false))
  }
  useEffect(() => {
    api.get('/classrooms').then((res) => {
      setClassrooms(res.data)
      if (!classroomId && res.data.length) setClassroomId(String(res.data[0].id))
    }).catch(() => setLoadError(true))
  }, [])
  useEffect(() => { load() }, [classroomId, date])

  // ลิงก์จากหน้าแดชบอร์ด/การแจ้งเตือน (/attendance?leave=…) พาไปห้องและคำร้องที่เกี่ยวข้องจริง
  useEffect(() => {
    if (!leaveParam) return
    api.get('/leaves?limit=100').then((res) => {
      const all = res.data.items || []
      const target = leaveParam === 'pending'
        ? all.find((l) => l.status === 'PENDING')
        : all.find((l) => String(l.id) === leaveParam)
      if (target?.classroomId) {
        setClassroomId(String(target.classroomId))
        setDate(target.date)
        setFocusLeaveId(String(target.id))
      } else if (all.length) setClassroomId(String(all[0].classroomId))
    }).catch(() => {})
  }, [leaveParam])
  useEffect(() => {
    if (!focusLeaveId || !leaves.some((l) => String(l.id) === focusLeaveId)) return
    document.getElementById(`leave-${focusLeaveId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusLeaveId, leaves])

  const openSession = () => {
    if (!classroomId) return toast('กรุณาเลือกห้องเรียนก่อน', 'error')
    if (date !== bangkokToday()) return toast('เปิดรอบเช็กชื่อได้เฉพาะวันนี้ กรุณาเปลี่ยนวันที่กลับเป็นวันปัจจุบัน', 'error')
    if (!teacherConsent) return toast('กรุณายืนยันการใช้ตำแหน่งปัจจุบันก่อนเปิดรอบ', 'error')
    if (!navigator.geolocation) return toast('เบราว์เซอร์นี้ไม่รองรับ GPS', 'error')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await api.post('/attendance/sessions', {
          classroomId: Number(classroomId), lat: pos.coords.latitude,
          lng: pos.coords.longitude, accuracy: pos.coords.accuracy, durationMinutes: 30,
        })
        toast(res.message)
        load()
      } catch { /* handled */ } finally { setLocating(false) }
    }, (err) => {
      setLocating(false)
      toast(err.code === 1 ? 'คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาอนุญาตในเบราว์เซอร์' : 'ไม่สามารถอ่านตำแหน่ง GPS ได้ กรุณาลองใหม่', 'error')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const closeSession = async () => {
    if (!activeSession) return
    setBusy(true)
    try { const res = await api.post(`/attendance/sessions/${activeSession.id}/close`, {}); toast(res.message); load() }
    catch { /* handled */ } finally { setBusy(false) }
  }

  const reviewLeave = async (id, status) => {
    if (leaveBusyId) return
    setLeaveBusyId(id)
    try {
      const res = await api.patch(`/leaves/${id}/review`, { status })
      toast(res.message); load()
    } catch { /* handled */ } finally { setLeaveBusyId(null) }
  }

  const exportAttendance = async () => {
    if (!classroomId) return toast('กรุณาเลือกห้องเรียนก่อน', 'error')
    setExporting(true)
    try { await downloadFile(`/exports/attendance?classroomId=${classroomId}`, 'attendance.xlsx') }
    catch { /* handled */ } finally { setExporting(false) }
  }

  const saveStatus = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      if (edit.record) {
        const r = await api.patch(`/attendance/${edit.record.id}`, { status: edit.status, reason: edit.reason, note: edit.reason || edit.record?.note })
        toast(r.message)
      } else {
        const r = await api.post('/attendance', { classroomId: Number(classroomId), userId: edit.user.id, date, status: edit.status, note: edit.reason })
        toast(r.message)
      }
      setEdit(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const showHistory = async (record, user) => {
    try { const res = await api.get(`/attendance/${record.id}/history`); setHistory({ record: { ...record, user }, logs: res.data }) }
    catch { toast('ไม่พบประวัติการแก้ไข', 'error') }
  }

  const items = (data?.items || []).filter((i) => !search || `${i.user.firstName} ${i.user.lastName} ${i.user.studentId || ''}`.toLowerCase().includes(search.toLowerCase()))
  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING')
  // ถ้ามีลิงก์มาจากการแจ้งเตือน ให้คำร้องนั้นโผล่ในลิสต์แม้จะอยู่นอก 8 รายการล่าสุด
  const focusedLeave = focusLeaveId ? leaves.find((l) => String(l.id) === focusLeaveId) : null
  const shownLeaves = focusedLeave && !leaves.slice(0, 8).some((l) => l.id === focusedLeave.id)
    ? [focusedLeave, ...leaves.slice(0, 7)]
    : leaves.slice(0, 8)

  return (
    <>
      <PageHeader title="จัดการการเข้าเรียน" subtitle="เปิดรอบเช็กชื่อเมื่อต้องการ โดยระบบใช้ตำแหน่งปัจจุบันของคุณเป็นจุดอ้างอิง"
        actions={<>
          <Button loading={locating || busy} disabled={!classroomId || date !== bangkokToday() || !teacherConsent || Boolean(activeSession)} onClick={openSession}
            title={date !== bangkokToday() ? 'เปิดรอบได้เฉพาะวันนี้' : undefined}>
            <MapPin className="h-4 w-4" /> {activeSession ? 'มีรอบเปิดอยู่' : 'เปิดรอบเช็กชื่อ'}
          </Button>
          {activeSession && <Button variant="secondary" onClick={closeSession} disabled={busy}><Ban className="h-4 w-4" /> ปิดรอบ</Button>}
          <Button variant="secondary" loading={exporting} disabled={!classroomId} onClick={exportAttendance}><Download className="h-4 w-4" /> ส่งออก Excel</Button>
        </>} />
      <Guide steps={[
        'เลือกห้องเรียน แล้วยืนยันการใช้ตำแหน่งปัจจุบันของคุณ',
        'กด “เปิดรอบเช็กชื่อ” ระบบจะแจ้งเตือนให้นักเรียนเช็กทันที',
        'ดูคำร้องลาและสถานะรายคนในตาราง ปิดรอบเมื่อเสร็จสิ้น',
      ]} />

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Select label="ห้องเรียน" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="lg:w-72">
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="lg:w-48" />
          <label className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 text-xs text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200 lg:ml-auto lg:max-w-sm">
            <input type="checkbox" checked={teacherConsent} onChange={(e) => { setTeacherConsent(e.target.checked); localStorage.setItem('cf-teacher-gps-consent', String(e.target.checked)) }} className="mt-0.5 h-4 w-4" />
            <span>ข้าพเจ้ายินยอมให้ระบบใช้ตำแหน่งปัจจุบันเป็นจุดเช็กชื่อของรอบนี้</span>
          </label>
        </div>
        {activeSession && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"><Navigation className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">{activeSession.title} · เปิดอยู่</p>
            <p className="text-xs text-slate-500">พิกัดจากตำแหน่งปัจจุบันของคุณ · รัศมี {activeSession.gpsRadius} เมตร · เปิดเมื่อ {thaiDateTime(activeSession.openedAt)}</p>
          </div>
          <Countdown dueAt={activeSession.closesAt} className="text-xs" />
        </div>}
        {!activeSession && !loading && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700/30">ยังไม่มีรอบเช็กชื่อเปิดอยู่ ระบบจะไม่ให้นักเรียนเช็กชื่อจนกว่าครูจะเปิดรอบ</p>}
      </Card>

      {!classroomId ? <Card className="p-5"><EmptyState icon={ClipboardCheck} title="ยังไม่มีห้องเรียน" description="ผู้ดูแลต้องสร้างห้องเรียนและมอบหมายครูผู้สอนก่อนเปิดรอบเช็กชื่อ" /></Card>
        : loading || (!data && !loadError) ? <Loader />
        : loadError || !data ? <Card className="p-5"><ErrorState message="ไม่สามารถโหลดข้อมูลการเข้าเรียนได้" onRetry={load} /></Card>
        : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard icon={ClipboardCheck} label="นักเรียนทั้งหมด" value={data.summary.total} tone="blue" />
            <StatCard icon={CheckCircle2} label="มาเรียน" value={data.summary.PRESENT} tone="green" />
            <StatCard icon={Clock} label="มาสาย" value={data.summary.LATE} tone="amber" />
            <StatCard icon={ShieldAlert} label="ขาดเรียน" value={data.summary.ABSENT} tone="rose" />
            <StatCard icon={CalendarDays} label="ลา" value={data.summary.LEAVE} tone="violet" />
          </div>

          <Card className="mb-5 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="font-semibold text-slate-800 dark:text-white">คำร้องลา {pendingLeaves.length ? `(${pendingLeaves.length} รอตรวจ)` : ''}</h2>
                <p className="mt-1 text-xs text-slate-500">อนุมัติลาทั้งวันระบบจะบันทึกสถานะ “ลา” ให้อัตโนมัติ ส่วนลารายชั่วโมงจะบันทึกช่วงเวลาเป็นหมายเหตุ</p></div>
            </div>
            {shownLeaves.length ? <div className="space-y-2">
              {shownLeaves.map((l) => <div key={l.id} id={`leave-${l.id}`} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 dark:border-slate-700 ${String(l.id) === focusLeaveId ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-500/10' : 'border-slate-100'}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{l.student?.firstName} {l.student?.lastName} · {l.date}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.reason}</p>
                  <LeaveMeta leave={l} />
                  <LeaveImages files={l.attachments} />
                </div>
                <LeaveBadge status={l.status} />
                {l.status === 'PENDING' ? <div className="flex gap-2">
                  <Button size="sm" loading={leaveBusyId === l.id} disabled={Boolean(leaveBusyId) && leaveBusyId !== l.id} onClick={() => reviewLeave(l.id, 'APPROVED')}><Check className="h-3.5 w-3.5" /> อนุมัติ</Button>
                  <Button size="sm" variant="outline" loading={leaveBusyId === l.id} disabled={Boolean(leaveBusyId) && leaveBusyId !== l.id} onClick={() => reviewLeave(l.id, 'REJECTED')}><Ban className="h-3.5 w-3.5" /> ปฏิเสธ</Button>
                </div> : <span className="text-xs text-slate-400">{l.reviewNote || (l.status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว')}</span>}
              </div>)}
            </div> : <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีคำร้องลา</p>}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-semibold text-slate-800 dark:text-white">รายชื่อวันที่ {data.date}</h2>
                <p className="mt-1 text-xs text-slate-500">รอบล่าสุด: {sessions[0] ? `${sessions[0].title} (${sessions[0].status === 'OPEN' ? 'เปิดอยู่' : 'ปิดแล้ว'})` : 'ยังไม่เคยเปิดรอบ'}</p></div>
              <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อ / รหัสนักเรียน..." />
            </div>
            <Table headers={['รหัส', 'ชื่อ-นามสกุล', 'สถานะ', 'เวลาเช็กชื่อ', 'ระยะ', 'หมายเหตุ', 'ประวัติ', '']} empty={!items.length}>
              {items.map((i) => <tr key={i.user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">{i.user.studentId || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-100">{i.user.firstName} {i.user.lastName}</td>
                <td className="px-4 py-3"><Badge status={i.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-500">{i.record?.checkinAt ? thaiDateTime(i.record.checkinAt) : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{i.record?.distanceM != null ? `${Math.round(i.record.distanceM)} ม.` : '—'}</td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-amber-600">{i.record?.note || '—'}</td>
                <td className="px-4 py-3">{i.record && <Button size="sm" variant="ghost" onClick={() => showHistory(i.record, i.user)} title="ประวัติการแก้ไข"><History className="h-4 w-4" /></Button>}</td>
                <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => setEdit({ user: i.user, record: i.record, status: i.status, reason: '' })}><ClipboardCheck className="h-3.5 w-3.5" /> แก้ไข</Button></td>
              </tr>)}
            </Table>
          </Card>
          {sessions.length > 0 && <details className="group mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-800 dark:text-white">
              ประวัติรอบเช็กชื่อ <span className="text-xs font-normal text-slate-400">(กดเพื่อเปิด)</span>
            </summary>
            <div className="border-t border-slate-100 p-5 dark:border-slate-700">
              <Table headers={['รอบ', 'วันที่', 'เปิดเมื่อ', 'ปิดเมื่อ', 'สถานะ', 'เช็กแล้ว']}>
                {sessions.map((s) => <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200">{s.title}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{s.date}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{thaiDateTime(s.openedAt)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{s.closedAt ? thaiDateTime(s.closedAt) : s.closesAt ? thaiDateTime(s.closesAt) : '—'}</td>
                  <td className="px-4 py-2"><Badge status={s.status === 'OPEN' ? 'ACTIVE' : 'SUSPENDED'}>{s.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดแล้ว'}</Badge></td>
                  <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{s._count?.attendances ?? 0} คน</td>
                </tr>)}
              </Table>
            </div>
          </details>}
          <details className="group mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-800 dark:text-white">
              สรุปภาพรวมการเข้าเรียนทั้งภาคเรียน <span className="text-xs font-normal text-slate-400">(กดเพื่อเปิด)</span>
            </summary>
            <ReportTable classroomId={classroomId} />
          </details>
        </>
      )}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={`บันทึกการเข้าเรียน — ${edit?.user?.firstName || ''} ${edit?.user?.lastName || ''}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button form="att-form" type="submit" loading={busy}>บันทึก</Button></>}>
        <form id="att-form" onSubmit={saveStatus} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUS_ORDER.map((s) => <button type="button" key={s} onClick={() => setEdit({ ...edit, status: s })}
              className={`rounded-lg border px-2 py-3 text-sm font-medium transition ${edit?.status === s ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>{STATUS_LABEL[s]}</button>)}
          </div>
          <Input label="เหตุผล / หมายเหตุ" value={edit?.reason || ''} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="เช่น ลาป่วย มีใบรับรองแพทย์" />
          <p className="text-xs text-slate-500">ทุกการเปลี่ยนแปลงจะถูกบันทึกในประวัติ และนักเรียนจะได้รับการแจ้งเตือน</p>
        </form>
      </Modal>
      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title="ประวัติการเปลี่ยนแปลงสถานะ">
        {history && <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">{history.record.user?.firstName} · {history.record.date}</p>
          {history.logs.length ? history.logs.map((l) => <div key={l.id} className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-700">
            <Badge status={l.oldStatus} /> → <Badge status={l.newStatus} />
            <p className="mt-2 text-xs text-slate-500">{l.editor?.firstName} {l.editor?.lastName} · {thaiDateTime(l.createdAt)} {l.reason ? `· ${l.reason}` : ''}</p>
          </div>) : <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีการเปลี่ยนแปลง</p>}
        </div>}
      </Modal>
    </>
  )
}

function ReportTable({ classroomId }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(false)
  const load = () => {
    setError(false); setReport(null)
    api.get(`/attendance/report/${classroomId}`).then((res) => setReport(res.data)).catch(() => setError(true))
  }
  useEffect(() => { load() }, [classroomId])
  if (error) return <div className="p-5"><ErrorState message="ไม่สามารถโหลดสรุปภาพรวมการเข้าเรียนได้" onRetry={load} /></div>
  if (!report) return <div className="p-5"><Loader /></div>
  return <div className="border-t border-slate-100 p-5 dark:border-slate-700">
    <Table headers={['รหัส', 'ชื่อ-นามสกุล', 'มา', 'สาย', 'ขาด', 'ลา', 'เปอร์เซ็นต์']}>
      {report.items.map((u) => <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
        <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{u.studentId || '—'}</td>
        <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200">{u.firstName} {u.lastName}</td>
        <td className="px-4 py-2 text-xs text-emerald-600">{u.PRESENT}</td>
        <td className="px-4 py-2 text-xs text-amber-600">{u.LATE}</td>
        <td className="px-4 py-2 text-xs text-rose-600">{u.ABSENT}</td>
        <td className="px-4 py-2 text-xs text-sky-600">{u.LEAVE}</td>
        <td className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.percentage}%</td>
      </tr>)}
    </Table>
  </div>
}

export default function Attendance() {
  const { user } = useAuth()
  return user?.role === 'STUDENT' ? <StudentAttendance /> : <TeacherAttendance />
}
