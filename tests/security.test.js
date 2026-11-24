import test from 'node:test'
import assert from 'node:assert/strict'
import { isWeakSecret, jwtSecret, assertProductionConfig, minPasswordLength } from '../server/config.js'
import { createRateLimit, resetRateLimits } from '../server/rateLimit.js'
import { assertUploadedFile, assertMimeForExt, assertRealImage } from '../server/fileValidation.js'
import { ApiError } from '../server/utils.js'

const originalEnv = { ...process.env }
test.after(() => { process.env = originalEnv })

test('JWT secret guard: ปฏิเสธ secret ตัวอย่างใน production', () => {
  process.env.NODE_ENV = 'test'
  assert.equal(isWeakSecret('change-this-secret-in-production'), true)
  assert.equal(isWeakSecret('integration-test-secret-2026'), false)
  assert.equal(minPasswordLength(), 6)

  process.env.NODE_ENV = 'production'
  process.env.JWT_SECRET = 'change-this-secret-in-production'
  assert.throws(() => assertProductionConfig(), /JWT_SECRET/)
  assert.throws(() => jwtSecret(), /JWT_SECRET/)
  assert.equal(minPasswordLength(), 8)

  process.env.JWT_SECRET = 'a-very-long-random-production-secret-2026'
  assert.doesNotThrow(() => assertProductionConfig())
  assert.equal(jwtSecret(), process.env.JWT_SECRET)
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'integration-test-secret'
})

test('rate limit: บล็อกคำขอที่เกินกำหนดและส่ง header ที่เกี่ยวข้อง', () => {
  process.env.NODE_ENV = 'development'
  resetRateLimits()
  const limiter = createRateLimit({ windowMs: 60000, max: 2, keyPrefix: 'unit' })
  const makeRes = () => ({
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  })
  const req = { ip: '203.0.113.9', socket: {} }
  let passed = 0
  const next = () => { passed += 1 }

  const r1 = makeRes(); limiter(req, r1, next)
  const r2 = makeRes(); limiter(req, r2, next)
  assert.equal(passed, 2)
  assert.equal(r2.headers['RateLimit-Remaining'], '0')

  const r3 = makeRes(); limiter(req, r3, next)
  assert.equal(passed, 2)
  assert.equal(r3.statusCode, 429)
  assert.equal(r3.body.ok, false)
  assert.equal(r3.headers['Retry-After'] !== undefined, true)

  // IP อื่นยังใช้งานได้ปกติ
  const other = makeRes(); limiter({ ip: '203.0.113.10', socket: {} }, other, next)
  assert.equal(other.statusCode, undefined)
  assert.equal(passed, 3)

  // โหมดทดสอบปิด rate limit เพื่อไม่รบกวน integration suite
  process.env.NODE_ENV = 'test'
  const skipped = makeRes(); limiter(req, skipped, next)
  assert.equal(skipped.statusCode, undefined)
  resetRateLimits()
})

test('file validation: ตรวจ magic byte ไม่เชื่อนามสกุลอย่างเดียว', () => {
  assert.doesNotThrow(() => assertUploadedFile(Buffer.from('%PDF-1.7\n...'), '.pdf', 'application/pdf'))
  assert.doesNotThrow(() => assertUploadedFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
  assert.doesNotThrow(() => assertUploadedFile(Buffer.from('เนื้อหาภาษาไทย'), '.txt', 'text/plain'))
  assert.doesNotThrow(() => assertRealImage(Buffer.from('iVBORw0KGgoAAAANSUhEUg==', 'base64'), '.png'))

  assert.throws(() => assertUploadedFile(Buffer.from('MZ fake executable'), '.pdf', 'application/pdf'), (e) => e instanceof ApiError && e.status === 400)
  assert.throws(() => assertUploadedFile(Buffer.from([0x00, 0x01, 0x02]), '.txt', 'text/plain'), (e) => e instanceof ApiError && e.status === 400)
  assert.throws(() => assertRealImage(Buffer.from('MZ'), '.png'), (e) => e instanceof ApiError && e.status === 400)
  assert.throws(() => assertMimeForExt('.png', 'text/html'), (e) => e instanceof ApiError && e.status === 400)
  assert.doesNotThrow(() => assertMimeForExt('.png', 'application/octet-stream'))
})
