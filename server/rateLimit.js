/**
 * Rate limit แบบ in-memory น้ำหนักเบา ไม่ต้องพึ่งบริการภายนอก
 * ใช้กับเส้นทางที่ใช้ทรัพยากรสูง/เสี่ยง brute-force (login/register/forgot/reset)
 * และปิดอัตโนมัติตอน NODE_ENV=test เพื่อไม่ให้ชุดทดสอบที่ล็อกอินหลายรอบถูกบล็อก
 */
const buckets = new Map()
const MAX_KEYS = 5000

export function resetRateLimits() {
  buckets.clear()
}

export function createRateLimit({ windowMs, max, keyPrefix, message = 'มีการพยายามมากเกินไป กรุณารอสักครู่แล้วลองใหม่' }) {
  return function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next()

    const now = Date.now()
    if (buckets.size > MAX_KEYS) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const key = `${keyPrefix}:${ip}`
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs }
    bucket.count += 1
    buckets.set(key, bucket)

    const remaining = Math.max(0, max - bucket.count)
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return res.status(429).json({ ok: false, message })
    }
    next()
  }
}

export const loginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'login',
  message: 'ลองเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่',
})

export const registerLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyPrefix: 'register',
  message: 'สมัครสมาชิกมากเกินไป กรุณารอสักครู่แล้วลองใหม่',
})

export const forgotLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'forgot',
  message: 'ขอรหัสเปลี่ยนรหัสผ่านมากเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่',
})

export const resetLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'reset',
  message: 'พยายามตั้งรหัสผ่านมากเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่',
})
