import test from 'node:test'
import assert from 'node:assert/strict'
import { thaiDateTime, thaiDay, bangkokToday, safeThaiDateTime } from '../src/utils.js'

test('safeThaiDateTime ไม่พังกับข้อความเวลาภาษาไทยที่ API ส่งมา', () => {
  const formatted = '23 พ.ย. 2569 06:22'
  assert.equal(safeThaiDateTime(formatted), formatted)
  assert.doesNotThrow(() => safeThaiDateTime(formatted))
})

test('safeThaiDateTime ยังจัดรูปแบบ ISO date ได้ตามปกติ', () => {
  const iso = new Date('2026-11-23T06:22:00.000Z').toISOString()
  assert.doesNotThrow(() => safeThaiDateTime(iso))
  assert.match(safeThaiDateTime(iso), /2026/)
})

test('safeThaiDateTime จัดการค่าว่าง', () => {
  assert.equal(safeThaiDateTime(null), '—')
  assert.equal(safeThaiDateTime(''), '—')
})

test('แสดงเวลาเป็นเวลาประเทศไทยแม้เครื่อง/เบราว์เซอร์อยู่นอกเขต Asia/Bangkok', () => {
  // เที่ยงคืน UTC = 07:00 น. ในประเทศไทย (UTC+7)
  const utcMidnight = '2026-11-23T00:00:00.000Z'
  const originalTZ = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    assert.match(thaiDateTime(utcMidnight), /07:00/)
    assert.match(thaiDay(utcMidnight), /23 พ\.ย\./)
    assert.equal(bangkokToday(utcMidnight), '2026-11-23')
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})
