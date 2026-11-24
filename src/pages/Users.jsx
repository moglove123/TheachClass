import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, CheckCircle2, Ban, ShieldCheck, Users as UsersIcon,
  UserCheck, Clock, CheckCheck, Camera,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Avatar, Badge, Button, Card, Confirm, ErrorState, Guide, Input, Modal, PageHeader, Pagination,
  SearchBox, Select, StatCard, Table, toast,
} from '../components/ui.jsx'
import { thaiDate, roleLabel } from '../utils.js'

const empty = () => ({ firstName: '', lastName: '', email: '', password: '', studentId: '', phone: '', role: 'STUDENT', status: 'ACTIVE' })
const ROLES = [
  ['ADMIN', 'ผู้ดูแลระบบ — จัดการผู้ใช้ สิทธิ์ ตั้งค่า และสำรองข้อมูลทั้งระบบ'],
  ['TEACHER', 'ครู — จัดการห้องเรียน เช็กชื่อ งาน และคะแนนของห้องที่ตนสอน'],
  ['STUDENT', 'นักเรียน — เข้าเรียน ส่งงาน ดูคะแนน และแจ้งลา'],
]

export default function Users() {
  const { user: me } = useAuth()
  const [data, setData] = useState({ items: [], total: 0, pages: 1 })
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [avatarConfirm, setAvatarConfirm] = useState(null)
  const [roleChange, setRoleChange] = useState(null)
  const [bulkAction, setBulkAction] = useState('APPROVE')
  const [bulkRole, setBulkRole] = useState('TEACHER')
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    const q = new URLSearchParams({ page: String(page), limit: '15' })
    if (search) q.set('search', search)
    if (role) q.set('role', role)
    if (status) q.set('status', status)
    api.get(`/users?${q}`).then((res) => { setData(res.data); setLoadError(false) }).catch(() => setLoadError(true))
    api.get('/admin/stats').then((res) => setStats(res.data)).catch(() => {})
  }
  useEffect(() => { load() }, [page, search, role, status])
  useEffect(() => { setPage(1) }, [search, role, status])
  useEffect(() => { setSelected([]) }, [page, search, role, status])

  const save = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (form.id) await api.patch(`/users/${form.id}`, form)
      else await api.post('/users', form)
      toast(form.id ? 'อัปเดตบัญชีสำเร็จ' : 'สร้างบัญชีสำเร็จ')
      setForm(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const removeAvatar = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await api.delete(`/users/${avatarConfirm.id}/avatar`)
      toast(r.message)
      setAvatarConfirm(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const updateStatus = async (user, newStatus) => {
    if (busy) return
    setBusy(true)
    try { const r = await api.patch(`/users/${user.id}`, { status: newStatus }); toast(r.message); load() }
    catch { /* handled */ } finally { setBusy(false) }
  }
  const applyRole = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await api.patch(`/users/${roleChange.user.id}`, { role: roleChange.role })
      toast(r.message)
      setRoleChange(null); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const applyBulk = async () => {
    if (busy) return
    setBusy(true)
    try {
      const payload = bulkAction === 'ROLE'
        ? { ids: selected, role: bulkRole }
        : { ids: selected, status: bulkAction === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE' }
      const r = await api.post('/users/bulk', payload)
      toast(r.message + (r.data?.skipped?.length ? ` (ข้าม ${r.data.skipped.length} บัญชีที่เลือกไม่ได้)` : ''))
      setBulkConfirm(false); setSelected([]); load()
    } catch { /* handled */ } finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try { const r = await api.delete(`/users/${confirm.id}`); toast(r.message); setConfirm(null); load() }
    catch { /* handled */ } finally { setBusy(false) }
  }

  // กันไม่ให้ "เลือกทั้งหน้า" รวมบัญชีของตัวเองเข้าไป (ปุ่มทีละบัญชีก็ถูกปิดอยู่แล้ว)
  const selectableIds = data.items.filter((u) => u.id !== me?.id).map((u) => u.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id))
  const toggleAll = () => setSelected(allSelected
    ? selected.filter((id) => !selectableIds.includes(id))
    : [...new Set([...selected, ...selectableIds])])
  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  return (
    <>
      <PageHeader title="จัดการสมาชิกและสิทธิ์" subtitle="อนุมัติ ระงับ มอบอำนาจ และจัดการบัญชีผู้ใช้งานทั้งหมด"
        actions={<Button onClick={() => setForm(empty())}><Plus className="h-4 w-4" /> เพิ่มผู้ใช้</Button>} />
      <Guide title="การมอบอำนาจ (Role)" steps={[
        ...ROLES.map(([r, desc]) => `${roleLabel(r)}: ${desc}`),
        'เปลี่ยนสิทธิ์ได้จากคอลัมน์ “สิทธิ์” ในตาราง หรือเลือกหลายบัญชีแล้วใช้แถบเครื่องมือด้านบนตาราง',
        'ระบบกันการเปลี่ยนบัญชีของคุณเอง และกันไม่ให้ระบบไม่มีผู้ดูแลที่เปิดใช้งานเหลืออยู่',
      ]} />
      {loadError && <Card className="mb-5 border-rose-200 p-4 dark:border-rose-500/25"><ErrorState message="ไม่สามารถโหลดรายชื่อผู้ใช้ได้" onRetry={load} /></Card>}
      {stats && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UsersIcon} label="ผู้ใช้ทั้งหมด" value={stats.users} tone="blue" />
        <StatCard icon={ShieldCheck} label="ครู" value={stats.teachers} tone="violet" />
        <StatCard icon={UserCheck} label="นักเรียน" value={stats.students} tone="green" />
        <StatCard icon={Clock} label="รออนุมัติ" value={stats.pending} tone="amber" />
      </div>}
      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อ / อีเมล / รหัสนักเรียน..." />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="lg:w-44"><option value="">ทุกสิทธิ์</option><option value="ADMIN">ผู้ดูแล</option><option value="TEACHER">ครู</option><option value="STUDENT">นักเรียน</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-48"><option value="">ทุกสถานะ</option><option value="PENDING">รออนุมัติ</option><option value="ACTIVE">เปิดใช้งาน</option><option value="SUSPENDED">ระงับ</option></Select>
        </div>

        {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/25 dark:bg-blue-500/10">
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">เลือก {selected.length} บัญชี</span>
          <Select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="w-44">
            <option value="APPROVE">อนุมัติ / เปิดใช้งาน</option>
            <option value="SUSPEND">ระงับการใช้งาน</option>
            <option value="ROLE">มอบสิทธิ์</option>
          </Select>
          {bulkAction === 'ROLE' && <Select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} className="w-40">
            <option value="ADMIN">ผู้ดูแลระบบ</option><option value="TEACHER">ครู</option><option value="STUDENT">นักเรียน</option>
          </Select>}
          <Button size="sm" disabled={busy} onClick={() => setBulkConfirm(true)}><CheckCheck className="h-4 w-4" /> ดำเนินการ</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>ล้างที่เลือก</Button>
        </div>}

        <Table headers={[
          <input key="all" type="checkbox" aria-label="เลือกทั้งหน้า" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-blue-600" />,
          'ชื่อ-นามสกุล', 'อีเมล', 'รหัสนักเรียน', 'สิทธิ์', 'สถานะ', 'สร้างเมื่อ', 'จัดการ',
        ]} empty={!data.items.length}>
          {data.items.map((u) => <tr key={u.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${u.id === me?.id ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}>
            <td className="px-4 py-3"><input type="checkbox" aria-label={`เลือก ${u.firstName}`} checked={selected.includes(u.id)} onChange={() => toggle(u.id)} disabled={u.id === me?.id} className="h-4 w-4 accent-blue-600" /></td>
            <td className="px-4 py-3"><div className="flex items-center gap-2.5">
              <Avatar user={u} size="sm" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{u.firstName} {u.lastName}{u.id === me?.id && <span className="ml-1 text-xs font-normal text-blue-500">(คุณ)</span>}</span>
            </div></td>
            <td className="px-4 py-3 text-xs text-slate-500">{u.email}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{u.studentId || '—'}</td>
            <td className="px-4 py-3">
              <select aria-label={`สิทธิ์ของ ${u.firstName}`} value={u.role} disabled={u.id === me?.id || busy}
                onChange={(e) => setRoleChange({ user: u, role: e.target.value })}
                className={`rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white ${u.role === 'ADMIN' ? 'text-violet-600 dark:text-violet-300' : u.role === 'TEACHER' ? 'text-blue-600 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}>
                <option value="ADMIN">ผู้ดูแลระบบ</option><option value="TEACHER">ครู</option><option value="STUDENT">นักเรียน</option>
              </select>
            </td>
            <td className="px-4 py-3"><Badge status={u.status} /></td>
            <td className="px-4 py-3 text-xs text-slate-400">{thaiDate(u.createdAt, false)}</td>
            <td className="px-4 py-3"><div className="flex gap-1">
              {u.status === 'PENDING' && <Button size="sm" variant="outline" title="อนุมัติ" disabled={busy} onClick={() => updateStatus(u, 'ACTIVE')}><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="hidden xl:inline">อนุมัติ</span></Button>}
              {u.status === 'ACTIVE' && <Button size="sm" variant="ghost" title="ระงับ" disabled={busy} onClick={() => updateStatus(u, 'SUSPENDED')}><Ban className="h-4 w-4 text-amber-500" /><span className="hidden xl:inline">ระงับ</span></Button>}
              {u.status === 'SUSPENDED' && <Button size="sm" variant="ghost" title="ปลดระงับ" disabled={busy} onClick={() => updateStatus(u, 'ACTIVE')}><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="hidden xl:inline">ปลดระงับ</span></Button>}
              {u.avatarUrl && <Button size="sm" variant="ghost" title="ลบรูปโปรไฟล์" disabled={busy} onClick={() => setAvatarConfirm(u)}><Camera className="h-4 w-4 text-blue-500" /><span className="hidden xl:inline">ลบรูป</span></Button>}
              <Button size="sm" variant="ghost" title="แก้ไข" disabled={busy} onClick={() => setForm({ ...u, password: '' })}><Pencil className="h-4 w-4" /><span className="hidden xl:inline">แก้ไข</span></Button>
              <Button size="sm" variant="ghost" title="ลบ" disabled={busy} onClick={() => setConfirm(u)}><Trash2 className="h-4 w-4 text-rose-500" /><span className="hidden xl:inline">ลบ</span></Button>
            </div></td>
          </tr>)}
        </Table>
        <div className="mt-4"><Pagination page={page} pages={data.pages} total={data.total} onChange={setPage} /></div>
      </Card>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'แก้ไขบัญชี' : 'เพิ่มผู้ใช้ใหม่'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>ยกเลิก</Button><Button form="user-form" type="submit" loading={busy}>บันทึก</Button></>}>
        <form id="user-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="ชื่อ" required value={form?.firstName || ''} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label="นามสกุล" required value={form?.lastName || ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <Input label="อีเมล" type="email" required value={form?.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={form?.id ? 'รหัสผ่านใหม่ (เว้นไว้หากไม่เปลี่ยน)' : 'รหัสผ่าน *'} type="password" minLength={6} required={!form?.id} value={form?.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="รหัสนักเรียน" value={form?.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
            <Input label="เบอร์โทร" value={form?.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="สิทธิ์" value={form?.role || 'STUDENT'} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="STUDENT">นักเรียน</option><option value="TEACHER">ครู</option><option value="ADMIN">ผู้ดูแลระบบ</option></Select>
            <Select label="สถานะ" value={form?.status || 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">เปิดใช้งาน</option><option value="PENDING">รออนุมัติ</option><option value="SUSPENDED">ระงับ</option></Select>
          </div>
        </form>
      </Modal>
      <Confirm open={Boolean(roleChange)} onClose={() => setRoleChange(null)} onConfirm={applyRole} loading={busy}
        variant="primary" confirmLabel="ยืนยัน"
        title="เปลี่ยนสิทธิ์การใช้งาน" message={`มอบสิทธิ์${roleLabel(roleChange?.role)}ให้ ${roleChange?.user?.firstName} ${roleChange?.user?.lastName} หรือไม่? ระบบจะแจ้งเตือนผู้ใช้และบันทึกประวัติการเปลี่ยนแปลง`} />
      <Confirm open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={applyBulk} loading={busy}
        variant="primary" confirmLabel="ยืนยัน"
        title="ยืนยันการจัดการหลายบัญชี"
        message={`ดำเนินการกับ ${selected.length} บัญชีที่เลือก: ${bulkAction === 'ROLE' ? `มอบสิทธิ์${roleLabel(bulkRole)}` : bulkAction === 'SUSPEND' ? 'ระงับการใช้งาน' : 'อนุมัติ / เปิดใช้งาน'} ใช่หรือไม่?`} />
      <Confirm open={Boolean(avatarConfirm)} onClose={() => setAvatarConfirm(null)} onConfirm={removeAvatar} loading={busy}
        title="ลบรูปโปรไฟล์" message={`ต้องการลบรูปโปรไฟล์ของ ${avatarConfirm?.firstName} ${avatarConfirm?.lastName} หรือไม่? ระบบจะแสดงตัวอักษรย่อแทน`}
        confirmLabel="ยืนยันลบรูป" />
      <Confirm open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={busy}
        title="ลบบัญชีผู้ใช้" message={`ต้องการลบบัญชี ${confirm?.firstName} ${confirm?.lastName} และข้อมูลที่เกี่ยวข้องใช่หรือไม่?`} />
    </>
  )
}
