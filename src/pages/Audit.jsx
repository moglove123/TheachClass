import { useEffect, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { api } from '../api.js'
import { Badge, Button, Card, EmptyState, Loader, PageHeader, Pagination, SearchBox, Select, Table } from '../components/ui.jsx'
import { thaiDateTime } from '../utils.js'

export default function Audit() {
  const [data, setData] = useState({ items: [], total: 0, pages: 1 })
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const requestId = useRef(0)

  const load = () => {
    const id = ++requestId.current
    setLoading(true); setError(false)
    const q = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) q.set('search', search)
    if (action) q.set('action', action)
    api.get(`/admin/audit-logs?${q}`)
      .then((res) => { if (id === requestId.current) setData(res.data) })
      .catch(() => { if (id === requestId.current) setError(true) })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }
  useEffect(load, [page, search, action])
  useEffect(() => { setPage(1) }, [search, action])

  return (
    <>
      <PageHeader title="ประวัติการแก้ไข" subtitle="บันทึกทุกการกระทำในระบบเพื่อการตรวจสอบและความโปร่งใส" />
      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-blue-500" /><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">ทั้งหมด {data.total} รายการ</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-52">
              <option value="">ทุกการกระทำ</option>
              <option value="CHANGE_ROLE">เปลี่ยนสิทธิ์</option>
              <option value="BULK_UPDATE_USER">จัดการหลายบัญชี</option>
              <option value="CREATE_USER">สร้างบัญชี</option>
              <option value="UPDATE_USER">แก้ไขบัญชี</option>
              <option value="DELETE_USER">ลบบัญชี</option>
              <option value="EXPORT_EXCEL">ส่งออก Excel</option>
              <option value="LOGIN">เข้าสู่ระบบ</option>
            </Select>
            <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาการกระทำ / ข้อมูล..." />
          </div>
        </div>
        {loading ? <Loader />
          : error ? <div className="py-12 text-center text-sm text-slate-500">โหลดประวัติไม่ได้ <Button size="sm" variant="secondary" className="ml-2" onClick={load}>ลองใหม่</Button></div>
            : data.items.length ? <Table headers={['#', 'ผู้ดำเนินการ', 'การกระทำ', 'ข้อมูล', 'รายละเอียด', 'เวลา']}>
          {data.items.map((log, i) => <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
            <td className="px-4 py-3 text-xs text-slate-400">{(page - 1) * 20 + i + 1}</td>
            <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : <span className="text-slate-400">ระบบ</span>}
              {log.actor?.email && <p className="text-xs text-slate-400">{log.actor.email}</p>}</td>
            <td className="px-4 py-3"><Badge className="bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{log.action}</Badge></td>
            <td className="px-4 py-3 text-xs text-slate-500">{log.entity} {log.entityId ? `#${log.entityId}` : ''}</td>
            <td className="max-w-[280px] truncate px-4 py-3 text-xs text-slate-500">{log.details || '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{thaiDateTime(log.createdAt)}</td>
          </tr>)}
            </Table>
            : <EmptyState icon={ScrollText} title="ไม่พบประวัติการแก้ไข" description="ลองเปลี่ยนคำค้นหาหรือกลับมาใหม่ภายหลัง" />}
        <div className="mt-4"><Pagination page={page} pages={data.pages} total={data.total} onChange={setPage} /></div>
      </Card>
    </>
  )
}
