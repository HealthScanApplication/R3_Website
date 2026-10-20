// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Hono } from 'npm:hono'
import { cors } from 'npm:hono/cors'
import { logger } from 'npm:hono/logger'
import { handleEmailConfirmation, handleUserStatus } from './email-confirmation-endpoint.tsx'
import { createEmailService } from './email-service.tsx'
import { googleSheetsService } from './google-sheets-service.tsx'
import * as kv from './kv_store.tsx'
import { getWaitlistStats, handleWaitlistSignup } from './waitlist-endpoints.tsx'
import { zapierApp } from './zapier-endpoints.tsx'
// admin-endpoints-fixed.tsx is no longer used as a sub-app - all admin routes are inline below
import blogRssApp from './blog-rss-endpoints.tsx'
import { referralApp } from './referral-endpoints.tsx'
import { registerNotificationRoutes } from './notification-endpoints.tsx'

// Slack notification helper - sends to configured webhook (non-blocking)
async function notifySlack(message: { text: string; blocks?: any[] }): Promise<void> {
  const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
  if (!webhookUrl) {
    console.log('ℹ️ Slack notification skipped (SLACK_WEBHOOK_URL not set)')
    return
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })
    if (!res.ok) console.warn('⚠️ Slack notification failed:', res.status)
    else console.log('✅ Slack notification sent')
  } catch (err) {
    console.warn('⚠️ Slack notification error (non-critical):', err)
  }
}

// IP geolocation via free ip-api.com (non-blocking, best-effort)
async function getGeoFromIP(ip: string): Promise<{ country: string; city: string; region: string } | null> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return null
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,regionName`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const data = await res.json()
    return { country: data.country || '', city: data.city || '', region: data.regionName || '' }
  } catch { return null }
}

async function buildWaitlistSlackMessage(data: {
  email: string; name: string; firstName?: string; lastName?: string;
  position: number; source: string; referralCode: string;
  referredBy?: string | null; totalWaitlist: number;
  signupDate: string; ipAddress?: string; userAgent?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  emailSent?: boolean; optedInUpdates?: boolean;
  referralCount?: number;
  tallySubmissionId?: string;
}) {
  const sourceLabel = data.source === 'tally' ? 'Tally Form' : 'Website'
  const timestamp = new Date(data.signupDate).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', dateStyle: 'medium', timeStyle: 'short' })

  // Build UTM line
  const utmParts = [data.utm_source, data.utm_medium, data.utm_campaign].filter(Boolean)
  const utmLine = utmParts.length > 0 ? utmParts.join(' / ') : 'None'

  // Referral link (clickable URL)
  const referralUrl = `https://healthscan.live?ref=${data.referralCode}`

  // Supabase KV link
  const supabaseLink = `https://supabase.com/dashboard/project/mofhvoudjxinvpplsytd/database/tables`
  const adminLink = `https://healthscan.live/admin`

  // IP geolocation
  let locationStr = ''
  if (data.ipAddress && data.ipAddress !== 'unknown') {
    const geo = await getGeoFromIP(data.ipAddress)
    if (geo && geo.city) {
      locationStr = [geo.city, geo.region, geo.country].filter(Boolean).join(', ')
    }
  }

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `New Waitlist Signup — #${data.position}`, emoji: false }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Email:*\n${data.email}` },
        { type: 'mrkdwn', text: `*Name:*\n${data.name || 'Not provided'}` },
        { type: 'mrkdwn', text: `*Position:*\n#${data.position} of ${data.totalWaitlist}` },
        { type: 'mrkdwn', text: `*Source:*\n${sourceLabel}` },
        { type: 'mrkdwn', text: `*Signed Up:*\n${timestamp}` },
        { type: 'mrkdwn', text: `*Referral Link:*\n<${referralUrl}|${data.referralCode}>` }
      ]
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Referred By:*\n${data.referredBy ? `\`${data.referredBy}\`` : 'Direct signup'}` },
        { type: 'mrkdwn', text: `*Referrals:*\n${data.referralCount ?? 0}` },
        { type: 'mrkdwn', text: `*Email Sent:*\n${data.emailSent ? 'Yes' : 'No'}` },
        { type: 'mrkdwn', text: `*UTM:*\n${utmLine}` }
      ]
    }
  ]

  // Location + Device context line
  const contextParts: string[] = []
  if (locationStr) contextParts.push(`Location: ${locationStr}`)
  if (data.ipAddress && data.ipAddress !== 'unknown') contextParts.push(`IP: \`${data.ipAddress}\``)
  if (data.userAgent) {
    const ua = data.userAgent
    let device = 'Unknown'
    if (ua.includes('iPhone') || ua.includes('iPad')) device = 'iOS'
    else if (ua.includes('Android')) device = 'Android'
    else if (ua.includes('Mac')) device = 'macOS'
    else if (ua.includes('Windows')) device = 'Windows'
    else if (ua.includes('Linux')) device = 'Linux'
    let browser = ''
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
    else if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Edg')) browser = 'Edge'
    contextParts.push(`${device}${browser ? ' / ' + browser : ''}`)
  }
  if (contextParts.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextParts.join('  |  ') }] })
  }

  // Action links
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'View in Supabase', emoji: false }, url: supabaseLink, action_id: 'view_supabase' },
      { type: 'button', text: { type: 'plain_text', text: 'Admin Panel', emoji: false }, url: adminLink, action_id: 'view_admin' }
    ]
  })
  blocks.push({ type: 'divider' })

  return {
    text: `New waitlist signup: ${data.name || data.email} (#${data.position}) via ${data.source}`,
    blocks
  }
}

// Initialize Hono app
const app = new Hono()

// Simple in-memory rate limiter for waitlist signup
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5 // 5 signups per IP per hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  // Clean up expired entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetAt < now) rateLimitMap.delete(key)
    }
  }

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfterSeconds: 0 }
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, retryAfterSeconds: 0 }
}

// Configure CORS - Allow all origins for development, configure for production
app.use('*', cors({
  origin: '*', // In production, replace with your domain
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // 'apikey' is required — supabase-js and our REST helpers send it on every
  // call; without it here the browser preflight silently kills the request
  // (net::ERR_FAILED "Failed to fetch") even though curl works.
  allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-client-info'],
  credentials: true
}))

// Add logging
app.use('*', logger(console.log))

// Create Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Helper function to validate admin access
async function validateAdminAccess(accessToken: string) {
  if (!accessToken) {
    return { error: 'No access token provided', status: 401 }
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) {
    return { error: 'Invalid access token', status: 401 }
  }

  // Check if user is admin using the same logic as frontend
  const userEmail = user.email?.toLowerCase()
  
  // Check specific admin emails first (for external admins)
  const specificAdminEmails = [
    'johnferreira@gmail.com',
    // Add other external admin emails here
  ]
  
  const isSpecificAdmin = userEmail && specificAdminEmails.includes(userEmail)
  
  // Check admin domains
  const adminDomains = ['healthscan.live', 'healthscan.com']
  const emailDomain = user.email?.split('@')[1]?.toLowerCase()
  const isDomainAdmin = emailDomain && adminDomains.includes(emailDomain)
  
  const isAdmin = isSpecificAdmin || isDomainAdmin
  
  if (!isAdmin) {
    console.warn(`❌ Admin access denied for user: ${user.email}`)
    return { error: 'Admin access required', status: 403 }
  }

  console.log(`✅ Admin access granted for user: ${user.email}`)
  return { user, isAdmin: true }
}

// Helper function to validate UUID format
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// Health check endpoints - Multiple formats for compatibility
app.get('/make-server-ed0fe4c2/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    server: 'HealthScan Production Server',
    version: '2.0.0-inline-admin'
  })
})

app.get('/make-server-ed0fe4c2/status', (c) => {
  return c.json({ 
    status: 'online', 
    uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    timestamp: new Date().toISOString(),
    server: 'HealthScan Production Server'
  })
})

app.get('/make-server-ed0fe4c2/ping', (c) => {
  return c.json({ 
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  })
})

const PROFILE_IMPORT_MAX_BYTES = 1_000_000
const PROFILE_IMPORT_MAX_URLS = 3

function decodeProfileText(value = ''): string {
  return value
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
}

function safeProfileUrl(raw: string): URL {
  const candidate = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  const url = new URL(candidate)
  if (url.protocol !== 'https:') throw new Error('Only HTTPS profile links are supported')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const blockedName = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
  const blockedIp = /^(?:127|10|0|169\.254)\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')
  if (blockedName || blockedIp) throw new Error('That profile address is not public')
  url.username = ''; url.password = ''; url.hash = ''
  return url
}

async function assertPublicProfileHost(url: URL) {
  const checks = await Promise.allSettled([
    Deno.resolveDns(url.hostname, 'A'),
    Deno.resolveDns(url.hostname, 'AAAA'),
  ])
  const addresses = checks.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  const privateAddress = addresses.some((address) =>
    /^(?:127|10|0|169\.254)\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(address)
    || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')
  )
  if (privateAddress) throw new Error('That profile address does not resolve to a public website')
}

function htmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return decodeProfileText(match?.[1] || '')
}

function profileMeta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = htmlAttribute(tag, 'property') || htmlAttribute(tag, 'name')
    if (name.toLowerCase() === key.toLowerCase()) return htmlAttribute(tag, 'content')
  }
  return ''
}

function profileJsonLd(html: string): Record<string, any> | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1])
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (queue.length) {
        const node = queue.shift()
        if (!node || typeof node !== 'object') continue
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph'])
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
        if (types.some((type) => String(type).toLowerCase() === 'person')) return node
      }
    } catch { /* Ignore malformed third-party JSON-LD. */ }
  }
  return null
}

function uniqueProfileLinks(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12)
}

function publicProfileLinks(html: string, pageUrl: URL, description: string, person: Record<string, any> | null): string[] {
  const links: string[] = []
  if (/instagram\.com$/i.test(pageUrl.hostname.replace(/^www\./, ''))) {
    for (const match of description.matchAll(/(?:^|\s)@([a-z0-9._]{2,30})\b/gi)) {
      if (!pageUrl.pathname.toLowerCase().includes(`/${match[1].toLowerCase()}`)) {
        links.push(`https://www.instagram.com/${match[1]}/`)
      }
    }
  }
  const sameAs = Array.isArray(person?.sameAs) ? person.sameAs : person?.sameAs ? [person.sameAs] : []
  links.push(...sameAs.filter((value: unknown): value is string => typeof value === 'string'))
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    const href = htmlAttribute(tag, 'href')
    if (!href) continue
    try {
      const candidate = new URL(href, pageUrl)
      if (candidate.protocol === 'https:' && candidate.hostname !== pageUrl.hostname) links.push(candidate.toString())
    } catch { /* Ignore malformed third-party links. */ }
  }
  return uniqueProfileLinks(links)
}

function profileTopics(text: string): string[] {
  const taxonomy: Array<[string, RegExp]> = [
    ['Human Design', /\bhuman\s+design\b/i],
    ['Breathwork', /\bbreath(?:work|ing)\b/i],
    ['Nutrition', /\b(?:nutrition|diet|food)\b/i],
    ['Fitness', /\b(?:fitness|training|exercise)\b/i],
    ['Sleep', /\bsleep\b/i],
    ['Skin', /\b(?:skin|skincare|beauty)\b/i],
    ['Meditation', /\bmeditat(?:e|ion)\b/i],
    ['Mindfulness', /\bmindful(?:ness)?\b/i],
    ['Energy work', /\b(?:energy work|reiki)\b/i],
    ['Astrology', /\bastrolog(?:y|er)\b/i],
    ['Art', /\b(?:art|artist|colour|color)\b/i],
  ]
  return taxonomy.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

async function fetchPublicProfile(raw: string) {
  let url = safeProfileUrl(raw)
  let response: Response | null = null
  for (let redirect = 0; redirect < 3; redirect++) {
    await assertPublicProfileHost(url)
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; RoutineGuideProfileImporter/1.0; +https://healthscan.live)'
      }
    })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = safeProfileUrl(new URL(response.headers.get('location')!, url).toString())
      continue
    }
    break
  }
  if (!response?.ok) throw new Error(`Could not read ${url.hostname}`)
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error(`${url.hostname} did not return a public profile page`)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > PROFILE_IMPORT_MAX_BYTES) throw new Error(`${url.hostname} returned too much data`)
  const html = (await response.text()).slice(0, PROFILE_IMPORT_MAX_BYTES)
  const person = profileJsonLd(html)
  const title = profileMeta(html, 'og:title') || decodeProfileText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const rawImages = [profileMeta(html, 'og:image'), profileMeta(html, 'twitter:image'), typeof person?.image === 'string' ? person.image : person?.image?.url || '']
  const images = uniqueProfileLinks(rawImages).map((image) => {
    try { return new URL(image, url).toString() } catch { return '' }
  }).filter(Boolean)
  const standardDescription = profileMeta(html, 'description')
  const socialDescription = profileMeta(html, 'og:description') || profileMeta(html, 'twitter:description')
  // Instagram's OG description is usually follower counts. Its standard
  // description contains the actual public biography, so prefer useful text.
  let description = [standardDescription, String(person?.description || ''), socialDescription]
    .map(decodeProfileText).sort((a, b) => b.length - a.length)[0] || ''
  let name = person?.name || title.split(/[|·—–-]/)[0].trim()
  const isInstagram = /instagram\.com$/i.test(url.hostname.replace(/^www\./, ''))
  if (isInstagram) {
    name = String(name).replace(/\s*\(@[^)]+\).*$/i, '').trim()
    description = description
      .replace(/^\d[\s\S]*?\son Instagram:\s*["“]?/i, '')
      .replace(/["”]\s*$/, '')
      .trim()
  }
  const topics = profileTopics(`${title} ${description}`)
  const relatedProfiles = publicProfileLinks(html, url, description, person).flatMap((profileUrl) => {
    try {
      const parsed = new URL(profileUrl)
      if (parsed.protocol !== 'https:') return []
      const handle = parsed.pathname.split('/').filter(Boolean)[0] || parsed.hostname.replace(/^www\./, '')
      return [{ url: profileUrl, label: handle.startsWith('@') ? handle : `@${handle}`, platform: parsed.hostname.replace(/^www\./, '').split('.')[0] }]
    } catch { return [] }
  })
  return {
    sourceUrl: url.toString(),
    site: url.hostname.replace(/^www\./, ''),
    name: decodeProfileText(String(name || '')).slice(0, 120),
    headline: decodeProfileText(String(person?.jobTitle || (isInstagram && topics.length ? topics.join(' · ') : title) || '')).slice(0, 180),
    bio: decodeProfileText(String(description || '')).slice(0, 700),
    avatarUrl: images[0] || null,
    images: images.map((imageUrl) => ({ url: imageUrl, sourceUrl: url.toString(), kind: 'avatar' })),
    relatedProfiles,
    topics,
  }
}

app.post('/make-server-ed0fe4c2/guides/import-profile', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!accessToken) return c.json({ error: 'Sign in before importing a profile' }, 401)
    const { data: { user }, error } = await supabase.auth.getUser(accessToken)
    if (error || !user) return c.json({ error: 'Invalid session' }, 401)
    const body = await c.req.json()
    const urls = Array.isArray(body.urls) ? body.urls.filter((value: unknown) => typeof value === 'string' && value.trim()).slice(0, PROFILE_IMPORT_MAX_URLS) : []
    if (!urls.length) return c.json({ error: 'Add at least one public website or social profile' }, 400)
    const settled = await Promise.allSettled(urls.map(fetchPublicProfile))
    const profiles = settled.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchPublicProfile>>> => result.status === 'fulfilled').map((result) => result.value)
    if (!profiles.length) return c.json({ error: 'No public profile information could be read. You can continue manually.' }, 422)
    const first = profiles[0]
    return c.json({
      profile: {
        name: first.name,
        headline: profiles.map((p) => p.headline).find(Boolean) || '',
        bio: profiles.map((p) => p.bio).find(Boolean) || '',
        avatarUrl: profiles.map((p) => p.avatarUrl).find(Boolean) || null,
        sources: profiles.map((p) => ({ url: p.sourceUrl, site: p.site })),
        images: profiles.flatMap((p) => p.images).filter((image, index, all) => all.findIndex((candidate) => candidate.url === image.url) === index),
        relatedProfiles: profiles.flatMap((p) => p.relatedProfiles).filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index),
        topics: Array.from(new Set(profiles.flatMap((p) => p.topics))),
      },
      failed: settled.filter((result) => result.status === 'rejected').length,
    })
  } catch (error: any) {
    return c.json({ error: error?.message || 'Profile import failed' }, 400)
  }
})

const PROTOCOL_ITEM_RULES = `Item rules (strict):
- Every item must be something the person can tick off at a specific time: give "time" (HH:MM) or an "anchor" ("wake", "bedtime", "before_meal", "after_meal") with "offset_minutes". Never "all day".
- Action titles are an imperative verb + noun, with a measurable amount when it fits: "Walk 20 minutes", "Run 5 km", "Practise yoga 30 minutes". Never vague ("Practice light exercise", "Be active", "Self-care").
- Meal and food items are titled with the dish name only, no verb: "Vegetable soup", "Boiled potatoes", "Tofu scramble".
- Sleep is exactly two items: "End Sleep" (wake, first) and "Start Sleep" (bedtime, last). Put any other sleep advice (darkness, cool room, screens) in Start Sleep's notes and its "tips"/"donts".
- A supplement, food or drink the person takes is always a step ("kind":"action") with a time, never "kind":"rule": "Chlorella", "Milk Thistle" and "Drink Water" are steps in category supplement or consume. "kind":"rule" is only for a constraint ("Avoid alcohol", "Limit caffeine", "Keep binders 2 hours from food").
- Do and don't guidance is never a step of its own. Guidance about one step goes on that step as "tips" (do) and "donts" (don't). Guidance about a whole category of food or drink ("Limit caffeine", "No added sugar", "Avoid alcohol") is a group rule: return it as an item with "kind":"rule", "category":"consume", title naming the rule, entries in "tips"/"donts", never attached to a single meal or drink. Other whole-day guidance is also "kind":"rule".`

// A supplement or drink named as a bare item is a step, never a rule ("Do: Chlorella" has no time and nothing to tick off).
// Keep these patterns identical to src/utils/protocolRules.ts (isBareItemTitle / takeGroupOf): a test compares them.
const AVOID_TITLE = /^(avoid|no|skip|don'?t|do not|cut out|cut|limit|reduce|abstain|refrain|follow the .*diet|practi[cs]e .*abstinence)\b/i
const TAKE_VERB = /^(drink|take|have|eat|sip|use)\s+(a |an |some |your |the )?/i
const CONSTRAINT_WORD = /\b(if|when|whenever|while|before|after|during|with|without|within|from|at|on|every|each|per|than|more|less|fewer|only|instead|no|not|never|always|avoid|limit|keep|stay|stop|pause|check|follow|for|until|unless|labels?|rules?|daily|weekly|twice|times|dose|doses|dosage|slowly|plenty)\b/i
const DRINK_NAME = /^(water|warm water|lemon water|sparkling water|coconut water|(green|black|white|herbal|mint|ginger|chamomile|rooibos|matcha|dandelion( root)?) tea|tea|coffee|black coffee|espresso|decaf( coffee)?|americano|latte|kombucha|kefir|milk|(almond|oat|soy) milk|juice|.* juice|electrolytes?( drink)?|bone broth|broth|cacao|hot chocolate|.*\bwater)$/i
function isTakeItemStep(title: string, category: string): boolean {
  const raw = title.trim()
  if (!raw || /^(drink|take|have|eat|sip|use|add)$/i.test(raw) || AVOID_TITLE.test(raw)) return false
  const name = raw.replace(TAKE_VERB, '')
  const words = name.replace(/\(.*?\)/g, '').trim()
  const bare = words.length > 0 && words.split(/\s+/).length <= 5 && !CONSTRAINT_WORD.test(name) && !/[.:;!?]/.test(name) && !/\d+\s*[x×]/i.test(name)
  return bare && (category === 'supplement' || (category === 'consume' && DRINK_NAME.test(words)))
}

/** Real catalog names so the model picks titles we can link. */
async function catalogNameHints(): Promise<string> {
  const [activities, recipes] = await Promise.all([
    supabase.from('catalog_activities').select('name').not('name', 'is', null).limit(80),
    supabase.from('catalog_recipes').select('name_common').eq('is_published', true).not('name_common', 'is', null).order('health_score', { ascending: false, nullsFirst: false }).limit(80),
  ])
  const a = (activities.data || []).map((r: any) => r.name).filter(Boolean).join(', ')
  const r = (recipes.data || []).map((x: any) => x.name_common).filter(Boolean).join(', ')
  return `${a ? `Prefer these activities so items can be linked: ${a}.` : ''}\n${r ? `Prefer these recipes for meals: ${r}.` : ''}`
}

app.post('/make-server-ed0fe4c2/guides/build-protocol', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!accessToken) return c.json({ error: 'Sign in before building a protocol' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) return c.json({ error: 'Invalid session' }, 401)
    const { protocolId, message } = await c.req.json()
    if (!protocolId || typeof message !== 'string' || !message.trim()) return c.json({ error: 'Protocol and message are required' }, 400)
    const { data: protocol, error: protocolError } = await supabase.from('protocols').select('id,user_id,name,description,target_gender,total_days').eq('id', protocolId).eq('user_id', user.id).maybeSingle()
    if (protocolError || !protocol) return c.json({ error: 'Protocol not found' }, 404)
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ error: 'AI protocol builder is not configured' }, 501)
    const hints = await catalogNameHints().catch(() => '')
    const prompt = `You help a qualified wellness Guardian draft a conservative, practical lifestyle protocol for later human review.
Selected client profile and offer: ${protocol.description || 'Not provided'}
Protocol name: ${protocol.name}
Target gender: ${protocol.target_gender || 'not specified'}
Duration: ${protocol.total_days || 3} days
Guardian request: ${message.trim().slice(0, 2000)}

Return JSON only with this exact shape:
{"summary":"short draft rationale and safety note","steps":[{"title":"Walk 20 minutes","time":"HH:MM or null","anchor":"wake|bedtime|before_meal|after_meal|null","offset_minutes":0,"category":"consume|do|sleep|supplement","kind":"action|rule","notes":"brief instructions, cautions, and adaptation notes","day_number":1,"duration_minutes":10,"tips":[],"donts":[]}]}

Create 5-12 achievable steps.
${PROTOCOL_ITEM_RULES}
${hints}
Personalise to the selected life stage (for example premenopause, perimenopause, pregnancy) when supplied. Do not diagnose, promise treatment, prescribe medication, or provide high-risk supplement dosing. Prefer food, sleep, movement, stress regulation and tracking. Flag symptoms or circumstances that require a licensed clinician. Keep every step editable and suitable for professional review.`
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }),
    })
    const aiPayload = await aiResponse.json()
    if (!aiResponse.ok) return c.json({ error: aiPayload?.error?.message || 'AI protocol generation failed' }, 502)
    const content = aiPayload?.choices?.[0]?.message?.content
    if (!content) return c.json({ error: 'AI returned no protocol' }, 502)
    const draft = JSON.parse(content)
    const steps = Array.isArray(draft.steps) ? draft.steps.slice(0, 12).map((step: any, index: number) => ({
      title: String(step.title || `Step ${index + 1}`).slice(0, 160),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(step.time || '')) ? String(step.time) : null,
      category: ['consume', 'do', 'sleep', 'supplement'].includes(step.category) ? step.category : 'do',
      notes: String(step.notes || '').slice(0, 1200),
      day_number: Math.max(1, Math.min(Number(protocol.total_days || 3), Number(step.day_number || 1))),
      duration_minutes: step.duration_minutes == null ? null : Math.max(1, Math.min(240, Number(step.duration_minutes))),
      anchor: ['wake', 'bedtime', 'before_meal', 'after_meal'].includes(step.anchor) ? step.anchor : null,
      offset_minutes: Number.isFinite(Number(step.offset_minutes)) ? Math.max(-720, Math.min(720, Number(step.offset_minutes))) : 0,
      kind: step.kind === 'rule' && !isTakeItemStep(String(step.title || ''), String(step.category || '')) ? 'rule' : 'action',
      tips: Array.isArray(step.tips) ? step.tips.map((t: unknown) => String(t).slice(0, 80)).slice(0, 12) : [],
      donts: Array.isArray(step.donts) ? step.donts.map((t: unknown) => String(t).slice(0, 80)).slice(0, 12) : [],
    })) : []
    if (!steps.length) return c.json({ error: 'AI returned no usable protocol steps' }, 502)
    return c.json({ summary: String(draft.summary || 'AI-generated draft for Guardian review.').slice(0, 1200), steps })
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not build protocol' }, 400)
  }
})

// Guardian AI recipe builder: drafts 1+ recipes from a brief, dish/handwritten-recipe photos and
// source URLs. Only the draft comes from the model; the client matches each ingredient to
// catalog_ingredients and calculates nutrition from database values.
app.post('/make-server-ed0fe4c2/guides/build-recipes', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!accessToken) return c.json({ error: 'Sign in before building recipes' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) return c.json({ error: 'Invalid session' }, 401)
    const { message, count, mealSlot, sourceUrls, imageUrls } = await c.req.json()
    if (typeof message !== 'string' || !message.trim()) return c.json({ error: 'Describe the recipes you want' }, 400)
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ error: 'AI recipe builder is not configured' }, 501)
    const recipeCount = Math.max(1, Math.min(8, Number(count) || 1))
    const urls = (Array.isArray(sourceUrls) ? sourceUrls : []).filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 3)
    const images = (Array.isArray(imageUrls) ? imageUrls : []).filter((u: unknown) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4)
    const sources = (await Promise.all(urls.map(async (url: string) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ROUTINE3 recipe builder' }, signal: AbortSignal.timeout(8000) })
        const html = await res.text()
        const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
        return `Source ${url}:\n${text.slice(0, 6000)}`
      } catch { return '' }
    }))).filter(Boolean).join('\n\n')
    const prompt = `You help a qualified wellness Guardian draft recipes for a recipe book, for later human review.
Guardian request: ${message.trim().slice(0, 3000)}
Number of recipes: ${recipeCount}
Preferred meal slot: ${mealSlot || 'choose per recipe'}
${images.length ? 'Photos are attached: they may show finished dishes or handwritten/printed recipes. Transcribe handwritten recipes faithfully; for dish photos, recreate a realistic recipe.' : ''}
${sources ? `Reference material:\n${sources}` : ''}

Return JSON only with this exact shape:
{"summary":"one or two sentences","recipes":[{"title":"short appetising name","description":"1-2 sentences on what it is and who it helps","meal_slot":"breakfast|lunch|dinner|snack|drink|dessert","servings":2,"prep_time":10,"cook_time":15,"ingredients":[{"name":"rolled oats","search":"oats","amount":80,"unit":"g","grams":80,"preparation":"optional, e.g. finely chopped"}],"instructions":["Step one as a full sentence."]}]}

Rules: use whole, minimally processed foods. Every ingredient needs a real quantity: prefer unit "g" for solids and "ml" for liquids; use "tsp", "tbsp", "cup", "piece" or "pinch" only when natural, and ALWAYS give "grams" as your best weight estimate of that amount. "name" is a single plain food (no brands, no quantities); "search" is the simplest generic food name for a nutrition database lookup (e.g. "spinach", "olive oil", "egg"). prep_time and cook_time are minutes (0 if none). 3-8 clear method steps. Do not make medical claims.`
    const content: any[] = [{ type: 'text', text: prompt }, ...images.map((url: string) => ({ type: 'image_url', image_url: { url } }))]
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: images.length ? 'gpt-4o' : 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.4, messages: [{ role: 'user', content }] }),
    })
    const aiPayload = await aiResponse.json()
    if (!aiResponse.ok) return c.json({ error: aiPayload?.error?.message || 'AI recipe generation failed' }, 502)
    const raw = aiPayload?.choices?.[0]?.message?.content
    if (!raw) return c.json({ error: 'AI returned no recipes' }, 502)
    const draft = JSON.parse(raw)
    const slots = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'dessert']
    const units = ['g', 'ml', 'tsp', 'tbsp', 'cup', 'piece', 'pinch']
    const minutes = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(600, Math.round(n)) : null }
    const recipes = (Array.isArray(draft.recipes) ? draft.recipes : []).slice(0, recipeCount).map((r: any) => ({
      title: String(r.title || 'Untitled recipe').slice(0, 120),
      description: String(r.description || '').slice(0, 600),
      meal_slot: slots.includes(r.meal_slot) ? r.meal_slot : (slots.includes(mealSlot) ? mealSlot : 'lunch'),
      servings: Math.max(1, Math.min(24, Math.round(Number(r.servings) || 2))),
      prep_time: minutes(r.prep_time),
      cook_time: minutes(r.cook_time),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 25).map((i: any) => ({
        name: String(i.name || '').slice(0, 80),
        search: String(i.search || i.name || '').slice(0, 60),
        amount: Math.max(0, Number(i.amount) || 0),
        unit: units.includes(String(i.unit).toLowerCase()) ? String(i.unit).toLowerCase() : 'g',
        grams: Math.max(0, Number(i.grams) || 0),
        preparation: i.preparation ? String(i.preparation).slice(0, 80) : undefined,
      })).filter((i: any) => i.name),
      instructions: (Array.isArray(r.instructions) ? r.instructions : []).slice(0, 12).map((s: any) => String(s).slice(0, 500)),
    })).filter((r: any) => r.ingredients.length)
    if (!recipes.length) return c.json({ error: 'AI returned no usable recipes' }, 502)
    return c.json({ summary: String(draft.summary || '').slice(0, 600), recipes })
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not build recipes' }, 400)
  }
})

// Pasted free text (e.g. a ceremony-prep email) → event-anchored Protocol plan. Offsets are days
// relative to the event (0 = event day), so the web client dates them and links catalog records.
// Guardian brand brief: voice, visual language, words to use / avoid, drafted from the brand's own details.
// Prefers ANTHROPIC_API_KEY (Claude), falls back to OPENAI_API_KEY; the client writes an offline draft when
// this returns an error, so no key ≠ no feature.
app.post('/make-server-ed0fe4c2/guides/brand-brief', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!accessToken) return c.json({ error: 'Sign in to draft a brand brief' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) return c.json({ error: 'Invalid session' }, 401)
    const body = await c.req.json()
    const clip = (v: unknown, n = 400) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
    const name = clip(body.name, 80) || 'this brand'
    const tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => clip(t, 40)).filter(Boolean).slice(0, 10) : []
    const current = body.current && typeof body.current === 'object' ? body.current : {}
    const palette = body.ctaMode === 'mono' ? `monochrome (${body.mono === 'white_on_black' ? 'white on black' : 'black on white'})` : `brand colours ${clip(body.primary, 7)} and ${clip(body.secondary, 7)}`
    const prompt = `You write brand briefs for wellness Guardians (coaches and practitioners) who publish routines, recipes and offers on ROUTINE³.

Brand: ${name}
About: ${clip(body.about, 600) || '(not given)'}
Expertise: ${tags.join(', ') || '(not given)'}
Audience: ${clip(body.audience, 120) || 'everyone'}
Typeface: ${clip(body.font, 40)}. Buttons: ${palette}.
Current notes (keep what is specific and good): voice="${clip(current.voice)}" visual="${clip(current.visual)}" words="${clip(current.words)}" avoid="${clip(current.avoid)}"

Return STRICT JSON: {"brief":{"voice":"...","visual":"...","words":"...","avoid":"..."}}
- voice: 2–3 sentences on tone and personality, written so a copywriter can follow it.
- visual: 2–3 sentences of visual language for photography/video generators: light, setting, people, colour, composition, mood. Use the palette and typeface above.
- words: up to 10 comma-separated words or short phrases the brand uses.
- avoid: comma-separated words, claims and styles to avoid. Always include health claims such as cure, detox, miracle.
Plain English, no hype, no medical claims, no emojis.`
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    let raw = ''
    if (anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      if (!r.ok) return c.json({ error: `Anthropic: ${j?.error?.message || r.status}` }, 502)
      raw = j?.content?.[0]?.text || ''
    } else if (openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.5, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      if (!r.ok) return c.json({ error: `OpenAI: ${j?.error?.message || r.status}` }, 502)
      raw = j?.choices?.[0]?.message?.content || ''
    } else {
      return c.json({ error: 'AI brand brief is not configured' }, 501)
    }
    const text = raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const b = parsed?.brief || {}
    const brief = { voice: clip(b.voice, 600), visual: clip(b.visual, 600), words: clip(b.words, 300), avoid: clip(b.avoid, 300) }
    // An incomplete answer is a failure, so the client falls back to its offline draft instead of blank fields.
    if (!brief.voice || !brief.visual || !brief.words || !brief.avoid) return c.json({ error: 'AI returned an incomplete brand brief' }, 502)
    return c.json({ brief })
  } catch (error) {
    console.error('brand-brief error:', error)
    return c.json({ error: 'Could not draft the brand brief' }, 500)
  }
})

app.post('/make-server-ed0fe4c2/guides/plan-event-protocol', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!accessToken) return c.json({ error: 'Sign in before building a protocol' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) return c.json({ error: 'Invalid session' }, 401)
    const { protocolId, text, eventDate, eventTime, hasEvent } = await c.req.json()
    if (!protocolId || typeof text !== 'string' || !text.trim()) return c.json({ error: 'Protocol and text are required' }, 400)
    const { data: protocol } = await supabase.from('protocols').select('id').eq('id', protocolId).eq('user_id', user.id).maybeSingle()
    if (!protocol) return c.json({ error: 'Protocol not found' }, 404)
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ error: 'AI protocol builder is not configured' }, 501)
    const hints = await catalogNameHints().catch(() => '')
    const prompt = `A wellness Guardian pasted instructions they give clients. Turn them into a reviewable daily Protocol.
${hasEvent ? `The instructions are anchored to an event on ${eventDate || 'an unknown date'}${eventTime ? ` at ${eventTime}` : ''}. Use day offsets relative to the event: 0 = event day, -7 = seven days before, 1 = the day after. "48 hours before" = start_offset -2, end_offset -1. "2 weeks before" = -14..-1. "1-2 days after" = 1..2. Phase-wide rules last until the day before the event (end_offset -1).` : 'There is no event: build a normal daily routine; use start_offset 0 and end_offset 0 for every item.'}

Pasted text (already cleaned of greetings/signatures):
"""${text.slice(0, 12000)}"""

Return JSON only:
{"summary":"1-2 sentences","event_title":"Ceremony","event_time":"HH:MM or null","cutoff_time":"HH:MM or null (last food on the day)","rules":[{"title":"Avoid tyramine foods","group":"meal|wellness|supplements","dos":[],"donts":[],"start_offset":-7,"end_offset":-1}],"items":[{"title":"Walk 20 minutes (actions) or dish name (meals)","kind":"action","group":"sleep|hygiene|beauty|wellness|fitness|supplements|meal|work|home|tasks","time":"HH:MM or null","anchor":"wake|bedtime|before_meal|after_meal|null","offset_minutes":0,"duration_minutes":null,"notes":"brief guidance","start_offset":-7,"end_offset":-1,"dos":[],"donts":[],"subtasks":[],"link_kind":"food|activity|null","link_query":"one or two plain words to search a recipe/ingredient/activity catalog, e.g. rice, vegetable soup, meditation"}]}

Rules:
- Every actionable instruction becomes an item. Drop pleasantries and logistics that are not actions.
- Exactly two "sleep" items covering the whole window: "End Sleep" (first, ~07:00) and "Start Sleep" (last, ~22:00).
- Avoid lists ("no pork, alcohol, salt…", tyramine foods, caffeine, abstinence, substances) go in the top-level "rules" list, ONE entry per theme with its own date window, forbidden things in "donts" and allowed alternatives in "dos". Never as items, never as loose notes.
${PROTOCOL_ITEM_RULES}
${hints}
- Allowed foods become meal items (breakfast ~08:00, lunch ~12:30, dinner ~18:30) for each diet window, each with link_kind "food" and link_query the food (rice, potato, boiled egg, vegetable soup, polenta, salad, fruit…).
- Practices (meditation, yoga, breathwork, walking, journaling) become items with link_kind "activity".
- A packing / "what to bring" list becomes ONE item in group "tasks" the day before the event (offset -1) with the things as "subtasks".
- A day-of eating cut-off ("nothing after 3 PM", "5 hours before") becomes a "Stop eating" meal item at that time on offset 0, and set cutoff_time.
- Include the event itself on offset 0 at the event time.
- Do not diagnose or prescribe; keep medication changes for a clinician. Max 40 items.`
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    })
    const aiPayload = await aiResponse.json()
    if (!aiResponse.ok) return c.json({ error: aiPayload?.error?.message || 'AI planning failed' }, 502)
    const content = aiPayload?.choices?.[0]?.message?.content
    if (!content) return c.json({ error: 'AI returned no plan' }, 502)
    return c.json(JSON.parse(content))
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not plan protocol' }, 400)
  }
})

app.get('/make-server-ed0fe4c2/', (c) => {
  return c.json({ 
    success: true,
    message: 'HealthScan API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/health',
      '/status', 
      '/ping',
      '/stats',
      '/email-waitlist',
      '/webhooks/tally',
      '/admin/*',
      '/blog/articles',
      '/blog/health',
      '/blog/test'
    ]
  })
})

app.get('/make-server-ed0fe4c2/stats', (c) => {
  return c.json({
    success: true,
    data: {
      server: 'HealthScan Production Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints_available: [
        'health', 'status', 'ping', 'stats', 'email-waitlist', 'admin', 'blog'
      ]
    }
  })
})

// Debug endpoint for email capture issues
app.post('/make-server-ed0fe4c2/debug-email-capture', async (c) => {
  try {
    console.log('🔍 Debug email capture request received');
    
    // Get raw request body first
    const rawBody = await c.req.text();
    console.log('📋 Raw request body:', {
      body: rawBody,
      length: rawBody?.length,
      preview: rawBody?.substring(0, 200)
    });
    
    // Try to parse JSON
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody);
      console.log('📋 Parsed body:', parsedBody);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
    }
    
    // Test the same email validation logic as waitlist endpoint
    if (parsedBody && parsedBody.email) {
      console.log('🧪 Testing email validation logic...');
      const { email } = parsedBody;
      
      console.log('📧 Email validation test:', {
        email: email,
        emailType: typeof email,
        emailLength: email?.length,
        emailValue: JSON.stringify(email),
        isString: typeof email === 'string',
        isNull: email === null,
        isUndefined: email === undefined,
        isEmpty: email === '',
        emailTrimmed: email?.trim?.(),
        trimmedLength: email?.trim?.()?.length
      });
      
      // Test normalization
      try {
        let normalizedEmail;
        if (!email || typeof email !== 'string') {
          throw new Error('Email must be a valid string');
        }
        normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
          throw new Error('Email cannot be empty after normalization');
        }
        
        console.log('✅ Email validation successful:', normalizedEmail);
        
        // Test email regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidFormat = emailRegex.test(normalizedEmail);
        console.log('📧 Email format validation:', {
          normalizedEmail,
          isValidFormat,
          regexTest: emailRegex.test(normalizedEmail)
        });
        
      } catch (validationError) {
        console.error('❌ Email validation failed:', validationError);
        return c.json({
          success: false,
          error: 'Email validation failed in debug test',
          details: validationError.message,
          emailDebug: {
            receivedEmail: email,
            emailType: typeof email,
            isString: typeof email === 'string',
            isEmpty: email === '',
            isNullish: email == null
          },
          timestamp: new Date().toISOString()
        }, 400);
      }
    }
    
    const headers = {};
    for (const [key, value] of c.req.raw.headers.entries()) {
      headers[key] = value;
    }
    console.log('📋 Request headers:', headers);
    
    // Test KV store functionality
    console.log('🧪 Testing KV store...');
    const testKey = `debug_test_${Date.now()}`;
    const testValue = { test: true, timestamp: new Date().toISOString() };
    
    try {
      await kv.set(testKey, testValue);
      const retrieved = await kv.get(testKey);
      await kv.del(testKey);
      console.log('✅ KV store test successful');
    } catch (kvError) {
      console.error('❌ KV store test failed:', kvError);
      return c.json({
        success: false,
        error: 'KV store test failed',
        details: kvError.message,
        timestamp: new Date().toISOString()
      }, 500);
    }
    
    // Test Google Sheets service
    console.log('🧪 Testing Google Sheets service...');
    const googleSheetsStatus = googleSheetsService.getConfigurationStatus();
    console.log('📊 Google Sheets status:', googleSheetsStatus);
    
    return c.json({
      success: true,
      message: 'Debug endpoint working',
      debugInfo: {
        rawBodyReceived: !!rawBody,
        rawBodyLength: rawBody?.length,
        jsonParsed: !!parsedBody,
        kvStoreWorking: true,
        googleSheetsConfigured: googleSheetsStatus.configured,
        timestamp: new Date().toISOString(),
        requestMethod: c.req.method,
        requestUrl: c.req.url,
        contentType: c.req.header('Content-Type'),
        userAgent: c.req.header('User-Agent')
      },
      receivedData: {
        rawBody: rawBody?.substring(0, 500), // Limit to first 500 chars
        parsedBody: parsedBody,
        headers: headers
      }
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return c.json({
      success: false,
      error: 'Debug endpoint failed',
      details: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
})

// Email waitlist endpoint (with rate limiting)
app.post('/make-server-ed0fe4c2/email-waitlist', async (c) => {
  const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || c.req.header('CF-Connecting-IP') || 'unknown'
  const { allowed, remaining, retryAfterSeconds } = checkRateLimit(ip)

  if (!allowed) {
    console.warn(`🚫 Rate limit exceeded for IP: ${ip}`)
    return c.json({
      success: false,
      error: 'Too many signup attempts. Please try again later.',
      retryAfterSeconds
    }, 429)
  }

  // Set rate limit headers
  c.header('X-RateLimit-Remaining', String(remaining))
  return handleWaitlistSignup(c)
})

// Email confirmation endpoint
app.get('/make-server-ed0fe4c2/confirm-email', handleEmailConfirmation)

// Waitlist stats endpoint
app.get('/make-server-ed0fe4c2/waitlist/stats', getWaitlistStats)

// Waitlist count endpoint (public - returns total count)
app.get('/make-server-ed0fe4c2/waitlist-count', async (c) => {
  try {
    const allUsers = await kv.getByPrefix('waitlist_user_')
    const count = allUsers.length
    console.log(`📊 Waitlist count requested: ${count}`)
    return c.json({ success: true, count })
  } catch (error: any) {
    console.error('❌ Error fetching waitlist count:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// User queue position endpoint (returns position for specific email)
app.post('/make-server-ed0fe4c2/user-queue-position', async (c) => {
  try {
    const { email } = await c.req.json()
    if (!email) {
      return c.json({ success: false, error: 'Email required' }, 400)
    }
    
    const normalizedEmail = email.toLowerCase().trim()
    const userKey = `waitlist_user_${normalizedEmail}`
    const userData = await kv.get(userKey)
    
    if (!userData) {
      return c.json({ success: false, error: 'User not found in waitlist' }, 404)
    }
    
    console.log(`📍 Queue position requested for ${normalizedEmail}: #${userData.position}`)
    return c.json({ 
      success: true, 
      position: userData.position,
      totalWaitlist: userData.totalWaitlist || 0,
      referralCode: userData.referralCode,
      confirmed: userData.confirmed || false
    })
  } catch (error: any) {
    console.error('❌ Error fetching queue position:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// User status endpoint  
app.get('/make-server-ed0fe4c2/user-status', handleUserStatus)

// Send verification email endpoint for authenticated users
app.post('/make-server-ed0fe4c2/users/:id/send-verification', async (c) => {
  try {
    const userId = c.req.param('id')
    const accessToken = c.req.header('Authorization')?.split(' ')[1]
    
    console.log('📧 Send verification email request for user:', userId)
    
    // Validate UUID format
    if (!isValidUUID(userId)) {
      console.error('❌ Invalid UUID format for send verification:', userId)
      return c.json({ 
        success: false, 
        error: 'Invalid user ID format' 
      }, 400)
    }
    
    // Validate user access token
    if (!accessToken) {
      return c.json({ 
        success: false, 
        error: 'No access token provided' 
      }, 401)
    }
    
    // Get user from access token
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) {
      console.error('❌ Invalid access token for send verification:', authError)
      return c.json({ 
        success: false, 
        error: 'Invalid access token' 
      }, 401)
    }
    
    // Verify user is requesting verification for their own account
    if (user.id !== userId) {
      console.error('❌ User ID mismatch for send verification:', { userId, actualUserId: user.id })
      return c.json({ 
        success: false, 
        error: 'Cannot send verification for another user' 
      }, 403)
    }
    
    // Get request body
    const body = await c.req.json()
    const { email } = body
    
    if (!email) {
      return c.json({ 
        success: false, 
        error: 'Email is required' 
      }, 400)
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.trim().toLowerCase()
    
    if (!emailRegex.test(normalizedEmail)) {
      return c.json({ 
        success: false, 
        error: 'Invalid email format' 
      }, 400)
    }
    
    // Verify the email matches the user's account
    if (user.email?.toLowerCase() !== normalizedEmail) {
      console.error('❌ Email mismatch for send verification:', { 
        userEmail: user.email, 
        requestedEmail: normalizedEmail 
      })
      return c.json({ 
        success: false, 
        error: 'Email does not match user account' 
      }, 400)
    }
    
    console.log('📧 Sending verification email to:', normalizedEmail)
    
    try {
      // First try using Supabase's built-in resend verification
      const { error: resendError } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email: normalizedEmail,
        options: {
          redirectTo: `${c.req.header('Origin') || 'https://healthscan.live'}/`
        }
      })
      
      if (resendError) {
        console.warn('⚠️ Supabase auth resend failed, trying custom email service:', resendError.message)
        
        // Fallback to custom email service if available
        const emailService = createEmailService()
        if (emailService) {
          console.log('📧 Using custom email service for verification email...')
          
          // Generate a simple confirmation link
          const confirmationToken = btoa(`${normalizedEmail}:${Date.now()}:${Math.random()}`)
          const confirmationLink = `${c.req.header('Origin') || 'https://healthscan.live'}/confirm-email?token=${confirmationToken}`
          
          // Store token temporarily
          await kv.set(`email_verification_${confirmationToken}`, {
            email: normalizedEmail,
            userId: user.id,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
          })
          
          // Send email via custom service
          const emailResult = await emailService.sendEmailConfirmation(normalizedEmail, confirmationLink)
          
          if (!emailResult.success) {
            throw new Error(`Custom email service failed: ${emailResult.error}`)
          }
          
          console.log('✅ Verification email sent via custom service')
          
          return c.json({
            success: true,
            message: 'Verification email sent successfully',
            method: 'custom_email_service',
            timestamp: new Date().toISOString()
          })
        } else {
          throw new Error('No email service available')
        }
      } else {
        console.log('✅ Verification email sent via Supabase auth')
        
        return c.json({
          success: true,
          message: 'Verification email sent successfully',
          method: 'supabase_auth',
          timestamp: new Date().toISOString()
        })
      }
      
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError)
      
      // Final fallback - just return success to prevent user frustration
      // but log the actual error for debugging
      console.error('❌ All email methods failed, returning graceful error:', emailError.message)
      
      return c.json({
        success: false,
        error: 'Failed to send verification email',
        details: 'Please try again later or contact support if the problem persists',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
  } catch (error) {
    console.error('❌ Send verification endpoint error:', error)
    return c.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// Tally.so webhook endpoint - syncs Tally form submissions to waitlist
app.post('/make-server-ed0fe4c2/webhooks/tally', async (c) => {
  try {
    console.log('📋 Tally.so webhook received')

    // Read body once (stream can only be consumed once)
    const rawBody = await c.req.text()
    console.log('📋 Tally raw body length:', rawBody?.length)

    // Optional: Verify Tally signature if signing secret is configured
    const tallySecret = Deno.env.get('TALLY_SIGNING_SECRET')
    if (tallySecret) {
      const receivedSignature = c.req.header('Tally-Signature')
      if (receivedSignature) {
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(tallySecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
        const calculatedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))

        if (receivedSignature !== calculatedSignature) {
          console.warn('🚫 Tally webhook signature mismatch')
          return c.json({ success: false, error: 'Invalid signature' }, 401)
        }
        console.log('✅ Tally webhook signature verified')
      }
    }

    // Parse the already-read body as JSON
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch (parseErr) {
      console.error('❌ Tally webhook: Failed to parse JSON body:', parseErr)
      return c.json({ success: false, error: 'Invalid JSON payload' }, 400)
    }

    console.log('📋 Tally payload event:', payload?.eventType)

    // Only process form submission events
    if (payload?.eventType !== 'FORM_RESPONSE') {
      return c.json({ success: true, message: 'Event type ignored', eventType: payload?.eventType })
    }

    const fields = payload?.data?.fields || []
    const respondentId = payload?.data?.respondentId || ''
    const submissionId = payload?.data?.submissionId || ''
    const createdAt = payload?.data?.createdAt || new Date().toISOString()

    // Extract fields from Tally payload
    let email = ''
    let firstName = ''
    let lastName = ''
    let referralCode = ''
    let optedInUpdates = false

    for (const field of fields) {
      const label = (field?.label || '').toLowerCase()
      const value = field?.value || ''

      if (field?.type === 'INPUT_EMAIL' || label.includes('email')) {
        email = typeof value === 'string' ? value.trim().toLowerCase() : ''
      } else if (label === 'first' || label === 'first name' || label === 'firstname') {
        firstName = typeof value === 'string' ? value.trim() : ''
      } else if (label === 'last' || label === 'last name' || label === 'lastname') {
        lastName = typeof value === 'string' ? value.trim() : ''
      } else if (label.includes('referral') || label.includes('code')) {
        referralCode = typeof value === 'string' ? value.trim() : ''
      } else if (field?.type === 'CHECKBOXES' && label?.includes('update')) {
        optedInUpdates = value === true || (Array.isArray(value) && value.length > 0)
      }
    }

    // Combine first + last name
    const name = [firstName, lastName].filter(Boolean).join(' ')
    console.log('📋 Tally fields extracted:', { email: email ? 'present' : 'missing', firstName, lastName, name, referralCode, optedInUpdates })

    if (!email) {
      console.warn('⚠️ Tally webhook: No email found in submission fields')
      return c.json({ success: false, error: 'No email field found in submission' }, 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.warn('⚠️ Tally webhook: Invalid email format:', email)
      return c.json({ success: false, error: 'Invalid email format' }, 400)
    }

    console.log('📧 Tally webhook processing signup for:', email)

    // Check for duplicate
    const existingUser = await kv.get(`waitlist_user_${email}`)
    if (existingUser) {
      console.log('✅ Tally webhook: User already on waitlist:', email)
      return c.json({
        success: true,
        message: 'User already on waitlist',
        alreadyExists: true,
        position: existingUser.position,
        referralCode: existingUser.referralCode
      })
    }

    // Get current count for position
    let currentCount = 0
    try {
      currentCount = await kv.countByPrefix('waitlist_user_')
    } catch {
      const countData = await kv.get('waitlist_count')
      currentCount = countData?.count || 0
    }

    const position = currentCount + 1

    // Generate referral code
    let hash = 0
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    const userReferralCode = `hs_${Math.abs(hash).toString(36).substring(0, 6).padEnd(6, '0')}`

    // Store user in KV
    const userData: Record<string, any> = {
      email,
      name: name || email.split('@')[0],
      firstName: firstName || null,
      lastName: lastName || null,
      position,
      referralCode: userReferralCode,
      source: 'tally',
      referredBy: referralCode || null,
      signupDate: createdAt,
      confirmed: false,
      emailsSent: 0,
      lastEmailSent: null,
      optedInUpdates,
      tallySubmissionId: submissionId,
      tallyRespondentId: respondentId
    }

    await kv.set(`waitlist_user_${email}`, userData)

    // Update waitlist count
    await kv.set('waitlist_count', { count: position, lastUpdated: new Date().toISOString() })

    console.log(`🎉 Tally webhook: New waitlist signup #${position}: ${email}`)

    // Slack notification (non-blocking)
    buildWaitlistSlackMessage({
      email, name: name || email.split('@')[0],
      firstName: firstName || undefined, lastName: lastName || undefined,
      position, source: 'tally', referralCode: userReferralCode,
      referredBy: referralCode || null, totalWaitlist: position,
      signupDate: createdAt, optedInUpdates,
      referralCount: 0,
      tallySubmissionId: submissionId
    }).then(msg => notifySlack(msg)).catch(() => {})

    // Send confirmation email (optional, non-blocking)
    try {
      const emailService = createEmailService()
      if (emailService) {
        const emailResult = await emailService.sendWaitlistConfirmation(email, position, true)
        if (emailResult.success) {
          userData.emailsSent = 1
          userData.lastEmailSent = new Date().toISOString()
          await kv.set(`waitlist_user_${email}`, userData)
          console.log('✅ Tally webhook: Confirmation email sent')
        }
      }
    } catch (emailErr) {
      console.warn('⚠️ Tally webhook: Email send failed (non-critical):', emailErr)
    }

    return c.json({
      success: true,
      message: 'Waitlist signup processed from Tally',
      position,
      referralCode: userReferralCode,
      email,
      source: 'tally'
    }, 201)

  } catch (error) {
    console.error('❌ Tally webhook error:', error)
    return c.json({
      success: false,
      error: 'Webhook processing failed',
      details: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// Admin: Send test email sequence (all 3 emails)
app.post('/make-server-ed0fe4c2/admin/send-test-emails', async (c) => {
  try {
    const body = await c.req.json()
    const { email, position, referralCode, name } = body

    if (!email) return c.json({ error: 'email required' }, 400)

    const emailService = createEmailService()
    if (!emailService) return c.json({ error: 'Email service not configured' }, 500)

    const baseUrl = 'https://healthscan.live'
    const confirmationToken = btoa(`${email}:${Date.now()}:${Math.random()}`)
    const confirmationLink = `${baseUrl}/confirm-email?token=${confirmationToken}`
    const referralLink = referralCode ? `${baseUrl}?ref=${referralCode}` : ''

    const results: Record<string, any> = {}

    // Email 1: Confirmation
    results.confirmation = await emailService.sendWaitlistConfirmation(
      email, position || 1, true
    )

    // Email 2: Welcome
    if (referralCode) {
      results.welcome = await emailService.sendWelcomeEmail(email, position || 1, referralCode)
    }

    // Email 3: How to Use
    results.howToUse = await emailService.sendHowToUseEmail(email, name || '')

    return c.json({ success: true, results })
  } catch (err) {
    return c.json({ error: 'Failed to send test emails', details: String(err) }, 500)
  }
})

// ============ ADMIN CRUD ROUTES (inline to avoid sub-app routing issues) ============

// Admin: Resend welcome email
app.post('/make-server-ed0fe4c2/admin/resend-welcome-email', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { email } = await c.req.json()
    if (!email || typeof email !== 'string') return c.json({ success: false, error: 'Valid email is required' }, 400)
    const normalizedEmail = email.trim().toLowerCase()
    const emailService = createEmailService()
    if (!emailService) return c.json({ success: false, error: 'Email service not configured.' }, 500)
    let position = 0, referralCode = 'unknown'
    try { const u = await kv.get(`waitlist_user_${normalizedEmail}`); if (u) { position = u.position || 0; referralCode = u.referralCode || 'unknown' } } catch (_e) {}
    const result = await emailService.sendEmailConfirmed(normalizedEmail, position, referralCode)
    if (result.success) {
      try { const u = await kv.get(`waitlist_user_${normalizedEmail}`); if (u) { u.emailsSent = (u.emailsSent || 0) + 1; u.lastEmailSent = new Date().toISOString(); await kv.set(`waitlist_user_${normalizedEmail}`, u) } } catch (_e) {}
      return c.json({ success: true, message: 'Welcome email sent successfully', email: normalizedEmail })
    }
    return c.json({ success: false, error: result.error || 'Failed to send email' }, 500)
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Get waitlist data from KV store
app.get('/make-server-ed0fe4c2/admin/waitlist', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const allKeys = await kv.getByPrefix('waitlist_user_')
    if (!allKeys || allKeys.length === 0) return c.json([])
    const waitlistUsers = allKeys
      .sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
      .map((user: any, index: number) => ({
        id: user.email || `waitlist_${index}`, email: user.email, name: user.name || null,
        position: user.position || index + 1, referralCode: user.referralCode, referrals: user.referrals || 0,
        emailsSent: user.emailsSent || 0, email_sent: (user.emailsSent || 0) > 0,
        created_at: user.signupDate || user.createdAt, confirmed: user.confirmed || false,
        lastEmailSent: user.lastEmailSent, ipAddress: user.ipAddress || null,
        userAgent: user.userAgent || null, source: user.source || null, referredBy: user.referredBy || null
      }))
    return c.json(waitlistUsers)
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Delete waitlist user
app.post('/make-server-ed0fe4c2/admin/waitlist/delete', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { email } = await c.req.json()
    const normalizedEmail = (email || '').trim().toLowerCase()
    if (!normalizedEmail) return c.json({ success: false, error: 'Email is required' }, 400)
    const existing = await kv.get(`waitlist_user_${normalizedEmail}`)
    if (!existing) return c.json({ success: false, error: 'User not found' }, 404)
    await kv.del(`waitlist_user_${normalizedEmail}`)
    const remaining = await kv.getByPrefix('waitlist_user_')
    const sorted = remaining.sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
    for (let i = 0; i < sorted.length; i++) { if (sorted[i].position !== i + 1) { sorted[i].position = i + 1; await kv.set(`waitlist_user_${sorted[i].email}`, sorted[i]) } }
    await kv.set('waitlist_count', { count: sorted.length, lastUpdated: new Date().toISOString() })
    return c.json({ success: true, message: `Deleted ${normalizedEmail}`, newCount: sorted.length })
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Update waitlist user
app.post('/make-server-ed0fe4c2/admin/waitlist/update', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { email, updates } = await c.req.json()
    const normalizedEmail = (email || '').trim().toLowerCase()
    if (!normalizedEmail) return c.json({ success: false, error: 'Email is required' }, 400)
    const existing = await kv.get(`waitlist_user_${normalizedEmail}`)
    if (!existing) return c.json({ success: false, error: 'User not found' }, 404)
    const updatedUser = { ...existing, ...updates, email: existing.email }
    await kv.set(`waitlist_user_${normalizedEmail}`, updatedUser)
    return c.json({ success: true, message: `Updated ${normalizedEmail}`, user: updatedUser })
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Bulk update waitlist
app.post('/make-server-ed0fe4c2/admin/waitlist/bulk-update', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { emails, updates } = await c.req.json()
    if (!Array.isArray(emails) || emails.length === 0) return c.json({ success: false, error: 'emails array is required' }, 400)
    let updated = 0, failed = 0
    for (const em of emails) { try { const n = em.trim().toLowerCase(); const ex = await kv.get(`waitlist_user_${n}`); if (ex) { await kv.set(`waitlist_user_${n}`, { ...ex, ...updates, email: ex.email }); updated++ } else { failed++ } } catch { failed++ } }
    return c.json({ success: true, updated, failed })
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Bulk delete waitlist
app.post('/make-server-ed0fe4c2/admin/waitlist/bulk-delete', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { emails } = await c.req.json()
    if (!Array.isArray(emails) || emails.length === 0) return c.json({ success: false, error: 'emails array is required' }, 400)
    let deleted = 0, failed = 0
    for (const em of emails) { try { await kv.del(`waitlist_user_${em.trim().toLowerCase()}`); deleted++ } catch { failed++ } }
    return c.json({ success: true, deleted, failed })
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: AI sourcing suggestions for a protocol kit — quality (organic /
// third-party-tested) upgrades, dropship supplier setup, affiliate programs.
// Prefers ANTHROPIC_API_KEY (Claude), falls back to OPENAI_API_KEY; the admin
// UI adds deterministic playbook cards client-side, so no key ≠ no feature.
app.post('/make-server-ed0fe4c2/admin/kits/ai-suggest', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { slug, region } = await c.req.json()
    if (!slug) return c.json({ success: false, error: 'slug is required' }, 400)

    const { data: kits } = await supabase.from('protocol_kits').select('slug,market,title,protocol_id,partner_label').eq('slug', slug)
    const { data: items } = await supabase.from('protocol_kit_items')
      .select('market,lane,title,price_usd,currency,supplier,supplier_cost_usd,commission_pct,affiliate_url,variant_id,catalog_product_id')
      .eq('slug', slug)
    if (!kits?.length) return c.json({ success: false, error: `No kit found for slug ${slug}` }, 404)
    let protocolName = slug
    if (kits[0].protocol_id) {
      const { data: proto } = await supabase.from('catalog_protocols').select('name').eq('id', kits[0].protocol_id).limit(1)
      protocolName = proto?.[0]?.name || slug
    }
    const scoped = region ? (items || []).filter((i: any) => i.market === region) : (items || [])
    const itemLines = scoped.map((i: any) =>
      `- [${i.market}/${i.lane}] ${i.title} | sell ${i.price_usd ?? '?'} ${i.currency || 'USD'} | cost ${i.supplier_cost_usd ?? 'UNKNOWN'} USD | supplier ${i.supplier || 'NONE'} | ${i.variant_id ? 'shopify' : (i.affiliate_url ? new URL(i.affiliate_url).hostname : 'NO BUY PATH')}${i.commission_pct ? ` | commission ${i.commission_pct}%` : ''}`
    ).join('\n')

    const prompt = `You are a sourcing analyst for HealthScan, a health-brand that sells protocol kits (product bundles) via a Shopify store (dropship) and affiliate links.

Kit: "${kits[0].title || slug}" for protocol "${protocolName}"${region ? ` — region ${region}` : ' — regions US/EU/UK/AU'}.
Current items:
${itemLines || '(no items)'}

Known fulfilment playbook: Supliful (US dropship, white-label supplements, publishes ≥97% third-party COA lab results, organic options); Suplify (EU dropship equivalent); UK: domestic dropship suppliers preferred post-Brexit (avoid EU cross-shipping); AU: partner-cart model (TGA rules restrict supplement imports); Momentous affiliate ≈15% (NSF-certified, third-party tested); Amazon Associates ≈3%; Thorne/Fullscript pro channels exist.

Return STRICT JSON: {"cards":[{"type":"quality"|"supplier"|"dropship"|"affiliate"|"pricing","title":"...","detail":"...","item_title":"exact item title or null","action":{"kind":"set_supplier","supplier":"..."}|{"kind":"info"},"confidence":"high"|"medium"|"low"}]}
Rules: max 8 cards. Every detail must read like an operator instruction ("Do X with Y at Z"), 2 sentences max, and MUST contain at least two concrete specifics: a number (commission %, wholesale price, margin %, MOQ) and/or a proper noun (program name, certifier like NSF/USP/COSMOS, competitor, marketplace). BANNED words: consider, evaluate, ensure, enhance, credibility, leverage, strategy. Good example: "Momentous' affiliate program pays ~15% vs Amazon's 3% — this $59.99 item nets ~$9/unit instead of ~$1.80; join via impact.com and swap the affiliate_url." Bad example: "Consider establishing a supplier agreement to enhance availability."
Prioritize: (1) items with supplier NONE or NO BUY PATH — name the exact supplier/program and its terms; (2) organic / third-party-tested upgrades — name the certifying body and the certified brand, and what it costs; (3) pricing — compare the current sell price to a named competitor's actual price range and state the margin impact.`

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    let raw = ''
    let provider = ''
    if (anthropicKey) {
      provider = 'anthropic'
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      if (!r.ok) return c.json({ success: false, error: `Anthropic: ${j?.error?.message || r.status}` }, 502)
      raw = j?.content?.[0]?.text || ''
    } else if (openaiKey) {
      provider = 'openai'
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      if (!r.ok) return c.json({ success: false, error: `OpenAI: ${j?.error?.message || r.status}` }, 502)
      raw = j?.choices?.[0]?.message?.content || ''
    } else {
      return c.json({ success: false, error: 'No AI key configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY in edge secrets)' }, 501)
    }

    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()
    const start = jsonText.indexOf('{')
    const parsed = JSON.parse(jsonText.slice(start >= 0 ? start : 0))
    const cards = Array.isArray(parsed?.cards) ? parsed.cards.slice(0, 8) : []
    return c.json({ success: true, provider, cards })
  } catch (error: any) { return c.json({ success: false, error: error?.message || 'Internal server error' }, 500) }
})

// Admin: Get products from KV
app.get('/make-server-ed0fe4c2/admin/products', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const allProducts = await kv.getByPrefix('product_')
    if (!allProducts || allProducts.length === 0) return c.json([])
    const products = allProducts.map((p: any, i: number) => ({
      id: p.id || `product_${i}`, name: p.name, brand: p.brand || null, category: p.category || null,
      type: p.type || null, barcode: p.barcode || null, description: p.description || null,
      image_url: p.image_url || null, serving_size: p.serving_size || null,
      ingredients: p.ingredients || [], nutrition_facts: p.nutrition_facts || {},
      allergens: p.allergens || [], warnings: p.warnings || [], certifications: p.certifications || [],
      source: p.source || null, created_at: p.imported_at || null
    }))
    return c.json(products)
  } catch (error: any) { return c.json({ success: false, error: 'Internal server error' }, 500) }
})

// Admin: Update catalog record (elements, ingredients, recipes, products)
app.post('/make-server-ed0fe4c2/admin/catalog/update', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { table, id, updates } = await c.req.json()
    const allowedTables = ['catalog_elements', 'catalog_ingredients', 'catalog_recipes', 'catalog_products', 'catalog_equipment', 'catalog_cooking_methods', 'catalog_activities', 'catalog_symptoms', 'hs_tests', 'hs_supplements', 'hs_products', 'hs_services', 'hs_experts', 'hs_packages']
    if (!allowedTables.includes(table)) return c.json({ success: false, error: `Invalid table: ${table}` }, 400)
    if (!id) return c.json({ success: false, error: 'Record ID is required' }, 400)
    if (table === 'catalog_products') {
      // First try KV store (legacy products stored as 'product_<id>')
      let kvKey = id
      let existing = await kv.get(id)
      if (!existing) {
        kvKey = `product_${id}`
        existing = await kv.get(kvKey)
      }
      if (!existing) {
        // Scan all KV products and find by id field
        const allProducts = await kv.getByPrefix('product_')
        const match = allProducts?.find((p: any) => p.id === id)
        if (match) { existing = match; kvKey = `product_${match.id}` }
      }
      if (existing) {
        // Found in KV — update there
        const kvClean = { ...existing, ...updates }
        ;['_displayIndex', 'created_at'].forEach((f: string) => delete kvClean[f])
        kvClean.updated_at = new Date().toISOString()
        await kv.set(kvKey, kvClean)
        return c.json({ success: true })
      }
      // Not in KV — fall through to Supabase DB update below (catalog_products table)
    }
    // Per-table column allowlists — strip any unknown columns before update to prevent schema errors
    const TABLE_COLUMNS: Record<string, Set<string>> = {
      catalog_elements: new Set([
        'name_common','name_other','name_scientific','category','type_label','subcategory','health_role','essential_90',
        'chemical_symbol','molecular_formula','cas_number','slug',
        'nutrient_key','nutrient_unit','nutrient_category',
        'description','description_simple','description_technical','description_full',
        'functions','health_benefits','risk_tags','thresholds','deficiency_ranges','excess_ranges','drv_by_population',
        'found_in','food_sources_detailed','food_strategy','reason',
        'deficiency','interactions','detox_strategy',
        'prevention_items','elimination_items',
        'health_score','scientific_references','info_sections',
        'image_url','image_url_raw','image_url_powdered','image_url_cut','image_url_capsule','video_url','images','videos',
        'scientific_papers','social_content',
        'ai_enriched_at','ai_enrichment_version','updated_at',
      ]),
      catalog_recipes: new Set([
        'name_common','name_other','name_scientific','category','category_sub','meal_slot',
        'cuisine','language','type',
        'prep_time','cook_time','servings','difficulty','equipment','equipment_ids','cooking_method_ids','instructions','cooking_instructions',
        'linked_ingredients','ingredients',
        'description','description_simple','description_technical',
        'health_benefits','taste_profile','flavor_profile','texture_profile',
        'elements_beneficial','elements_hazardous','nutrition_per_100g','nutrition_per_serving',
        'health_score','scientific_references',
        'storage_tips','selection_tips','preparation_methods','culinary_uses',
        'season','origin','varieties','processing_type',
        'serving_size','subcategory','tags','allergens','dietary_info',
        'image_url','image_url_raw','image_url_plated','image_url_closeup','video_url','images','videos',
        'scientific_papers','social_content',
        'updated_at',
      ]),
      catalog_ingredients: new Set([
        'name_common','name_other','name_scientific','category','category_sub',
        'processing_type','processing_methods','raw_ingredients','description_processing',
        'description_simple','description_technical','health_benefits','taste_profile',
        'elements_beneficial','elements_hazardous','health_score','scientific_references',
        'nutrition_per_100g','nutrition_per_serving',
        'herbal_quality',
        'origin_country','origin_region','origin_city','culinary_history',
        'image_url','image_url_raw','image_url_powdered','image_url_cut','image_url_cubed','image_url_cooked','video_url','images','videos',
        'scientific_papers','social_content',
        'updated_at',
      ]),
      catalog_equipment: new Set([
        'name','category','description','image_url','brand','material','size_notes','use_case','affiliate_url','cooking_methods_used_with','updated_at',
      ]),
      catalog_cooking_methods: new Set([
        'name','slug','category','description','temperature','medium','typical_time','health_impact','nutrient_effect','best_for','equipment_ids','elements_hazardous','elements_beneficial','image_url','updated_at',
      ]),
      catalog_products: new Set([
        'name_common','name','name_brand','brand','manufacturer','category','category_sub','subcategory','barcode','quantity',
        'ingredients_text','allergen_info','serving_size','serving_unit',
        'description','description_simple','description_technical',
        'health_benefits','taste_profile',
        'elements_beneficial','elements_hazardous','health_score',
        'nutri_score','nova_group','eco_score',
        'nutrition_per_100g','nutrition_per_serving','nutrition_facts',
        'scientific_references','scientific_papers','social_content',
        'image_url','image_url_raw','image_url_back','image_url_detail','video_url','images','videos',
        'origin_country','region','country',
        'updated_at',
      ]),
      catalog_activities: new Set([
        'name','description','category','icon_name','icon_svg_path','icon_url','image_url','video_url',
        'sweat_level','default_duration_min','calories_per_minute','intensity_levels',
        'mineral_impact','toxin_loss','benefits','strava_types',
        'equipment_needed','body_parts','contraindications',
        'is_active','sort_order','updated_at',
      ]),
      catalog_symptoms: new Set([
        'name','slug','category','body_system','severity','onset_type',
        'description','description_simple',
        'linked_elements_deficiency','linked_elements_excess',
        'common_causes','related_symptoms','reversible','population_risk','diagnostic_notes',
        'herbal_treatments',
        'icon_name','icon_url','image_url','video_url','tags',
        'health_score_impact','scientific_references',
        'is_active','sort_order','ai_enriched_at','updated_at',
      ]),
      hs_services: new Set([
        'name','slug','description','service_type','duration_minutes','delivery_method','category',
        'retail_price','currency','region','estimated_cost','margin_pct',
        'expert_id','icon_url','image_url','video_url',
        'buy_url','booking_url','calendly_url',
        'is_active','published','shopify_product_url','shopify_product_id',
        'notes','tags','updated_at',
      ]),
      hs_experts: new Set([
        'name','slug','title','description','bio',
        'website_url','linkedin_url','instagram_url','tiktok_url','email','whatsapp',
        'booking_url','google_schedule_url',
        'avatar_url','image_url','video_intro_url',
        'expertise_tags','certifications','languages',
        'user_rating','rating_count',
        'region','timezone','available_hours',
        'is_active','published','is_verified','notes','updated_at',
      ]),
      hs_packages: new Set([
        'name','slug','description','short_description',
        'category','goal','target_audience','difficulty_level','duration_weeks',
        'retail_price','compare_at_price','currency','region','discount_pct',
        'icon_url','image_url','image_url_2','video_url','color_hex',
        'is_active','is_featured','published','sort_order',
        'shopify_product_url','shopify_product_id',
        'notes','tags','updated_at',
      ]),
    }
    const allowedCols = TABLE_COLUMNS[table]
    const cleanUpdates: Record<string, any> = {}
    
    // UUID validation regex
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    
    for (const [k, v] of Object.entries(updates)) {
      if (!allowedCols || allowedCols.has(k)) {
        if (v !== undefined && !['_displayIndex','id','created_at','imported_at','api_source','external_id'].includes(k)) {
          // Validate UUID arrays (equipment_ids, cooking_method_ids, linked_ingredients, cooking_methods_used_with, etc.)
          const UUID_ARRAY_COLS = new Set(['linked_ingredients'])
          if (Array.isArray(v) && (k.includes('_ids') || k.includes('_used_with') || UUID_ARRAY_COLS.has(k))) {
            const validUUIDs = v.filter((uuid: any) => {
              if (typeof uuid !== 'string') return false
              const isValid = UUID_REGEX.test(uuid)
              if (!isValid) {
                console.warn(`[Admin] Invalid UUID "${uuid}" in field "${k}", skipping`)
              }
              return isValid
            })
            cleanUpdates[k] = validUUIDs
          } else {
            cleanUpdates[k] = v
          }
        }
      } else {
        console.warn(`[Admin] Stripping unknown column "${k}" from ${table} update`)
      }
    }
    // For catalog_elements: sync category from health_role so both columns stay consistent
    if (table === 'catalog_elements' && cleanUpdates.health_role) {
      const hr = String(cleanUpdates.health_role).toLowerCase()
      cleanUpdates.category = hr === 'conditional' ? 'both' : hr
    }
    cleanUpdates.updated_at = new Date().toISOString()
    const fieldCount = Object.keys(cleanUpdates).length
    console.log(`[Admin UPDATE] Table: ${table}, ID: ${id}, ${fieldCount} fields: ${Object.keys(cleanUpdates).join(', ')}`)
    // Write via REST (not the shared supabase-js client) so the request carries
    // x-admin-email — the audit_row_change() trigger reads it to attribute this
    // edit to the admin instead of the service role.
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const restHeaders: Record<string, string> = {
      apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json',
      'x-admin-email': adminValidation.user?.email || '',
    }
    // Use UPDATE (not upsert) — upsert triggers an INSERT attempt which requires all NOT NULL cols
    const updRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`, {
      method: 'PATCH', headers: { ...restHeaders, Prefer: 'return=representation' }, body: JSON.stringify(cleanUpdates),
    })
    if (!updRes.ok) {
      const msg = await updRes.text()
      console.error(`[Admin UPDATE ERROR] ${msg}`)
      return c.json({ success: false, error: msg.slice(0, 300) }, 500)
    }
    const updatedRows = await updRes.json().catch(() => [])
    if (!updatedRows || updatedRows.length === 0) {
      // Record doesn't exist — attempt insert with slug auto-derived for tables that require it
      if (table === 'catalog_elements' && !cleanUpdates.slug) {
        cleanUpdates.slug = (cleanUpdates.name_common || id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      }
      const insRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}`, {
        method: 'POST', headers: { ...restHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ id, ...cleanUpdates }),
      })
      if (!insRes.ok) {
        const msg = await insRes.text()
        console.error(`[Admin INSERT FALLBACK ERROR] ${msg}`)
        return c.json({ success: false, error: msg.slice(0, 300) }, 500)
      }
      console.log(`[Admin INSERT FALLBACK SUCCESS] ${table}/${id} (${fieldCount} fields)`)
    } else {
      console.log(`[Admin UPDATE SUCCESS] ${table}/${id} (${fieldCount} fields)`)
    }
    // ── Junction table sync (best-effort) ──
    // After saving JSONB/array fields, sync to proper junction tables via SQL functions
    const JUNCTION_SYNC_RPCS: Record<string, string> = {
      catalog_ingredients: 'sync_ingredient_elements',
      catalog_recipes: 'sync_recipe_junctions',
      catalog_cooking_methods: 'sync_cooking_method_junctions',
      catalog_symptoms: 'sync_symptom_junctions',
      catalog_activities: 'sync_activity_junctions',
    }
    const syncRpc = JUNCTION_SYNC_RPCS[table]
    if (syncRpc) {
      try {
        const { data: syncResult, error: syncErr } = await supabase.rpc(syncRpc, { p_id: id })
        if (syncErr) {
          console.warn(`[Admin] Junction sync (${syncRpc}): ${syncErr.message}`)
        } else {
          console.log(`[Admin] Junction sync OK (${syncRpc}):`, JSON.stringify(syncResult))
        }
      } catch (e: any) {
        console.warn(`[Admin] Junction sync error: ${e?.message}`)
      }
    }
    return c.json({ success: true })
  } catch (error: any) {
    console.error('[Admin] Error updating catalog record:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: Ensure storage bucket exists
app.post('/make-server-ed0fe4c2/admin/storage/ensure-bucket', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { bucket } = await c.req.json()
    if (!bucket || typeof bucket !== 'string') return c.json({ success: false, error: 'Bucket name required' }, 400)
    // Try to get the bucket first
    const { data: existing } = await supabase.storage.getBucket(bucket)
    if (existing) return c.json({ success: true, message: 'Bucket already exists' })
    // Create it
    const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 })
    if (error) return c.json({ success: false, error: error.message }, 500)
    console.log(`[Admin] Created storage bucket "${bucket}" by ${adminValidation.user.email}`)
    return c.json({ success: true, message: 'Bucket created' })
  } catch (error: any) {
    console.error('[Admin] Error ensuring bucket:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: Upload file to storage (uses service role — bypasses RLS)
app.post('/make-server-ed0fe4c2/admin/storage/upload', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'catalog-media'
    if (!file) return c.json({ success: false, error: 'No file provided' }, 400)

    const ext = file.name.split('.').pop() || 'bin'
    const path = `admin-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Ensure bucket exists
    const { data: existing } = await supabase.storage.getBucket(bucket)
    if (!existing) {
      const { error: createErr } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 })
      if (createErr) {
        console.error('[Admin] Failed to create bucket:', createErr)
        return c.json({ success: false, error: `Failed to create bucket: ${createErr.message}` }, 500)
      }
      console.log(`[Admin] Auto-created bucket "${bucket}"`)
    }

    // Upload using service role (bypasses RLS)
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })
    if (uploadErr) {
      console.error('[Admin] Upload error:', uploadErr)
      return c.json({ success: false, error: uploadErr.message }, 500)
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    console.log(`[Admin] File uploaded: ${path} by ${adminValidation.user.email}`)
    return c.json({ success: true, publicUrl: urlData.publicUrl })
  } catch (error: any) {
    console.error('[Admin] Upload error:', error)
    return c.json({ success: false, error: error?.message || 'Upload failed' }, 500)
  }
})

// ── AI image generation ──────────────────────────────────────────────────────
// Provider-extensible: OpenAI (gpt-image-1) is wired now. To add Midjourney /
// Replicate-Flux later, add a branch that returns raw PNG bytes — the upload +
// endpoint stay the same. Midjourney has no official API (needs an async relay +
// job queue), so it's a future provider, not a drop-in.
// Reference image → raw bytes. Accepts a data: URL (inline upload) or an
// http(s) URL (already-hosted image). Admin-gated caller, so fetching a
// user-supplied URL here is acceptable.
async function fetchImageBytes(ref: string): Promise<Uint8Array> {
  if (ref.startsWith('data:')) {
    const b64 = ref.slice(ref.indexOf(',') + 1)
    return Uint8Array.from(atob(b64), (ch: string) => ch.charCodeAt(0))
  }
  const r = await fetch(ref)
  if (!r.ok) throw new Error(`Could not fetch reference image (${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}

async function generateImageBytes(
  provider: string,
  prompt: string,
  opts: { size?: string; referenceImageUrl?: string } = {},
): Promise<Uint8Array> {
  const p = (provider || 'openai').toLowerCase()
  if (p === 'openai') {
    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) throw new Error('OPENAI_API_KEY not configured')

    // Inspiration image supplied → gpt-image-1 edits (image + text → image).
    // No dall-e fallback here: dall-e-3 has no edits endpoint and dall-e-2
    // requires a mask, so image-guided generation needs gpt-image-1.
    if (opts.referenceImageUrl) {
      const refBytes = await fetchImageBytes(opts.referenceImageUrl)
      const form = new FormData()
      form.append('model', 'gpt-image-1')
      form.append('image', new Blob([refBytes], { type: 'image/png' }), 'reference.png')
      form.append('prompt', prompt)
      form.append('size', opts.size || '1024x1024')
      form.append('n', '1')
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` }, // fetch sets multipart boundary
        body: form,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (/gpt-image|verif|does not have access|must be verified/i.test(JSON.stringify(j?.error || '')))
          throw new Error('Inspiration-image generation needs gpt-image-1 access on this OpenAI org (verify the org, then retry).')
        throw new Error(j?.error?.message || `OpenAI edits error (${res.status})`)
      }
      const d = j?.data?.[0]
      if (d?.b64_json) return Uint8Array.from(atob(d.b64_json), (ch: string) => ch.charCodeAt(0))
      if (d?.url) { const ir = await fetch(d.url); return new Uint8Array(await ir.arrayBuffer()) }
      throw new Error('OpenAI returned no image data')
    }

    const call = (model: string, extra: Record<string, any> = {}) => fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: opts.size || '1024x1024', n: 1, ...extra }),
    })
    // Try gpt-image-1; fall back to dall-e-3 if this org doesn't have access to it.
    let res = await call('gpt-image-1')
    let j = await res.json().catch(() => ({}))
    if (!res.ok && /gpt-image|model|verif|does not have access|must be verified/i.test(JSON.stringify(j?.error || ''))) {
      res = await call('dall-e-3', { response_format: 'b64_json' })
      j = await res.json().catch(() => ({}))
    }
    if (!res.ok) throw new Error(j?.error?.message || `OpenAI image error (${res.status})`)
    const d = j?.data?.[0]
    if (d?.b64_json) return Uint8Array.from(atob(d.b64_json), (ch: string) => ch.charCodeAt(0))
    if (d?.url) { const ir = await fetch(d.url); return new Uint8Array(await ir.arrayBuffer()) }
    throw new Error('OpenAI returned no image data')
  }
  // if (p === 'replicate') { … real-API Flux/SDXL … }
  // if (p === 'midjourney') { … async relay submit → handled by a job endpoint … }
  throw new Error(`Image provider "${provider}" is not configured yet`)
}

app.post('/make-server-ed0fe4c2/admin/ai-generate-image', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { prompt, provider = 'openai', size = '1024x1024', bucket = 'catalog-media', referenceImageUrl } = await c.req.json()
    if (!prompt || typeof prompt !== 'string') return c.json({ success: false, error: 'prompt is required' }, 400)

    const bytes = await generateImageBytes(provider, prompt, { size, referenceImageUrl })

    const { data: existing } = await supabase.storage.getBucket(bucket)
    if (!existing) await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 })
    const path = `ai-generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (uploadErr) return c.json({ success: false, error: uploadErr.message }, 500)
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    console.log(`[Admin] AI image (${provider}${referenceImageUrl ? ', ref' : ''}) → ${path} by ${adminValidation.user?.email}`)
    return c.json({ success: true, publicUrl: urlData.publicUrl, prompt, provider })
  } catch (error: any) {
    console.error('[Admin] ai-generate-image error:', error)
    return c.json({ success: false, error: error?.message || 'Image generation failed' }, 500)
  }
})

// Admin: Delete catalog record
app.post('/make-server-ed0fe4c2/admin/catalog/delete', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { table, id } = await c.req.json()
    const allowedTables = ['catalog_elements', 'catalog_ingredients', 'catalog_recipes', 'catalog_products', 'catalog_equipment', 'catalog_cooking_methods', 'catalog_activities', 'catalog_symptoms', 'hs_tests', 'hs_supplements', 'hs_products']
    if (!allowedTables.includes(table)) return c.json({ success: false, error: `Invalid table: ${table}` }, 400)
    if (!id) return c.json({ success: false, error: 'Record ID is required' }, 400)
    if (table === 'catalog_products') { await kv.del(id); return c.json({ success: true }) }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return c.json({ success: false, error: error.message }, 500)
    return c.json({ success: true })
  } catch (error: any) { return c.json({ success: false, error: 'Internal server error' }, 500) }
})

// Admin: merge two catalog records — fold `duplicateId` into `survivorId`, re-pointing
// every reference (protocol_items links + recipe↔ingredient junction rows) onto the
// survivor, then delete the duplicate. "Preserving the junction records" = the junction
// rows are re-parented, not dropped (colliding duplicates are de-duped to respect the
// (recipe_id, ingredient_id) uniqueness).
app.post('/make-server-ed0fe4c2/admin/catalog/merge', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { kind, survivorId, duplicateId } = await c.req.json()
    if (!survivorId || !duplicateId) return c.json({ success: false, error: 'survivorId and duplicateId are required' }, 400)
    if (survivorId === duplicateId) return c.json({ success: false, error: 'Cannot merge a record into itself' }, 400)

    // referencing columns per catalog kind (table the id lives in + everything that points at it)
    const KIND_CFG: Record<string, { table: string; refs: { t: string; col: string }[] }> = {
      recipe:     { table: 'catalog_recipes',     refs: [{ t: 'protocol_items', col: 'catalog_recipe_id' },     { t: 'catalog_recipe_ingredients', col: 'recipe_id' }] },
      ingredient: { table: 'catalog_ingredients', refs: [{ t: 'protocol_items', col: 'catalog_ingredient_id' }, { t: 'catalog_recipe_ingredients', col: 'ingredient_id' }] },
      product:    { table: 'catalog_products',    refs: [{ t: 'protocol_items', col: 'catalog_product_id' }] },
      activity:   { table: 'catalog_activities',  refs: [{ t: 'protocol_items', col: 'catalog_activity_id' }] },
      supplement: { table: 'hs_supplements',      refs: [{ t: 'protocol_items', col: 'supplement_id' }] },
    }
    const cfg = KIND_CFG[kind]
    if (!cfg) return c.json({ success: false, error: `Invalid kind: ${kind}` }, 400)

    const repointed: Record<string, number> = {}
    for (const ref of cfg.refs) {
      // junction tables carry a (recipe_id, ingredient_id) pair — drop duplicate-side rows
      // that would collide with an existing survivor-side row before re-pointing the rest.
      if (ref.t === 'catalog_recipe_ingredients') {
        const otherCol = ref.col === 'recipe_id' ? 'ingredient_id' : 'recipe_id'
        const { data: survRows } = await supabase.from(ref.t).select(otherCol).eq(ref.col, survivorId)
        const survSet = new Set((survRows || []).map((r: any) => r[otherCol]))
        const { data: dupRows } = await supabase.from(ref.t).select(`id,${otherCol}`).eq(ref.col, duplicateId)
        const collide = (dupRows || []).filter((r: any) => survSet.has(r[otherCol])).map((r: any) => r.id)
        if (collide.length) await supabase.from(ref.t).delete().in('id', collide)
      }
      const { data, error } = await supabase.from(ref.t).update({ [ref.col]: survivorId }).eq(ref.col, duplicateId).select('id')
      if (error) return c.json({ success: false, error: `Re-point ${ref.t}.${ref.col} failed: ${error.message}` }, 500)
      repointed[`${ref.t}.${ref.col}`] = (data || []).length
    }

    // delete the now-orphaned duplicate (catalog_products may also live in the KV store)
    if (kind === 'product') { try { await kv.del(duplicateId) } catch (_e) { /* not a KV product */ } }
    const { error: delErr } = await supabase.from(cfg.table).delete().eq('id', duplicateId)
    if (delErr) return c.json({ success: false, error: `Delete duplicate failed: ${delErr.message}` }, 500)

    return c.json({ success: true, repointed })
  } catch (error: any) { return c.json({ success: false, error: 'Internal server error' }, 500) }
})

// Admin: AI Fill Fields — uses OpenAI to populate empty fields based on record name and existing data
app.post('/make-server-ed0fe4c2/admin/ai-fill-fields', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { tabType, recordData, fields, sampleRecords, context, mode } = await c.req.json()
    if (!tabType || !recordData || !fields) return c.json({ success: false, error: 'tabType, recordData, and fields are required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured. Set it with: supabase secrets set OPENAI_API_KEY=sk-...' }, 500)

    const isImproveMode = mode === 'improve'

    // Build the prompt
    const recordName = recordData.name || recordData.name_common || recordData.email || 'Unknown'
    const existingData: Record<string, any> = {}
    const emptyFields: { key: string; label: string; type: string; options?: string[]; placeholder?: string }[] = []

    // Helper: check if a nutrition/hazard JSON object is effectively empty
    const isEffectivelyEmpty = (key: string, val: any): boolean => {
      if (val === null || val === undefined || val === '') return true
      if (Array.isArray(val) && val.length === 0) return true
      if (typeof val === 'object' && !Array.isArray(val)) {
        if (Object.keys(val).length === 0) return true
        // elements_beneficial: treat as empty if no actual nutrient values exist
        if (key === 'elements_beneficial') {
          const p100 = val.per_100g || val.nutrition_per_100g || {}
          const hasAnyValue = JSON.stringify(p100).match(/[1-9]/)
          return !hasAnyValue
        }
        // elements_hazardous: treat as empty if no flagged elements
        if (key === 'elements_hazardous') {
          const entries = Object.entries(val)
          const hasFlagged = entries.some(([_, v]: [string, any]) => {
            if (typeof v === 'string') return v !== 'none' && v !== ''
            if (typeof v === 'object' && v) return v.level && v.level !== 'none'
            return false
          })
          return !hasFlagged
        }
        // taste_profile: treat as empty if all values are 0
        if (key === 'taste_profile') {
          return !JSON.stringify(val).match(/[1-9]/)
        }
        // nutrition_per_100g / nutrition_per_serving: treat as empty if no calorie value
        if (key === 'nutrition_per_100g' || key === 'nutrition_per_serving') {
          return !JSON.stringify(val).match(/[1-9]/)
        }
        // herbal_quality: treat as empty if no identity or no symptom uses
        if (key === 'herbal_quality') {
          const hq = val as any
          if (!hq.herbal_identity?.common_name && (!hq.symptom_uses || hq.symptom_uses.length === 0) && (!hq.mechanisms || hq.mechanisms.length === 0)) return true
          return false
        }
      }
      return false
    }

    // Field types that cannot be meaningfully AI-filled
    const SKIP_TYPES = new Set(['image', 'video', 'readonly', 'date', 'linked_elements', 'content_links'])

    // Improve mode: include ALL improvable fields (not just empty ones)
    // Text/description/JSON fields that benefit from rewriting
    const IMPROVE_ELIGIBLE_TYPES = new Set(['text', 'textarea', 'json', 'nutrition_editor', 'herbal_quality_editor', 'tags', 'select', 'number'])

    for (const f of fields) {
      const val = recordData[f.key]
      if (isImproveMode && !SKIP_TYPES.has(f.type) && IMPROVE_ELIGIBLE_TYPES.has(f.type)) {
        // In improve mode: put existing value in existingData for context, AND add to fields to rewrite
        if (!isEffectivelyEmpty(f.key, val)) existingData[f.key] = val
        emptyFields.push({ key: f.key, label: f.label, type: f.type, options: f.options, placeholder: f.placeholder })
      } else if (!isEffectivelyEmpty(f.key, val)) {
        existingData[f.key] = val
      } else if (!SKIP_TYPES.has(f.type)) {
        emptyFields.push({ key: f.key, label: f.label, type: f.type, options: f.options, placeholder: f.placeholder })
      }
    }

    if (emptyFields.length === 0) return c.json({ success: true, filledFields: {}, message: 'All fields already have data' })

    // Build sample context from existing records
    let sampleContext = ''
    if (sampleRecords && sampleRecords.length > 0) {
      const samples = sampleRecords.slice(0, 2).map((s: any) => {
        const relevant: Record<string, any> = {}
        for (const f of emptyFields) {
          if (s[f.key] !== null && s[f.key] !== undefined && s[f.key] !== '') relevant[f.key] = s[f.key]
        }
        return { name: s.name || s.name_common || s.email, ...relevant }
      }).filter((s: any) => Object.keys(s).length > 1)
      if (samples.length > 0) {
        sampleContext = `\n\nHere are example records from the same table for format reference:\n${JSON.stringify(samples, null, 2)}`
      }
    }

    // Build structured format hints for special field types
    const isRecipeTab = (tabType || '').toLowerCase().includes('recipe') || (tabType || '').toLowerCase().includes('meal')
    const structuredFormats: Record<string, string> = {
      'taste_profile': isRecipeTab
        ? `JSON object with exact structure: {"taste":{"sweet":0-10,"sour":0-10,"salty":0-10,"bitter":0-10,"umami":0-10,"spicy":0-10},"texture":{"crispy":0-10,"crunchy":0-10,"chewy":0-10,"smooth":0-10,"creamy":0-10,"juicy":0-10}}. IMPORTANT: Read the cooking steps and full ingredient list provided in the context above. Analyse HOW the ingredients are cooked (e.g. roasting adds sweetness/bitterness, frying adds crunch, braising adds umami/richness, spices add heat) and derive the OVERALL finished-dish flavour and texture profile — not just the raw ingredients in isolation. Use realistic 0-10 values that reflect the final eating experience of this specific recipe.`
        : `JSON object with exact structure: {"taste":{"sweet":0-10,"sour":0-10,"salty":0-10,"bitter":0-10,"umami":0-10,"spicy":0-10},"texture":{"crispy":0-10,"crunchy":0-10,"chewy":0-10,"smooth":0-10,"creamy":0-10,"juicy":0-10}}. Use realistic values based on the sensory profile of this ingredient.`,
      'nutrition_per_100g': `JSON object with macro values per 100g: {"calories":number,"protein_g":number,"carbohydrates_g":number,"fats_g":number,"fiber_g":number,"sugar_g":number,"water_g":number,"sodium_mg":number}. IMPORTANT: "water_g" is the water content per 100g (e.g. apple=86, chicken breast=65, rice=12, bread=36). The mobile app uses this for hydration tracking. Use real USDA/nutritional database values.`,
      'nutrition_per_serving': `JSON object with macro values per typical serving: {"calories":number,"protein_g":number,"carbohydrates_g":number,"fats_g":number,"fiber_g":number,"sugar_g":number,"water_g":number,"sodium_mg":number,"serving_size_g":number}. Include "water_g" for hydration tracking. Base serving size on typical portion for this ${isRecipeTab ? 'recipe/dish' : 'product/ingredient'}.`,
      'prep_time': `String with time and unit, e.g. "15 min" or "1 hour". Realistic prep time for this recipe.`,
      'cook_time': `String with time and unit, e.g. "30 min" or "1 hour 15 min". Realistic cooking time for this recipe.`,
      'servings': `Integer number of servings this recipe yields, e.g. 4`,
      'difficulty': `One of: "easy", "medium", "hard". Based on technique complexity and time required.`,
      'meal_slot': `JSON array of applicable meal times from: ["breakfast","lunch","dinner","snack","dessert","appetizer","side dish"]. Include all that apply.`,
      'cuisine': `String name of the cuisine origin, e.g. "Italian", "Japanese", "Mexican", "Mediterranean".`,
      'processing_methods': `JSON array of applicable processing methods. Common values: ["raw","cooked","fermented","dried","smoked","pickled","roasted","steamed","fried","baked","freeze-dried","cold-pressed","pasteurized","homogenized","refined","extracted"]. Only include methods that actually apply.`,
      'category_sub': isRecipeTab
        ? `JSON array of subcategory strings relevant to this recipe's main category. E.g. for "meal": ["One-Pot","High-Protein","Gluten-Free"]. For "beverage": ["Smoothie","Cold-Pressed"].`
        : `JSON array of subcategory strings relevant to this ingredient's main category.`,
      'elements_beneficial': `JSON object: {"serving":{"name":"e.g. 1 cup","size_g":number},"per_100g":{"calories":number,"macronutrients":{"protein_g":g,"fat_g":g,"carbohydrates_g":g,"fiber_g":g,"sugars_g":g,"water_g":g},"vitamins":{"vitamin_a_mcg":mcg,"vitamin_d3_mcg":mcg,"vitamin_e_mg":mg,"vitamin_k2_mcg":mcg,"vitamin_c_mg":mg,"thiamine_mg":mg,"riboflavin_mg":mg,"niacin_mg":mg,"pantothenic_acid_mg":mg,"pyridoxine_mg":mg,"biotin_mcg":mcg,"folate_mcg":mcg,"vitamin_b12_mcg":mcg},"minerals":{"calcium_mg":mg,"phosphorus_mg":mg,"magnesium_mg":mg,"sodium_mg":mg,"potassium_mg":mg,"iron_mg":mg,"zinc_mg":mg,"copper_mg":mg,"manganese_mg":mg,"selenium_mcg":mcg,"iodine_mcg":mcg,"chromium_mcg":mcg,"molybdenum_mcg":mcg},"amino_acids":{"leucine_g":g,"isoleucine_g":g,"valine_g":g,"lysine_g":g,"methionine_g":g,"phenylalanine_g":g,"threonine_g":g,"tryptophan_g":g,"histidine_g":g},"fatty_acids":{"omega_3_mg":mg,"omega_6_g":g,"saturated_g":g,"monounsaturated_g":g,"polyunsaturated_g":g},"antioxidants":{"beta_carotene_mg":mg,"lutein_mg":mg,"lycopene_mg":mg},"functional":{"choline_mg":mg,"coq10_mg":mg},"digestive":{"soluble_fiber_g":g,"insoluble_fiber_g":g}},"per_serving":{...same structure...}}. Use real USDA-level data. Only include nutrients meaningfully present (>0). ALWAYS populate macronutrients, vitamins, and minerals for any real food ingredient.`,
      'elements_hazardous': `JSON object mapping element IDs to risk objects: {"element_id": {"level": "trace|low|moderate|high", "per_100g": number_in_mg_or_mcg, "per_serving": number_in_mg_or_mcg, "likelihood": 0-100, "reason": "brief explanation"}, ...}. Only include elements with level OTHER than "none". "per_100g" is the estimated quantity of this contaminant per 100g (in mg or mcg as appropriate). "per_serving" is per typical serving. "likelihood" is the % chance this risk is present (0-100). "reason" is a brief scientific explanation of WHY this risk exists for this ingredient. You MUST use ONLY these exact element IDs:
NATURAL FOOD COMPOUNDS (check these first for whole foods): oxalates, phytates, lectins, solanine, tannins, goitrogens, saponins, ciguatoxin, grayanotoxins, hypoglycin_a, pyrrolizidine_alkaloids, sambunigrin, saxitoxin, tetrodotoxin.
STORAGE & SPOILAGE (mycotoxins): aflatoxin_b1, ochratoxin_a, deoxynivalenol, fumonisin_b1, zearalenone, patulin, citrinin, ergot_alkaloids, nivalenol, t_2_toxin.
ENVIRONMENTAL CONTAMINATION (heavy metals etc): lead, mercury, cadmium, arsenic, chromium_vi, antimony, thallium, uranium, bisphenol_a, bisphenol_f, bisphenol_s, microplastics, pfas, pfoa, pfos, pcbs, dioxins_tcdd, furans.
FARMING CHEMICALS: glyphosate, chlorpyrifos, atrazine, ddt, permethrin, imidacloprid, malathion, cypermethrin, endosulfan, fipronil, clothianidin, thiamethoxam, neonicotinoids, 2_4_d, carbaryl, carbofuran, diazinon, dicamba, lindane, paraquat, aldrin, dieldrin, heptachlor, chlordane.
PROCESSING BYPRODUCTS: acrylamide, benzo_a_pyrene, nitrosamines, anthracene, fluoranthene, pyrene, naphthalene, phenanthrene.
ADDITIVES (only for processed foods): aspartame, sodium_nitrite, sodium_nitrate, bha_butylated_hydroxyanisole, bht_butylated_hydroxytoluene, carrageenan, sodium_benzoate, potassium_bromate, tbhq_tertiary_butylhydroquinone, titanium_dioxide, high_fructose_corn_syrup, maltodextrin, sucralose, saccharin, tartrazine, allura_red_ac, caramel_color, polysorbate_80, caffeine, ethanol.
VETERINARY DRUGS & HORMONES (check for animal products): rbgh_rbst, estradiol, zeranol, trenbolone_acetate, melengestrol_acetate, progesterone, testosterone, igf_1, ractopamine, clenbuterol.
ANTIBIOTICS (farmed animals): tetracycline, oxytetracycline, amoxicillin, sulfamethazine, enrofloxacin, chloramphenicol, florfenicol, erythromycin.
AQUACULTURE CHEMICALS (farmed fish/seafood): emamectin_benzoate, malachite_green, ethoxyquin, synthetic_astaxanthin, diflubenzuron, ivermectin, fenbendazole.
MICROORGANISMS: salmonella, e_coli_o157_h7, listeria_monocytogenes, campylobacter_jejuni, staphylococcus_aureus, bacillus_cereus, clostridium_botulinum, clostridium_perfringens, vibrio_parahaemolyticus, norovirus, hepatitis_a_virus, toxoplasma_gondii, cyclospora_cayetanensis, cryptosporidium_parvum, anisakis_simplex, diphyllobothrium_latum.
IMPORTANT RULES:
- For nuts, seeds, grains, vegetables: ALWAYS check oxalates, phytates, lectins, tannins, goitrogens, saponins, aflatoxin_b1.
- For fish/seafood: ALWAYS check mercury, lead, pcbs, dioxins_tcdd, microplastics, pfas, anisakis_simplex (parasites), vibrio_parahaemolyticus, and for FARMED fish also check ethoxyquin, emamectin_benzoate, synthetic_astaxanthin, antibiotics (oxytetracycline, florfenicol, erythromycin).
- For meat/poultry/dairy: ALWAYS check for hormones (rbgh_rbst, estradiol, ractopamine), antibiotics (tetracycline, amoxicillin), salmonella, campylobacter_jejuni, e_coli_o157_h7.
Be thorough — flag ALL real, evidence-based concerns with accurate quantities.`,
      'reason': `Text explaining where this element comes from. For beneficial elements (vitamins, minerals, etc.): list the top 3-5 food ingredients that naturally contain it (e.g. "Found naturally in spinach, kale, broccoli, and liver"). For hazardous elements: explain the industrial process or environmental pathway that produces it (e.g. "Byproduct of high-temperature frying and baking of starchy foods" or "Leaches from plastic packaging into food"). Always be specific about source ingredients or processes.`,
      'food_sources': `Comma-separated list of specific food ingredients rich in this element. Be specific (e.g. "beef liver, spinach, lentils, chickpeas" not just "meat, vegetables").`,
      'raw_ingredients': `JSON array of ingredient UUIDs that are the raw source ingredients for this processed ingredient. For example, garlic powder's raw ingredients would be [garlic_uuid]. Tomato sauce's raw ingredients would be [tomato_uuid, olive_oil_uuid, garlic_uuid, onion_uuid, salt_uuid]. If the ingredient is raw/unprocessed, return an empty array []. IMPORTANT: You must return actual UUIDs from the catalog_ingredients table. If you don't know the exact UUIDs, return a JSON array of ingredient name strings like ["Tomato", "Olive Oil", "Garlic"] and the system will match them.`,
      'linked_ingredients': `JSON array of ingredient UUIDs or name strings that make up this recipe/product. List ALL key ingredients. For example, a Mediterranean Salad would be ["Tomato", "Cucumber", "Red Onion", "Olive Oil", "Feta Cheese", "Kalamata Olives", "Lemon"]. Return ingredient names if UUIDs are unknown.`,
      'ingredients': `JSON array of ingredient entries. Each entry is EITHER a plain item OR a group. Plain item: {"name":"Tomatoes","ingredient_id":null}. Group (use when multiple items belong to the same category): {"group":"Fresh Herbs","items":[{"name":"Basil","ingredient_id":null},{"name":"Parsley","ingredient_id":null}]}. Rules: (1) Use groups when ingredients naturally cluster (e.g. "Fresh Herbs", "Spices", "For the Dressing", "Vegetables"). (2) Single ingredients that don't belong to a group should be plain items. (3) Always use "ingredient_id": null — the system will auto-resolve IDs. (4) Be specific with ingredient names (e.g. "Cherry Tomatoes" not "Tomatoes"). Example for Gazpacho: [{"name":"Cherry Tomatoes","ingredient_id":null},{"name":"Cucumber","ingredient_id":null},{"name":"Red Bell Pepper","ingredient_id":null},{"name":"Red Onion","ingredient_id":null},{"name":"Garlic","ingredient_id":null},{"group":"Dressing","items":[{"name":"Olive Oil","ingredient_id":null},{"name":"Red Wine Vinegar","ingredient_id":null},{"name":"Lemon Juice","ingredient_id":null}]},{"group":"Fresh Herbs","items":[{"name":"Basil","ingredient_id":null},{"name":"Parsley","ingredient_id":null}]},{"group":"Seasoning","items":[{"name":"Salt","ingredient_id":null},{"name":"Black Pepper","ingredient_id":null}]}]`,
      'origin_country': `The primary country of origin for this ingredient. Use the most historically significant or commonly associated country (e.g. "Japan" for miso, "Mexico" for avocado, "Ethiopia" for coffee). Return a single country name string.`,
      'origin_region': `The specific region, province, or state within the country of origin most associated with this ingredient (e.g. "Oaxaca" for mole, "Hokkaido" for king crab, "Champagne" for champagne grapes). Return a single region name string, or empty string if not region-specific.`,
      'origin_city': `A specific city, town, or locality historically associated with this ingredient if applicable (e.g. "Parma" for Parmigiano-Reggiano, "Darjeeling" for Darjeeling tea). Return a single city name string, or empty string if not city-specific.`,
      'culinary_history': `A 3-5 sentence history of this ingredient's culinary use. Cover: when and where it was first cultivated or used, how it spread to other cultures, its traditional culinary roles, any significant historical events tied to it, and its modern global use. Be specific with dates and cultures where known.`,
      'description_processing': `Text describing how this processed ingredient is manufactured from its raw source ingredients. Include the key steps, temperatures, and techniques used. If the ingredient is raw/unprocessed, return an empty string.`,
      'description_simple': `A 1-2 sentence consumer-friendly description. For elements: plain-language summary of what it is and why it matters (shown in top card). For ingredients: what it is, where it comes from, and what it's commonly used for.`,
      'description_technical': `A detailed 2-4 sentence scientific description. For elements: biochemical mechanism, metabolic pathway, and clinical significance. For ingredients: botanical/zoological classification, key bioactive compounds, and nutritional significance.`,
      'health_benefits': `For ingredients/recipes: a concise paragraph of evidence-based health benefits. For elements: JSON object with structure: {"optimal_health":["🎯 Benefit 1","🎯 Benefit 2"],"beneficial_aspects":["🟢 Aspect 1","🟢 Aspect 2"],"safety_considerations":["⚠️ Caution 1","⚠️ Caution 2"]}. Use emoji prefixes as shown.`,
      'description_full': `JSON object with ALL of these keys filled with user-facing copy (2-4 sentences each):
{
  "simple": "Plain-language summary — what it is and why it matters",
  "technical": "Scientific/biochemical description for advanced users",
  "harmful_effects": "For beneficial: too-high effects. For hazardous: damage mechanisms",
  "what_depletes": "Common causes of low levels (beneficial) or common exposure sources (hazardous)",
  "how_builds": "How it accumulates — storage mechanism, repeated intake, fat-soluble etc.",
  "how_lasts": "Timeline — how long it stays in the body, clearance rate",
  "when_to_supplement": "Conditional advice on supplementation (beneficial) or N/A for hazardous",
  "needed_for_absorption": "Co-factors needed — e.g. fat, zinc, vitamin C",
  "pregnancy_considerations": "Clear pregnancy/fetal safety guidance",
  "summary_bullets": "Comma-separated key facts (4-6 items)",
  "risk_benefit_analysis": "Balanced risk vs benefit assessment",
  "therapeutic_window": "Safe dosage range with units",
  "primary_functions": "Core biological functions (2-3 sentences)",
  "regulation": "How the body regulates levels — homeostasis mechanisms",
  "age_variations": "How needs/risks change with age",
  "gender_differences": "Sex-specific differences in metabolism or requirements",
  "stress_response": "How physical/mental stress affects levels",
  "circadian_rhythm": "Time-of-day considerations for intake/absorption",
  "monitoring_requirements": "What tests to monitor and how often",
  "population_considerations": "High-risk populations and special groups"
}
IMPORTANT: Every key must have real, factual content — no placeholders. Write as if the user will read it directly.`,
      'deficiency': `JSON object for beneficial elements: {
  "name": "Deficiency name (e.g. Scurvy, Iron Deficiency Anemia)",
  "causes": ["cause1", "cause2", "cause3"],
  "symptoms": {"early": ["symptom1","symptom2"], "moderate": ["symptom1","symptom2"], "severe": ["symptom1","symptom2"]},
  "diagnosis": {"laboratory_tests": ["test1"], "clinical_signs": ["sign1"], "differential_diagnosis": ["condition1"]},
  "treatment": {"dietary_changes": "advice", "supplementation": "dose guidance", "monitoring": "follow-up plan"},
  "complications": ["complication1", "complication2"],
  "at_risk_populations": ["group1", "group2"]
}. Use real clinical data.`,
      'interactions': `JSON object: {
  "nutrients": [{"nutrient":"Name","interaction_type":"synergistic|competitive|antagonistic","mechanism":"how","clinical_significance":"impact"}],
  "medications": [{"drug":"Name","interaction_type":"enhances_effect|decreases_absorption","severity":"minor|moderate|major","mechanism":"how","management":"advice"}],
  "conditions": [{"condition":"Name","interaction":"effect","management":"advice"}],
  "herbs": [{"herb":"Name","interaction":"effect","recommendation":"advice"}]
}. Include real, evidence-based interactions only.`,
      'thresholds': `JSON object with measurement ranges: {
  "unit": "mg|mcg|IU",
  "rdi": {"adult_male": number, "adult_female": number, "children": number, "pregnant": number},
  "deficient": {"below": number, "label": "Below your body's needs. Symptoms may appear over time."},
  "optimal": {"min": number, "max": number, "label": "Best range for daily function and long-term health."},
  "excess": {"above": number, "label": "Higher-than-needed intake. Risk increases if repeated."},
  "ul": number
}. For hazardous elements use: {"unit":"mg/kg bw/day|ppb|ppm","optimal":{"below":number,"label":"Below guidance threshold — risk is lower."},"excess":{"above":number,"label":"Above threshold — repeated exposure increases risk."},"regulatory_limits":{"fda":number,"who":number,"eu":number}}. Use real WHO/FDA/EFSA reference values.`,
      'age_ranges': `JSON object with BOTH "europe" and "north_america" arrays. Each array contains entries for age groups: 0-6m, 7-12m, 1-3y, 4-8y, 9-13y, 14-18y, 19-30y, 31-50y, 51+y, plus standalone "pregnancy" and "breastfeeding" entries.
Each entry: {"age_group":"0-6m","basis":"per_day","male":{...},"female":{...}}
Each gender block: {
  "deficiency":{"threshold":number,"mild":{"symptoms":["🟠 symptom1","🟠 symptom2"]},"severe":{"symptoms":["🔴 symptom1","🔴 symptom2"]}},
  "optimal":{"minimum":number,"recommended":number,"maximum":number,"benefits":["🟢 benefit1","🟢 benefit2","🟢 benefit3","🟢 benefit4","🟢 benefit5","🟢 benefit6"]},
  "excess":{"daily_limit":{"value":number,"symptoms":["🔴 symptom1","🔴 symptom2"]},"acute_limit":{"value":number,"symptoms":["🔴 symptom1","🔴 symptom2"]}}
}
For female entries in age groups 14-18y, 19-30y, 31-50y: also include "pregnancy" and "breastfeeding" sub-objects with their own optimal+excess blocks.
RULES:
- Use REAL EFSA values for europe and REAL NIH DRI values for north_america
- deficiency.threshold = ~70% of recommended (clinical deficiency cutoff)
- optimal.minimum = EAR or lower bound of adequate intake
- optimal.recommended = RDA or AI (Adequate Intake)
- optimal.maximum = UL (Tolerable Upper Intake Level)
- excess.daily_limit.value = UL
- excess.acute_limit.value = ~1.5× UL (acute toxicity threshold)
- Include 2 mild deficiency symptoms and 2 severe deficiency symptoms
- Include 6 optimal benefits
- Include 2 daily excess symptoms and 2 acute excess symptoms
- Use emoji prefixes: 🟠 for deficiency, 🟢 for benefits, 🔴 for excess
- All values in the element's native unit (μg RAE for Vitamin A, mg for Vitamin C, etc.)
- Pregnancy/breastfeeding entries: standalone age_group entries have ONLY "female" key (no "male")`,
      'daily_recommended_adult': `JSON: {"male":{"value":number,"unit":"unit_string"},"female":{"value":number,"unit":"unit_string"}}. Use RDA for adults 19-50y. Unit should match the element's standard (e.g. "μg RAE", "mg", "mcg", "IU").`,
      'regions_meta': `JSON: {"europe":{"authority":"European Food Safety Authority (EFSA)","reference_url":"https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values","notes":"Based on EFSA Dietary Reference Values"},"north_america":{"authority":"National Academies of Sciences, Engineering, and Medicine","reference_url":"https://www.nationalacademies.org/our-work/dietary-reference-intakes-for-nutrients","notes":"Based on Dietary Reference Intakes (DRIs)"}}`,
      'testing_or_diagnostics': `JSON: {"matrix":"serum|urine|whole_blood|hair","best_test":"🩸 Test name","why_best":"Why this is the gold standard","optimal_range":{"low":number,"high":number,"unit":"unit"},"detection_threshold":{"value":number,"unit":"unit"},"frequency":"When to test","method":"clinic|home|lab","self_test_available":boolean,"turnaround_days":number,"methods":[{"name":"Test name","description":"What it measures","accuracy":"High|Moderate|Low","cost":"Low|Moderate|High","availability":"Description"}]}. Use real clinical laboratory reference ranges.`,
      'interventions': `JSON array of 2-4 interventions: [{"title":"💊 Intervention name","type":"supplement|lifestyle|herbal|dietary","phase":["deficiency","optimal"],"description":"What and why","mechanism":"How it works biochemically","timing":"When to take","duration":"How long","contraindications":["condition1"],"monitoring":"What to monitor","evidence":[{"label":"Source name","url":"pubmed_url"}],"products":[],"region_scope":["europe","north_america"],"age_scope":["9-13y","14-18y","19-30y","31-50y","51+y"],"tags":["first_line"],"confidence":"established|emerging|traditional","dosage_by_age_gender":{"europe":[{"age_group":"0-6m","male":{"amount":number,"unit":"unit","frequency":"daily","timing":"with meals"},"female":{...},"pregnancy":null,"breastfeeding":null},...],"north_america":[...same...]},"blood_level_conversion":{"conversion_factor":number,"blood_unit":"unit","target_range":"range","notes":"conversion note"},"notes":"Additional notes"}]. Include at least: 1 supplement, 1 lifestyle/dietary, 1 herbal/traditional. Use real dosages from clinical guidelines.`,
      'key_interactions': `JSON array of 3-6 interactions: [{"element":"Element name","type":"synergistic|antagonistic|competitive","description":"How they interact and clinical significance","reference":"https://pubmed.ncbi.nlm.nih.gov/PMID/","id":"element_type"}]. Include real PubMed references. Cover both enhancing and inhibiting interactions.`,
      'food_data': `JSON: {"strategy":{"animal":"Strategy for animal sources","plant":"Strategy for plant sources","fortified":"Strategy for fortified foods","fermented":"Strategy for fermented foods","other":"General absorption tips"},"sources":{"description":"Overview of major sources","animal":[{"name":"🥩 Food name","amount_100g":number,"unit":"unit","bioavailability":0-100,"source":"USDA FDC","source_url":"https://fdc.nal.usda.gov/","notes":"Preparation and form","id":"food_id"}],"plant":[...],"fortified":[...],"fermented":[...],"other":[...]},"bioavailability":{"factors_enhancing":["factor1"],"factors_inhibiting":["factor1"],"absorption_rate":"percentage or range","optimal_conditions":"with_meals|empty_stomach|etc"},"preparation_methods":{"best_retention":["method1"],"cooking_losses":"minimal|moderate|significant","storage_stability":"stable|sensitive_to_light|etc"}}. Use real USDA values. Include 3+ animal sources, 4+ plant sources, 1+ fortified, 1+ fermented.`,
      'content_urls': `JSON: {"wikipedia":"https://en.wikipedia.org/wiki/Element_name","examine":"https://examine.com/supplements/element/","pubmed":"https://pubmed.ncbi.nlm.nih.gov/?term=element+nutrition","nih_factsheet":"https://ods.od.nih.gov/factsheets/Element-HealthProfessional/"}. Use real URLs that exist.`,
      'other_names': `JSON array of alternative names for this element: ["Name1","Name2","Name3"]. Include scientific names, common abbreviations, and chemical forms (e.g. for Vitamin A: ["Retinol","Retinyl acetate","Retinyl palmitate","Beta-carotene","Provitamin A carotenoids"]).`,
      'slug_path': `URL-friendly identifier string in snake_case: e.g. "vitamin_a", "iron", "vitamin_b12", "omega_3". Must be unique across all elements.`,
      'confidence': `One of: "verified", "ai_generated", "draft", "needs_review". Set to "ai_generated" for AI-filled data.`,
      'food_sources_detailed': `JSON array of top food sources: [{"name":"Beef liver","amount":"9442 mcg / 100g","category":"animal"},{"name":"Sweet potato","amount":"961 mcg / 100g","category":"plant"},...]. Include 8-12 sources with real USDA values. Include both animal and plant sources where applicable.`,
      'food_strategy': `JSON object with strategy cards: {"cards":[{"title":"Card Title","subtitle":"brief qualifier","body":"2-3 sentence explanation of this source strategy"}]}. For beneficial elements with both animal and plant sources, include 2 cards (e.g. "Animal Retinol (fast-acting)" and "Plant Carotenoids (safer, self-limited)"). For hazardous elements, include 1-2 cards about exposure reduction strategies.`,
      'risk_tags': `JSON array of risk/hazard tag strings. For hazardous elements: ["endocrine_disruptor","reproductive_harm","developmental_toxicity","liver_damage","kidney_damage","cancer_suspect","neurotoxin","immunotoxin"]. For beneficial elements with excess risks: ["hypervitaminosis","liver_toxicity","teratogenic"]. Only include tags supported by evidence.`,
      'functions': `JSON array of function strings. For beneficial: ["vision_support","immune_defence","cell_growth","antioxidant_protection","bone_health","energy_metabolism"]. For hazardous: ["endocrine_disruption","oxidative_stress","dna_damage"]. Use snake_case.`,
      'detox_strategy': `For hazardous elements: practical 3-5 sentence guidance on how to reduce exposure. Include specific actionable swaps (e.g. "Avoid heating food in plastic", "Choose fragrance-free products", "Use glass/steel storage"). For beneficial elements: leave as empty string "".`,
      'found_in': `JSON array of where this element is commonly found: ["food","supplements","water","soil","packaging","cosmetics","household_products","industrial"]. Only include relevant sources.`,
      'herbal_quality': `JSON object describing the pharmacological/herbal properties of this ingredient. Structure:
{
  "herbal_identity": {"common_name": "string", "latin_name": "string (binomial)", "summary": "2-3 sentence pharmacological description"},
  "mechanisms": [{"mechanism_type": "anti-inflammatory|antioxidant|antimicrobial|adaptogenic|analgesic|anxiolytic|carminative|demulcent|diuretic|expectorant|hepatoprotective|immunomodulatory|nervine|sedative|spasmolytic|tonic|vasodilator|vulnerary", "biological_system": "nervous|immune|digestive|cardiovascular|respiratory|endocrine|musculoskeletal|integumentary|urinary|reproductive|lymphatic|hepatic|whole body", "description": "how this mechanism works"}],
  "symptom_uses": [{"symptom_name": "symptom name matching catalog_symptoms", "effectiveness": "high|moderate|low", "evidence_level": "clinical|observational|traditional", "onset": "acute|chronic"}],
  "dosage_ranges": [{"preparation": "tea / infusion|tincture|capsule|powder|essential oil|decoction|extract|fresh|dried", "min": number, "max": number, "unit": "mg|g|ml|drops|cups", "population_notes": "e.g. Adults only"}],
  "risks": [{"type": "side_effect|contraindication|toxicity", "description": "description", "severity": "mild|moderate|severe"}],
  "interactions": [{"interacts_with": "drug or herb name", "severity": "mild|moderate|severe", "mechanism": "how they interact"}],
  "evidence": {"level": "systematic review|RCT|cohort study|expert opinion|traditional use|in-vitro only|animal study", "sources": ["URL or citation"], "reviewer": "", "last_reviewed": ""},
  "scoring_hint": {"category": "therapeutic|adaptogenic|nutritive|toxic", "default_direction": "positive|negative|neutral", "magnitude": 1-10, "conditional_rules": []}
}
RULES:
- Include 2-5 mechanisms based on real pharmacological data
- Include 3-8 symptom uses with real evidence-based effectiveness ratings
- Include 1-3 dosage ranges for common preparations
- Include ALL known risks and drug interactions (be thorough for safety)
- Use real symptom names that match common medical terminology
- If this ingredient has NO meaningful herbal/medicinal properties (e.g. plain rice, sugar), return an empty object {}
- Map effectiveness to scoring: high=8, moderate=5, low=2`,
    }

    const fieldDescriptions = emptyFields.map(f => {
      let desc = `- "${f.key}" (${f.label}): type=${f.type}`
      if (f.options) desc += `, allowed values: [${f.options.join(', ')}]`
      if (f.placeholder) desc += `, example: ${f.placeholder}`
      if (structuredFormats[f.key]) desc += `\n  FORMAT: ${structuredFormats[f.key]}`
      return desc
    }).join('\n')

    const systemPrompt = isImproveMode
      ? `You are a senior health & nutrition scientist and professional culinary writer for the HealthScan app. Your task is to IMPROVE and REWRITE existing database fields to be more scientifically accurate, more specific, and richer in culinary and nutritional depth. Always return valid JSON. Use real USDA/WHO/EFSA data. For descriptions: write with precision — cite specific compounds, mechanisms, and culinary techniques. For recipes: write steps that are chef-quality with exact temperatures, timings, and technique rationale. For nutrition: use precise USDA-level values. For select/tags fields, only use the allowed values. For number fields, return numbers. For array fields, return arrays. For JSON fields, return properly structured objects matching the FORMAT specified.
CRITICAL FIELD KEY RULES — you MUST use these exact keys in your JSON output:
- For recipe records: use "name_common" (NOT "name") for the recipe name field
- For recipe records: use "meal_slot" (NOT "type") for the meal timing/slot field
- Never invent field keys — only return keys that were explicitly listed in the fields to improve`
      : `You are a health & nutrition data assistant for the HealthScan app. You populate database fields with accurate, well-formatted data based on real nutritional science and USDA/WHO data. Always return valid JSON. Be factual and use real data — do not make up nutritional values. For select/tags fields, only use the allowed values. For number fields, return numbers. For array fields, return arrays. For JSON fields, return properly structured objects matching the FORMAT specified. For text/textarea, return well-written strings. For boolean fields, return true or false.
CRITICAL FIELD KEY RULES — you MUST use these exact keys in your JSON output:
- For recipe records: use "name_common" (NOT "name") for the recipe name field
- For recipe records: use "meal_slot" (NOT "type") for the meal timing/slot field (e.g. breakfast, lunch, dinner)
- Never invent field keys — only return keys that were explicitly listed in the fields to fill`

    const userPrompt = isImproveMode
      ? `I have a ${tabType} record named "${recordName}" with this EXISTING data that needs to be improved:
${JSON.stringify(existingData, null, 2)}
${context ? `\nAdditional context: ${context}\n` : ''}
Please REWRITE and IMPROVE these fields with greater scientific accuracy and culinary depth:
${fieldDescriptions}
${sampleContext}

IMPROVE MODE RULES:
- Descriptions: rewrite to be more specific, scientific, and informative. Replace vague language with precise compound names, mechanisms, and evidence-based claims.
- Culinary descriptions: add specific flavour notes, texture details, cooking chemistry, and technique rationale. Name specific cultivars, regions, or preparations where relevant.
- Recipe steps/instructions: rewrite as chef-quality instructions with exact temperatures (°C/°F), timings, visual/sensory cues, and brief explanations of WHY each technique matters.
- Nutrition data (elements_beneficial): verify and improve values to match real USDA data. Add any missing nutrient categories. Ensure per_100g and per_serving are both populated.
- Hazardous elements: verify levels against current scientific literature. Add any missing real concerns with accurate quantities.
- taste_profile: recalibrate values based on the full ingredient/recipe profile — be precise, not generic.
- For Element records: expand description_full with deeper biochemical mechanisms, clinical significance, and population-specific considerations.
- For all records: improve specificity — replace generic statements with named compounds, studies, or culinary traditions.

Return ONLY a JSON object with the field keys and their improved values. No markdown, no explanation, just the JSON object.`
      : `I have a ${tabType} record named "${recordName}" with this existing data:
${JSON.stringify(existingData, null, 2)}
${context ? `\nAdditional context provided by the admin: ${context}\n` : ''}
Please fill in these empty fields with accurate, real-world data:
${fieldDescriptions}
${sampleContext}

IMPORTANT: 
- For nutrition data (elements_beneficial), use real USDA-level values per 100g. Only include nutrients meaningfully present.
- For hazardous elements (elements_hazardous), be realistic — most whole foods have minimal hazards. Only flag real concerns.
- For taste_profile, use 0-10 scale based on the actual sensory profile of this ingredient.
- For processing_methods, only include methods that actually apply.
- For category_sub, pick subcategories that match the ingredient's main category.
- For description_processing, describe how the ingredient is made if it's processed. Leave empty string if raw.
- For Element records: description_full is the MOST IMPORTANT field — fill ALL keys with real, user-facing copy (no placeholders). Write as if users read it directly.
- For Element records: deficiency, interactions, thresholds, food_sources_detailed, food_strategy must use real clinical/USDA/WHO data.
- For hazardous elements: always fill detox_strategy with practical exposure reduction advice. Fill risk_tags with evidence-based hazard categories.
- For beneficial elements: always fill functions with specific biological roles. Fill thresholds with real RDI/UL values.

Return ONLY a JSON object with the field keys and their values. No markdown, no explanation, just the JSON object.`

    console.log(`[AI Fill] ${isImproveMode ? 'IMPROVE' : 'FILL'} mode for ${tabType} "${recordName}" — ${emptyFields.length} fields`)

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: emptyFields.some((f: any) => f.key === 'description_full') ? 12000 : 8000,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[AI Fill] OpenAI error:', errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 500)
    }

    const openaiData = await openaiRes.json()
    const content = openaiData.choices?.[0]?.message?.content
    if (!content) return c.json({ success: false, error: 'No content returned from AI' }, 500)

    let filledFields: Record<string, any>
    try {
      filledFields = JSON.parse(content)
    } catch {
      console.error('[AI Fill] Failed to parse AI response:', content)
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    // Validate: only return fields that were in emptyFields list
    const validKeys = new Set(emptyFields.map(f => f.key))
    const validated: Record<string, any> = {}
    for (const [key, val] of Object.entries(filledFields)) {
      if (validKeys.has(key)) validated[key] = val
    }

    // Post-process: ensure taste_profile is a proper object (not a string)
    if (validated['taste_profile'] !== undefined) {
      let tp = validated['taste_profile']
      if (typeof tp === 'string') {
        try { tp = JSON.parse(tp) } catch { tp = null }
      }
      if (tp && typeof tp === 'object' && !Array.isArray(tp)) {
        const tasteKeys = ['sweet', 'sour', 'salty', 'bitter', 'umami', 'spicy']
        const textureKeys = ['crispy', 'crunchy', 'chewy', 'smooth', 'creamy', 'juicy']
        const ensureNumeric = (obj: any, keys: string[]) => {
          const result: Record<string, number> = {}
          for (const k of keys) result[k] = typeof obj?.[k] === 'number' ? obj[k] : 0
          return result
        }
        // Handle flat format: { sweet: 5, crispy: 3 } instead of { taste: { sweet: 5 }, texture: { crispy: 3 } }
        const isFlat = !tp.taste && !tp.texture
        const tasteSource = isFlat ? tp : tp.taste
        const textureSource = isFlat ? tp : tp.texture
        const normalized = {
          taste: ensureNumeric(tasteSource, tasteKeys),
          texture: ensureNumeric(textureSource, textureKeys),
        }
        // Skip if AI returned all zeros — no useful data
        const hasNonZero = JSON.stringify(normalized).match(/[1-9]/)
        if (!hasNonZero) {
          delete validated['taste_profile']
          console.warn('[AI Fill] taste_profile all zeros, skipping save')
        } else {
          validated['taste_profile'] = normalized
          console.log(`[AI Fill] taste_profile normalized:`, JSON.stringify(validated['taste_profile']))
        }
      } else {
        delete validated['taste_profile']
        console.warn('[AI Fill] taste_profile returned invalid value, skipping')
      }
    }

    // Post-process: match ingredient name strings to UUIDs for linked_ingredients / raw_ingredients
    const ingredientLinkFields = ['raw_ingredients', 'linked_ingredients']
    for (const linkField of ingredientLinkFields) {
      if (validated[linkField] && Array.isArray(validated[linkField])) {
        const arr = validated[linkField] as any[]
        // Check if any items are name strings (not UUIDs)
        const hasNames = arr.some((item: any) => typeof item === 'string' && !item.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/))
        if (hasNames) {
          try {
            const nameStrings = arr.filter((item: any) => typeof item === 'string' && !item.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/))
            // Fetch matching ingredients from DB
            const sbUrl = Deno.env.get('SUPABASE_URL')!
            const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const searchUrl = `${sbUrl}/rest/v1/catalog_ingredients?select=id,name,name_common&limit=500`
            const searchRes = await fetch(searchUrl, {
              headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey }
            })
            if (searchRes.ok) {
              const allIngredients = await searchRes.json()
              const matchedIds: string[] = []
              for (const name of nameStrings) {
                const lower = (name as string).toLowerCase()
                const match = allIngredients.find((ing: any) =>
                  (ing.name_common || '').toLowerCase() === lower ||
                  (ing.name || '').toLowerCase() === lower ||
                  (ing.name_common || '').toLowerCase().includes(lower) ||
                  (ing.name || '').toLowerCase().includes(lower)
                )
                if (match) matchedIds.push(match.id)
              }
              // Keep any existing UUIDs + add matched ones
              const existingUuids = arr.filter((item: any) => typeof item === 'string' && item.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/))
              validated[linkField] = [...new Set([...existingUuids, ...matchedIds])]
              console.log(`[AI Fill] Matched ${matchedIds.length}/${nameStrings.length} ingredient names to UUIDs for ${linkField}`)
            }
          } catch (err) {
            console.error(`[AI Fill] Error matching ingredient names for ${linkField}:`, err)
          }
        }
      }
    }

    // Post-process: auto-sync macros from elements_beneficial → nutrition_per_100g / nutrition_per_serving
    // The mobile app reads macros from nutrition_per_100g as #1 priority
    if (validated['elements_beneficial'] && typeof validated['elements_beneficial'] === 'object') {
      const eb = validated['elements_beneficial']
      const macros = eb.per_100g?.macronutrients || {}
      const cal = eb.per_100g?.calories
      if (cal || macros.protein_g || macros.carbohydrates_g || macros.fat_g) {
        const synced: Record<string, number> = {}
        if (cal) synced.calories = cal
        if (macros.protein_g) synced.protein_g = macros.protein_g
        if (macros.carbohydrates_g) synced.carbohydrates_g = macros.carbohydrates_g
        synced.fats_g = macros.fats_g || macros.fat_g || 0
        if (macros.fiber_g) synced.fiber_g = macros.fiber_g
        synced.sugar_g = macros.sugars_g || macros.sugar_g || 0
        synced.water_g = macros.water_g || macros.water_content_g || 0
        if (eb.per_100g?.minerals?.sodium_mg) synced.sodium_mg = eb.per_100g.minerals.sodium_mg
        // Only auto-fill if nutrition_per_100g was not already AI-filled in this batch
        if (!validated['nutrition_per_100g']) {
          const existingN = recordData?.nutrition_per_100g
          if (!existingN || typeof existingN !== 'object' || !JSON.stringify(existingN).match(/[1-9]/)) {
            validated['nutrition_per_100g'] = synced
            console.log('[AI Fill] Auto-synced macros from elements_beneficial → nutrition_per_100g', synced)
          }
        }
      }
      // Also sync per_serving
      const servMacros = eb.per_serving?.macronutrients || {}
      const servCal = eb.per_serving?.calories
      if (servCal || servMacros.protein_g) {
        const syncedServ: Record<string, any> = {}
        if (servCal) syncedServ.calories = servCal
        if (servMacros.protein_g) syncedServ.protein_g = servMacros.protein_g
        if (servMacros.carbohydrates_g) syncedServ.carbohydrates_g = servMacros.carbohydrates_g
        syncedServ.fats_g = servMacros.fats_g || servMacros.fat_g || 0
        if (servMacros.fiber_g) syncedServ.fiber_g = servMacros.fiber_g
        syncedServ.sugar_g = servMacros.sugars_g || servMacros.sugar_g || 0
        syncedServ.water_g = servMacros.water_g || servMacros.water_content_g || 0
        if (eb.serving?.name) syncedServ.serving_size = eb.serving.name
        if (eb.serving?.size_g) syncedServ.serving_size_g = eb.serving.size_g
        if (!validated['nutrition_per_serving']) {
          const existingNS = recordData?.nutrition_per_serving
          if (!existingNS || typeof existingNS !== 'object' || !JSON.stringify(existingNS).match(/[1-9]/)) {
            validated['nutrition_per_serving'] = syncedServ
            console.log('[AI Fill] Auto-synced macros from elements_beneficial → nutrition_per_serving', syncedServ)
          }
        }
      }
    }

    console.log(`[AI Fill] Successfully generated ${Object.keys(validated).length} fields for "${recordName}"`)
    return c.json({ success: true, filledFields: validated })
  } catch (error: any) {
    console.error('[AI Fill] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: AI Link Ingredients — finds ingredients in DB that contain a given element and auto-links them
app.post('/make-server-ed0fe4c2/admin/ai-link-ingredients', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { elementId, elementName, elementCategory, healthRole } = await c.req.json()
    if (!elementId || !elementName) return c.json({ success: false, error: 'elementId and elementName are required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    const sbUrl = Deno.env.get('SUPABASE_URL')!
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Fetch all ingredients (id, name, existing elements_beneficial, elements_hazardous)
    const ingRes = await fetch(`${sbUrl}/rest/v1/catalog_ingredients?select=id,name_common,elements_beneficial,elements_hazardous&limit=1000`, {
      headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey }
    })
    if (!ingRes.ok) return c.json({ success: false, error: 'Failed to fetch ingredients' }, 500)
    const allIngredients: any[] = await ingRes.json()

    // 2. Build a name list for AI to reason over (send names only, not full JSON, to stay within token limits)
    const nameList = allIngredients.map((ing: any) => `${ing.id}|||${ing.name_common || ing.name || ''}`)

    const isHazardous = (healthRole || []).includes('hazardous')
    const systemPrompt = `You are a nutrition science expert. Given a list of food ingredients, identify which ones naturally contain or are commonly associated with the element/compound "${elementName}" (category: ${elementCategory || 'unknown'}, role: ${isHazardous ? 'hazardous/contaminant' : 'beneficial nutrient/compound'}).

For each matching ingredient, provide:
- The ingredient ID (exact string from the list)
- Estimated amount per 100g in the appropriate unit (mg, mcg, g, IU, or ppb for contaminants)
- The unit string

Return ONLY a JSON array: [{"id":"ingredient-uuid","per_100g":number,"unit":"mg|mcg|g|IU|ppb","confidence":"high|medium|low"}]
Only include ingredients where there is real scientific evidence. Aim for 5-20 matches. Return [] if none apply.`

    const userPrompt = `Element/Compound: "${elementName}"
Health role: ${isHazardous ? 'hazardous' : 'beneficial'}

Ingredient list (format: id|||name):
${nameList.slice(0, 400).join('\n')}

Which of these ingredients contain "${elementName}"? Return JSON array only.`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[AI Link] OpenAI error:', errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 500)
    }

    const openaiData = await openaiRes.json()
    const content = openaiData.choices?.[0]?.message?.content
    if (!content) return c.json({ success: false, error: 'No content from AI' }, 500)

    let matches: any[]
    try {
      const parsed = JSON.parse(content)
      // AI may return { matches: [...] } or just [...]
      matches = Array.isArray(parsed) ? parsed : (parsed.matches || parsed.results || parsed.ingredients || [])
    } catch {
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    if (!Array.isArray(matches) || matches.length === 0) {
      return c.json({ success: true, linked: [], message: 'No matching ingredients found by AI' })
    }

    // 3. For each match, patch the ingredient's elements_beneficial or elements_hazardous
    const linked: { id: string; name: string; per_100g: number; unit: string }[] = []
    const errors: string[] = []

    for (const match of matches) {
      if (!match.id || typeof match.per_100g !== 'number') continue
      const ing = allIngredients.find((i: any) => i.id === match.id)
      if (!ing) continue

      try {
        if (isHazardous) {
          // Patch elements_hazardous: { [elementId]: { level, per_100g, per_serving, likelihood, reason } }
          const existing = (typeof ing.elements_hazardous === 'object' && ing.elements_hazardous) ? ing.elements_hazardous : {}
          // Only add if not already linked
          if (existing[elementId]) { linked.push({ id: ing.id, name: ing.name_common, per_100g: match.per_100g, unit: match.unit }); continue }
          const updated = {
            ...existing,
            [elementId]: {
              level: match.per_100g > 0 ? 'low' : 'trace',
              per_100g: match.per_100g,
              per_serving: Math.round(match.per_100g * 0.8 * 10) / 10,
              likelihood: match.confidence === 'high' ? 80 : match.confidence === 'medium' ? 50 : 25,
              reason: `Contains ${elementName} — AI-linked`,
              unit: match.unit || 'mg'
            }
          }
          const patchRes = await fetch(`${sbUrl}/rest/v1/catalog_ingredients?id=eq.${ing.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ elements_hazardous: updated })
          })
          if (patchRes.ok || patchRes.status === 204) linked.push({ id: ing.id, name: ing.name_common, per_100g: match.per_100g, unit: match.unit })
          else errors.push(`${ing.name_common}: patch failed ${patchRes.status}`)
        } else {
          // Patch elements_beneficial — nested under nutrient category sections
          // Find which nutrient category this element belongs to (vitamins, minerals, amino_acids, etc.)
          // We store it flat under per_100g as: { per_100g: { [category]: { [elementId]: value } } }
          const existing = (typeof ing.elements_beneficial === 'object' && ing.elements_beneficial) ? ing.elements_beneficial : {}
          const per100g = (existing.per_100g && typeof existing.per_100g === 'object') ? { ...existing.per_100g } : {}

          // Determine category from elementCategory field
          const catMap: Record<string, string> = {
            'vitamin': 'vitamins', 'mineral': 'minerals', 'amino_acid': 'amino_acids',
            'fatty_acid': 'fatty_acids', 'antioxidant': 'antioxidants', 'functional': 'functional',
            'digestive': 'digestive', 'macronutrient': 'macronutrients'
          }
          const cat = catMap[elementCategory?.toLowerCase()] || 'functional'

          // Check if already linked
          const catSection = per100g[cat] || {}
          if (catSection[elementId] !== undefined) {
            linked.push({ id: ing.id, name: ing.name_common, per_100g: match.per_100g, unit: match.unit }); continue
          }

          const updatedPer100g = { ...per100g, [cat]: { ...catSection, [elementId]: match.per_100g } }
          const updatedBen = { ...existing, per_100g: updatedPer100g }

          const patchRes = await fetch(`${sbUrl}/rest/v1/catalog_ingredients?id=eq.${ing.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ elements_beneficial: updatedBen })
          })
          if (patchRes.ok || patchRes.status === 204) linked.push({ id: ing.id, name: ing.name_common, per_100g: match.per_100g, unit: match.unit })
          else errors.push(`${ing.name_common}: patch failed ${patchRes.status}`)
        }
      } catch (err: any) {
        errors.push(`${ing.name_common}: ${err?.message}`)
      }
    }

    console.log(`[AI Link] Linked ${linked.length} ingredients to element "${elementName}", ${errors.length} errors`)
    return c.json({ success: true, linked, errors, message: `Linked ${linked.length} ingredients` })
  } catch (error: any) {
    console.error('[AI Link] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: Compute recipe nutrition — sums elements_beneficial × qty_g across all linked ingredients
app.post('/make-server-ed0fe4c2/admin/compute-recipe-nutrition', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { recipeId, ingredients, servings } = await c.req.json()
    // ingredients: Array<{ name, ingredient_id, qty_g, unit }>
    if (!recipeId || !Array.isArray(ingredients)) {
      return c.json({ success: false, error: 'recipeId and ingredients array are required' }, 400)
    }

    const sbUrl = Deno.env.get('SUPABASE_URL')!
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Unit → grams conversion table (approximate)
    const unitToGrams: Record<string, number> = {
      g: 1, ml: 1, kg: 1000, L: 1000,
      tsp: 5, tbsp: 15, cup: 240,
      oz: 28.35, lb: 453.6,
      piece: 100, slice: 30, pinch: 0.5,
    }

    // Flatten all items (handle grouped structure)
    const flatItems: Array<{ ingredient_id: string; qty_g: number }> = []
    for (const item of ingredients) {
      if (item.group !== undefined) {
        for (const child of (item.items || [])) {
          if (child.ingredient_id && child.qty_g != null) {
            const factor = unitToGrams[child.unit || 'g'] ?? 1
            flatItems.push({ ingredient_id: child.ingredient_id, qty_g: child.qty_g * factor })
          }
        }
      } else if (item.ingredient_id && item.qty_g != null) {
        const factor = unitToGrams[item.unit || 'g'] ?? 1
        flatItems.push({ ingredient_id: item.ingredient_id, qty_g: item.qty_g * factor })
      }
    }

    if (flatItems.length === 0) {
      return c.json({ success: false, error: 'No ingredients with qty_g and ingredient_id found. Add quantities to your ingredients first.' }, 400)
    }

    // Fetch all referenced ingredients in one query
    const ids = [...new Set(flatItems.map(i => i.ingredient_id))]
    const idsParam = ids.map(id => `"${id}"`).join(',')
    const ingRes = await fetch(
      `${sbUrl}/rest/v1/catalog_ingredients?select=id,name_common,elements_beneficial,nutrition_per_100g&id=in.(${idsParam})`,
      { headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey } }
    )
    if (!ingRes.ok) return c.json({ success: false, error: 'Failed to fetch ingredients' }, 500)
    const ingMap: Record<string, any> = {}
    for (const ing of await ingRes.json()) ingMap[ing.id] = ing

    // Deep-merge helper: sum numeric leaf values across objects
    const deepSum = (acc: Record<string, any>, obj: Record<string, any>, scale: number) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') {
          acc[k] = (acc[k] || 0) + v * scale
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (!acc[k] || typeof acc[k] !== 'object') acc[k] = {}
          deepSum(acc[k], v, scale)
        }
      }
    }

    // Accumulate per_100g nutrients scaled by qty_g
    const summedPer100g: Record<string, any> = {}
    const summedMacros: Record<string, any> = {}
    let totalWeight = 0

    for (const item of flatItems) {
      const ing = ingMap[item.ingredient_id]
      if (!ing) continue
      const scale = item.qty_g / 100
      totalWeight += item.qty_g

      // Sum elements_beneficial.per_100g
      const ben = ing.elements_beneficial
      if (ben && typeof ben === 'object') {
        const p100 = ben.per_100g || {}
        deepSum(summedPer100g, p100, scale)
      }

      // Sum nutrition_per_100g macros
      const macros = ing.nutrition_per_100g
      if (macros && typeof macros === 'object') {
        deepSum(summedMacros, macros, scale)
      }
    }

    // Convert totals back to per-100g of the final dish
    const recipeWeight = totalWeight > 0 ? totalWeight : 100
    const normaliseFactor = 100 / recipeWeight

    const normDeep = (obj: Record<string, any>, factor: number): Record<string, any> => {
      const result: Record<string, any> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') {
          result[k] = Math.round(v * factor * 100) / 100
        } else if (v && typeof v === 'object') {
          result[k] = normDeep(v, factor)
        }
      }
      return result
    }

    const per100g = normDeep(summedPer100g, normaliseFactor)
    const macrosPer100g = normDeep(summedMacros, normaliseFactor)

    // Build per_serving if servings provided
    const numServings = servings && servings > 0 ? servings : 1
    const servingWeight = recipeWeight / numServings
    const perServingFactor = servingWeight / 100
    const perServing = normDeep(summedPer100g, perServingFactor / recipeWeight * 100)
    const macrosPerServing = normDeep(summedMacros, perServingFactor / recipeWeight * 100)

    const elementsBeneficial = {
      serving: { name: `1 serving (${Math.round(servingWeight)}g)`, size_g: Math.round(servingWeight) },
      per_100g: per100g,
      per_serving: perServing,
    }

    const nutritionPer100g = macrosPer100g
    const nutritionPerServing = macrosPerServing

    // Save back to the recipe
    const patchRes = await fetch(`${sbUrl}/rest/v1/catalog_recipes?id=eq.${recipeId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${sbKey}`, 'apikey': sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ elements_beneficial: elementsBeneficial, nutrition_per_100g: nutritionPer100g, nutrition_per_serving: nutritionPerServing })
    })

    if (!patchRes.ok && patchRes.status !== 204) {
      return c.json({ success: false, error: `Failed to save: ${patchRes.status}` }, 500)
    }

    console.log(`[Compute Nutrition] Recipe ${recipeId}: ${flatItems.length} ingredients, ${Math.round(totalWeight)}g total`)
    return c.json({
      success: true,
      totalWeight: Math.round(totalWeight),
      ingredientsUsed: flatItems.length,
      elementsBeneficial,
      nutritionPer100g,
      nutritionPerServing,
    })
  } catch (error: any) {
    console.error('[Compute Nutrition] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: Insert new catalog record
app.post('/make-server-ed0fe4c2/admin/catalog/insert', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { table, record } = await c.req.json()
    const allowedTables = ['catalog_elements', 'catalog_ingredients', 'catalog_recipes', 'catalog_products', 'catalog_equipment', 'catalog_cooking_methods', 'catalog_activities', 'catalog_symptoms', 'hs_tests', 'hs_supplements', 'hs_products', 'hs_services', 'hs_experts', 'hs_packages']
    if (!allowedTables.includes(table)) return c.json({ success: false, error: `Invalid table: ${table}` }, 400)
    if (!record || typeof record !== 'object') return c.json({ success: false, error: 'Record data is required' }, 400)

    // Per-table column allowlists — strip unknown columns to prevent schema errors on insert
    const INSERT_COLUMNS: Record<string, Set<string>> = {
      catalog_elements: new Set([
        'id','name_common','name_other','name_scientific','category','type_label','subcategory','health_role','essential_90',
        'chemical_symbol','molecular_formula','cas_number','slug',
        'nutrient_key','nutrient_unit','nutrient_category',
        'description','description_simple','description_technical','description_full',
        'functions','health_benefits','risk_tags','thresholds','deficiency_ranges','excess_ranges','drv_by_population',
        'found_in','food_sources_detailed','food_strategy','reason',
        'deficiency','interactions','detox_strategy',
        'prevention_items','elimination_items',
        'health_score','scientific_references','info_sections',
        'image_url','image_url_raw','image_url_powdered','image_url_cut','image_url_capsule','video_url','images','videos',
        'scientific_papers','social_content',
        'ai_enriched_at','ai_enrichment_version','created_at','updated_at',
      ]),
      catalog_recipes: new Set([
        'id','name_common','name_other','name_scientific','category','category_sub','meal_slot','equipment','equipment_ids','cooking_method_ids',
        'cuisine','language','type',
        'prep_time','cook_time','servings','difficulty','instructions','cooking_instructions',
        'linked_ingredients','ingredients',
        'description','description_simple','description_technical',
        'health_benefits','taste_profile','flavor_profile','texture_profile',
        'elements_beneficial','elements_hazardous','nutrition_per_100g','nutrition_per_serving',
        'health_score','scientific_references',
        'storage_tips','selection_tips','preparation_methods','culinary_uses',
        'season','origin','varieties','processing_type',
        'serving_size','subcategory','tags','allergens','dietary_info',
        'image_url','image_url_raw','image_url_plated','image_url_closeup','video_url','images','videos',
        'scientific_papers','social_content',
        'created_at','updated_at',
      ]),
      catalog_ingredients: new Set([
        'id','name_common','name_other','name_scientific','category','category_sub',
        'processing_type','processing_methods','raw_ingredients','description_processing',
        'description_simple','description_technical','health_benefits','taste_profile',
        'elements_beneficial','elements_hazardous','health_score','scientific_references',
        'nutrition_per_100g','nutrition_per_serving','linked_ingredients',
        'herbal_quality',
        'origin_country','origin_region','origin_city','culinary_history',
        'image_url','image_url_raw','image_url_powdered','image_url_cut','image_url_cubed','image_url_cooked','video_url','images','videos',
        'scientific_papers','social_content',
        'created_at','updated_at',
      ]),
      catalog_equipment: new Set([
        'id','name','category','description','image_url','brand','material','size_notes','use_case','affiliate_url','cooking_methods_used_with','created_at','updated_at',
      ]),
      catalog_cooking_methods: new Set([
        'id','name','slug','category','description','temperature','medium','typical_time','health_impact','nutrient_effect','best_for','equipment_ids','elements_hazardous','elements_beneficial','image_url','created_at','updated_at',
      ]),
      catalog_activities: new Set([
        'id','name','description','category','icon_name','icon_svg_path','icon_url','image_url','video_url',
        'sweat_level','default_duration_min','calories_per_minute','intensity_levels',
        'mineral_impact','toxin_loss','benefits','strava_types',
        'equipment_needed','body_parts','contraindications',
        'is_active','sort_order','created_at','updated_at',
      ]),
      catalog_products: new Set([
        'id','name_common','name','name_brand','brand','manufacturer','category','category_sub','subcategory','barcode','quantity',
        'ingredients_text','allergen_info','serving_size','serving_unit',
        'description','description_simple','description_technical',
        'health_benefits','taste_profile',
        'elements_beneficial','elements_hazardous','health_score',
        'nutri_score','nova_group','eco_score',
        'nutrition_per_100g','nutrition_per_serving','nutrition_facts',
        'image_url','image_url_back','image_url_detail','video_url',
        'scientific_papers','social_content',
        'created_at','updated_at',
      ]),
      catalog_symptoms: new Set([
        'id','name','slug','category','body_system','severity','onset_type',
        'description','description_simple',
        'linked_elements_deficiency','linked_elements_excess',
        'common_causes','related_symptoms','reversible','population_risk','diagnostic_notes',
        'herbal_treatments',
        'icon_name','icon_url','image_url','video_url','tags',
        'health_score_impact','scientific_references',
        'is_active','sort_order','ai_enriched_at','created_at','updated_at',
      ]),
      hs_tests: new Set([
        'id','slug','name','category','element_key','sample_type','turnaround_days',
        'retail_price_eur','wholesale_cost_eur','shipping_cost_eur','support_cost_eur','gross_margin_pct',
        'provider_eu','provider_eu_url','provider_eu_cost',
        'provider_uk','provider_uk_url','provider_uk_cost',
        'provider_us','provider_us_url','provider_us_cost',
        'provider_au','provider_au_url','provider_au_cost',
        'icon_url','image_url','element_image_url','element_images','video_url',
        'buy_url','sample_order_url','link_type',
        'supplier_website','supplier_email',
        'api_dropship_available','api_dropship_connected','api_dropship_notes',
        'shopify_product_url','shopify_product_id',
        'setup_notes','is_active','is_featured','published','description','notes','created_at','updated_at',
      ]),
      hs_supplements: new Set([
        'id','slug','name','element_key','category','region','currency',
        'retail_price','estimated_cost','margin_pct',
        'supplier','supplier_website','supplier_email','link_type',
        'affiliate_url','amazon_url','iherb_url','buy_url',
        'icon_url','image_url','element_image_url','element_images','video_url',
        'shopify_product_url','shopify_product_id',
        'setup_notes','is_active','published','notes','created_at','updated_at',
      ]),
      hs_products: new Set([
        'id','slug','name','product_type','category','element_key',
        'description','setup_notes',
        'icon_url','image_url','image_url_2','image_url_3','video_url',
        'source_url','source_platform','buy_url','link_type',
        'supplier','supplier_website','supplier_email',
        'retail_price','currency','region','estimated_cost','margin_pct',
        'affiliate_available','affiliate_connected','affiliate_notes',
        'shopify_product_url','shopify_product_id',
        'is_active','is_featured','published','notes','created_at','updated_at',
      ]),
      hs_services: new Set([
        'id','name','slug','description','service_type','duration_minutes','delivery_method','category',
        'retail_price','currency','region','estimated_cost','margin_pct',
        'expert_id','icon_url','image_url','video_url',
        'buy_url','booking_url','calendly_url',
        'is_active','published','shopify_product_url','shopify_product_id',
        'notes','tags','created_at','updated_at',
      ]),
      hs_experts: new Set([
        'id','name','slug','title','description','bio',
        'website_url','linkedin_url','instagram_url','tiktok_url','email','whatsapp',
        'booking_url','google_schedule_url',
        'avatar_url','image_url','video_intro_url',
        'expertise_tags','certifications','languages',
        'user_rating','rating_count',
        'region','timezone','available_hours',
        'is_active','published','is_verified','notes','created_at','updated_at',
      ]),
      hs_packages: new Set([
        'id','name','slug','description','short_description',
        'category','goal','target_audience','difficulty_level','duration_weeks',
        'retail_price','compare_at_price','currency','region','discount_pct',
        'icon_url','image_url','image_url_2','video_url','color_hex',
        'is_active','is_featured','published','sort_order',
        'shopify_product_url','shopify_product_id',
        'notes','tags','created_at','updated_at',
      ]),
    }

    // Clean out system fields
    const rawClean = { ...record }
    ;['_displayIndex', 'id', 'created_at', 'imported_at', 'api_source', 'external_id'].forEach((f: string) => delete rawClean[f])

    // Strip unknown columns using per-table allowlist
    const allowedCols = INSERT_COLUMNS[table]
    const clean: Record<string, any> = {}
    if (allowedCols) {
      for (const [k, v] of Object.entries(rawClean)) {
        if (allowedCols.has(k)) clean[k] = v
        else console.warn(`[Admin Insert] Stripping unknown column "${k}" from ${table}`)
      }
    } else {
      Object.assign(clean, rawClean)
    }

    // For catalog_elements: sync category from health_role so both columns are consistent
    if (table === 'catalog_elements' && clean.health_role && !clean.category) {
      const hr = String(clean.health_role).toLowerCase()
      clean.category = hr === 'conditional' ? 'both' : hr
    }

    clean.id = crypto.randomUUID()
    clean.created_at = new Date().toISOString()
    clean.updated_at = new Date().toISOString()

    // Auto-generate slug from name_common if not provided — only for tables that have a slug column
    if (table === 'catalog_elements' && !clean.slug && clean.name_common) {
      const base = String(clean.name_common).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      clean.slug = `${base}-${clean.id.slice(0, 8)}`
    }

    console.log(`[Admin Insert] Table: ${table}, keys: ${Object.keys(clean).join(', ')}`)
    const { data, error } = await supabase.from(table).insert(clean).select().single()
    if (error) {
      console.error(`[Admin Insert] Supabase error for ${table}:`, error.message, error.details, error.hint, error.code)
      return c.json({ success: false, error: error.message, details: error.details, hint: error.hint, code: error.code }, 500)
    }
    console.log(`[Admin] Inserted ${table} record ${data.id} by ${adminValidation.user.email}`)
    return c.json({ success: true, id: data.id, record: data })
  } catch (error: any) {
    console.error('[Admin] Error inserting catalog record:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: AI Generate Steps — generates professional cooking steps with quantities for a recipe
app.post('/make-server-ed0fe4c2/admin/ai-generate-steps', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { recipeName, servings, prepTime, cookTime, difficulty, cuisine, ingredientList } = await c.req.json()
    if (!recipeName) return c.json({ success: false, error: 'recipeName is required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    const srv = servings || 4
    const systemPrompt = `You are a professional recipe writer for a health & nutrition app. You write clear, user-friendly cooking instructions following this exact format:

RULES:
- One step = one action block (never cram multiple actions into one step)
- Always include: heat level + time + what "done" looks like
- Embed exact quantities IN the step where the ingredient is used (e.g. "Heat 15 ml (1 tbsp) olive oil...")
- Use both metric and imperial where helpful (e.g. "200 g (≈2 cups)")
- All quantities must be scaled for ${srv} serving${srv !== 1 ? 's' : ''}
- Steps must flow logically: prep → heat/fat → aromatics → main items → seasoning → finish → serve
- Keep steps concise but complete — 1-2 sentences max per step
- Return ONLY a JSON array of step strings, no markdown, no numbering (numbers are added by the UI)`

    const userPrompt = `Write professional cooking instructions for: "${recipeName}"
Servings: ${srv}${prepTime ? `\nPrep time: ${prepTime}` : ''}${cookTime ? `\nCook time: ${cookTime}` : ''}${difficulty ? `\nDifficulty: ${difficulty}` : ''}${cuisine ? `\nCuisine: ${cuisine}` : ''}${ingredientList ? `\nIngredients: ${ingredientList}` : ''}

Return a JSON array of step strings. Each step should be a single action with quantities embedded. Example format:
["Heat 15 ml (1 tbsp) olive oil in a large wok over medium-high heat for 30–60 seconds.", "Add 75 g (½ medium) thinly sliced onion and sauté for 2–3 minutes until translucent."]`

    console.log(`[AI Steps] Generating steps for "${recipeName}" (${srv} servings)`)

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[AI Steps] OpenAI error:', errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 500)
    }

    const openaiData = await openaiRes.json()
    const content = openaiData.choices?.[0]?.message?.content
    if (!content) return c.json({ success: false, error: 'No content from AI' }, 500)

    let parsed: any
    try { parsed = JSON.parse(content) } catch {
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    // Accept either { steps: [...] } or a bare array wrapped in any key
    const steps: string[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.steps) ? parsed.steps
      : Array.isArray(Object.values(parsed)[0]) ? Object.values(parsed)[0] as string[]
      : []

    if (steps.length === 0) return c.json({ success: false, error: 'AI returned no steps' }, 500)

    console.log(`[AI Steps] Generated ${steps.length} steps for "${recipeName}"`)
    return c.json({ success: true, steps, recipeName, servings: srv })
  } catch (error: any) {
    console.error('[AI Steps] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: AI Enrich Recipe — generates linked ingredients (with qty_g), equipment list, and cooking steps in one call
app.post('/make-server-ed0fe4c2/admin/ai-enrich-recipe', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { recipeId: _recipeId, recipeName, servings, portionWeightG, servingSize: _servingSize, prepTime, cookTime, difficulty, cuisine, description, existingLinkedIds: _existingLinkedIds } = await c.req.json()
    if (!recipeName) return c.json({ success: false, error: 'recipeName is required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Fetch all ingredients from DB for matching
    const ingRes = await fetch(`${supabaseUrl}/rest/v1/catalog_ingredients?select=id,name_common,name,category&limit=2000`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    })
    const allIngredients: any[] = ingRes.ok ? await ingRes.json() : []

    // Fetch all equipment from DB
    const eqRes = await fetch(`${supabaseUrl}/rest/v1/catalog_equipment?select=id,name,category,image_url&limit=500`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    })
    const allEquipment: any[] = eqRes.ok ? await eqRes.json() : []

    // Fetch cooking methods from DB
    const cmRes = await fetch(`${supabaseUrl}/rest/v1/catalog_cooking_methods?select=id,name,slug,category,typical_time&limit=300`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    })
    const allCookingMethods: any[] = cmRes.ok ? await cmRes.json() : []

    const srv = Number(servings) || 4
    const portionG = Number(portionWeightG) || null

    const ingredientList = allIngredients.map((i: any) => i.name_common || i.name).filter(Boolean).slice(0, 300).join(', ')
    const equipmentList = allEquipment.map((e: any) => e.name).filter(Boolean).join(', ')
    const cookingMethodList = allCookingMethods.map((m: any) => m.name).filter(Boolean).join(', ')

    const systemPrompt = `You are a professional nutritionist and recipe developer for a health & nutrition app.
Given a recipe name and details, return a complete recipe enrichment as a single JSON object with four keys:
1. "ingredients" — array of ingredient objects with name, qty_g (grams for ${srv} servings), and unit
2. "equipment" — array of equipment/tool names needed for the whole recipe
3. "cooking_methods" — array of cooking method names used in this recipe (from the provided catalog)
4. "steps" — array of step OBJECTS (not strings) with rich metadata per step

RULES for ingredients:
- Only use ingredient names from the provided catalog list
- qty_g must be realistic grams for ${srv} serving${srv !== 1 ? 's' : ''}${portionG ? ` (total dish weight ≈ ${portionG * srv}g)` : ''}
- Include all main ingredients plus key seasonings/oils

RULES for equipment:
- Only use equipment names from the provided catalog list
- Include only what is actually needed for this recipe

RULES for cooking_methods:
- Only use cooking method names from the provided catalog list
- Include all primary methods used (e.g. "Sautéing", "Baking", "Grilling")

RULES for steps:
- One step = one action (never combine multiple actions)
- Each step is an OBJECT with: text, duration_min, cooking_method, equipment_used (array), ingredients_used (array)
- "text": embed exact quantities (e.g. "Heat 15 ml olive oil..."), 1–2 sentences, scaled for ${srv} servings
- "duration_min": realistic time in minutes for this step (e.g. prep=2, sauté=5, bake=25)
- "cooking_method": the cooking method name from the catalog used in THIS step (e.g. "Sautéing"), or null for prep steps
- "equipment_used": array of equipment names from catalog used in THIS step (e.g. ["Skillet", "Spatula"])
- "ingredients_used": array of ingredient names from catalog used in THIS step
- Steps flow: prep → heat/fat → aromatics → main → seasoning → finish → serve`

    const userPrompt = `Recipe: "${recipeName}"
Servings: ${srv}${portionG ? `\nPortion weight: ${portionG}g per serving` : ''}${prepTime ? `\nPrep time: ${prepTime}` : ''}${cookTime ? `\nCook time: ${cookTime}` : ''}${difficulty ? `\nDifficulty: ${difficulty}` : ''}${cuisine ? `\nCuisine: ${cuisine}` : ''}${description ? `\nDescription: ${description}` : ''}

Available ingredients catalog (use ONLY these names):
${ingredientList}

Available equipment catalog (use ONLY these names):
${equipmentList}

Available cooking methods catalog (use ONLY these names):
${cookingMethodList}

Return a JSON object with this exact structure:
{
  "ingredients": [{"name": "ingredient name from catalog", "qty_g": 150, "unit": "g"}],
  "equipment": ["tool name from catalog"],
  "cooking_methods": ["cooking method name from catalog"],
  "steps": [
    {
      "text": "Step text with quantities embedded...",
      "duration_min": 5,
      "cooking_method": "Sautéing",
      "equipment_used": ["Skillet"],
      "ingredients_used": ["Olive Oil", "Onion"]
    }
  ]
}`

    console.log(`[AI Enrich Recipe] Enriching "${recipeName}" (${srv} servings)`)

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[AI Enrich Recipe] OpenAI error:', errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 500)
    }

    const openaiData = await openaiRes.json()
    const content = openaiData.choices?.[0]?.message?.content
    if (!content) return c.json({ success: false, error: 'No content from AI' }, 500)

    let parsed: any
    try { parsed = JSON.parse(content) } catch {
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    const aiIngredients: { name: string; qty_g: number; unit: string }[] = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
    const aiEquipment: string[] = Array.isArray(parsed.equipment) ? parsed.equipment : []
    const aiCookingMethods: string[] = Array.isArray(parsed.cooking_methods) ? parsed.cooking_methods : []
    const aiSteps: any[] = Array.isArray(parsed.steps) ? parsed.steps : []

    // Fuzzy-match helper
    const fuzzyScore = (a: string, b: string): number => {
      const an = a.toLowerCase().trim(); const bn = b.toLowerCase().trim()
      if (an === bn) return 1.0
      if (bn.includes(an) || an.includes(bn)) return 0.85
      const aW = an.split(/\s+/); const bW = bn.split(/\s+/)
      const shared = aW.filter((w: string) => bW.some((bw: string) => bw.includes(w) || w.includes(bw)))
      return shared.length > 0 ? 0.6 + (shared.length / Math.max(aW.length, bW.length)) * 0.2 : 0
    }

    // Match ingredients
    const matchedIngredients: { ingredient_id: string; name: string; qty_g: number; unit: string }[] = []
    const unmatchedIngredients: { name: string; qty_g: number; unit: string }[] = []
    for (const ai of aiIngredients) {
      let best: any = null; let bestScore = 0
      for (const ing of allIngredients) {
        const s = fuzzyScore(ai.name, ing.name_common || ing.name || '')
        if (s > bestScore) { bestScore = s; best = ing }
      }
      if (best && bestScore >= 0.5) {
        matchedIngredients.push({ ingredient_id: best.id, name: best.name_common || best.name, qty_g: ai.qty_g, unit: ai.unit || 'g' })
      } else {
        unmatchedIngredients.push(ai)
      }
    }

    // Match equipment names to catalog
    const matchedEquipment: { equipment_id: string; name: string; image_url?: string }[] = []
    for (const eqName of aiEquipment) {
      let best: any = null; let bestScore = 0
      for (const eq of allEquipment) {
        const s = fuzzyScore(eqName, eq.name || '')
        if (s > bestScore) { bestScore = s; best = eq }
      }
      if (best && bestScore >= 0.5) {
        matchedEquipment.push({ equipment_id: best.id, name: best.name, image_url: best.image_url || '' })
      }
    }

    // Match cooking method names to catalog IDs
    const matchedCookingMethods: { cooking_method_id: string; name: string; typical_time?: string }[] = []
    for (const cmName of aiCookingMethods) {
      let best: any = null; let bestScore = 0
      for (const cm of allCookingMethods) {
        const s = fuzzyScore(cmName, cm.name || '')
        if (s > bestScore) { bestScore = s; best = cm }
      }
      if (best && bestScore >= 0.5) {
        matchedCookingMethods.push({ cooking_method_id: best.id, name: best.name, typical_time: best.typical_time || '' })
      }
    }

    // Build ingredient name→id map for fast lookup in step processing
    const ingNameToId = new Map<string, string>()
    for (const m of matchedIngredients) ingNameToId.set(m.name.toLowerCase(), m.ingredient_id)
    // Build cooking method name→id map
    const cmNameToId = new Map<string, string>()
    for (const cm of allCookingMethods) cmNameToId.set((cm.name || '').toLowerCase(), cm.id)
    // Build equipment name→id map
    const eqNameToId = new Map<string, string>()
    for (const eq of allEquipment) eqNameToId.set((eq.name || '').toLowerCase(), eq.id)

    // Build enriched step objects
    const steps = aiSteps.map((step: any) => {
      const text = typeof step === 'string' ? step : (step?.text || '')
      const duration_min: number = (typeof step === 'object' && step?.duration_min) ? Number(step.duration_min) : 0

      // Resolve cooking_method_id for this step
      const stepCmName: string = (typeof step === 'object' && step?.cooking_method) ? String(step.cooking_method) : ''
      let cooking_method_id: string | null = null
      if (stepCmName) {
        let best: any = null; let bestScore = 0
        for (const cm of allCookingMethods) {
          const s = fuzzyScore(stepCmName, cm.name || '')
          if (s > bestScore) { bestScore = s; best = cm }
        }
        if (best && bestScore >= 0.5) cooking_method_id = best.id
      }

      // Resolve ingredient_ids used in this step
      const stepIngNames: string[] = (typeof step === 'object' && Array.isArray(step?.ingredients_used)) ? step.ingredients_used : []
      const ingredient_ids: string[] = stepIngNames
        .map((n: string) => ingNameToId.get(n.toLowerCase()))
        .filter(Boolean) as string[]

      // Resolve equipment_ids used in this step (from AI + text matching fallback)
      const stepEqNames: string[] = (typeof step === 'object' && Array.isArray(step?.equipment_used)) ? step.equipment_used : []
      const eqFromAI: string[] = stepEqNames
        .map((n: string) => eqNameToId.get(n.toLowerCase()))
        .filter(Boolean) as string[]
      const lower = text.toLowerCase()
      const eqFromText: string[] = allEquipment
        .filter((e: any) => e.name.length > 2 && lower.includes(e.name.toLowerCase()))
        .map((e: any) => e.id)
      const equipment_ids: string[] = [...new Set([...eqFromAI, ...eqFromText])]

      return { text, image_url: '', duration_min, cooking_method_id, ingredient_ids, equipment_ids }
    })

    const linkedIngredientIds = matchedIngredients.map(i => i.ingredient_id)
    const groupedIngredients = matchedIngredients.map(i => ({
      name: i.name, ingredient_id: i.ingredient_id, qty_g: i.qty_g, unit: i.unit,
    }))

    console.log(`[AI Enrich Recipe] Done: ${matchedIngredients.length} ingredients, ${matchedEquipment.length} equipment, ${matchedCookingMethods.length} cooking methods, ${steps.length} steps`)

    return c.json({
      success: true,
      linked_ingredient_ids: linkedIngredientIds,
      grouped_ingredients: groupedIngredients,
      equipment: matchedEquipment,
      equipment_names: matchedEquipment.map(e => e.name),
      cooking_methods: matchedCookingMethods,
      cooking_method_ids: matchedCookingMethods.map(m => m.cooking_method_id),
      steps,
      unmatched_ingredients: unmatchedIngredients,
      counts: { ingredients: matchedIngredients.length, equipment: matchedEquipment.length, cooking_methods: matchedCookingMethods.length, steps: steps.length }
    })
  } catch (error: any) {
    console.error('[AI Enrich Recipe] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// Admin: AI Create Record — generates a complete new record using OpenAI and inserts it
app.post('/make-server-ed0fe4c2/admin/ai-create-record', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { table, tabType, fields, sampleRecords, prompt } = await c.req.json()
    const allowedTables = ['catalog_elements', 'catalog_ingredients', 'catalog_recipes', 'catalog_products']
    if (!allowedTables.includes(table)) return c.json({ success: false, error: `Invalid table: ${table}` }, 400)
    if (!fields || !Array.isArray(fields)) return c.json({ success: false, error: 'fields array is required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    // Build sample context
    let sampleContext = ''
    if (sampleRecords && sampleRecords.length > 0) {
      const samples = sampleRecords.slice(0, 2)
      sampleContext = `\n\nHere are example records from the same table for format/style reference:\n${JSON.stringify(samples, null, 2)}`
    }

    // Structured format hints for special field types
    const structuredFormats: Record<string, string> = {
      'taste_profile': `{"taste":{"sweet":0-10,"sour":0-10,"salty":0-10,"bitter":0-10,"umami":0-10,"spicy":0-10},"texture":{"crispy":0-10,"crunchy":0-10,"chewy":0-10,"smooth":0-10,"creamy":0-10,"juicy":0-10}}`,
      'elements_beneficial': `{"serving":{"name":"1 cup","size_g":number},"per_100g":{"calories":number,"macronutrients":{"protein_g":g,"fat_g":g,"carbohydrates_g":g,"fiber_g":g,"sugars_g":g},"vitamins":{"vitamin_c_mg":mg,...},"minerals":{"calcium_mg":mg,...},"amino_acids":{"leucine_g":g,...},"fatty_acids":{"omega_3_mg":mg,...}},"per_serving":{...same...}}. Use real USDA data. ALWAYS fill macros, vitamins, minerals.`,
      'elements_hazardous': `JSON: {"element_id":{"level":"trace|low|moderate|high","per_100g":mg_or_mcg,"per_serving":mg_or_mcg,"likelihood":0-100,"reason":"why"},...}. Only non-"none" risks. Valid IDs by category — NATURAL COMPOUNDS: oxalates, phytates, lectins, solanine, tannins, goitrogens, saponins, ciguatoxin. MYCOTOXINS: aflatoxin_b1, ochratoxin_a, deoxynivalenol, fumonisin_b1. HEAVY METALS: lead, mercury, cadmium, arsenic, pcbs, dioxins_tcdd, microplastics, pfas. FARMING: glyphosate, chlorpyrifos, atrazine, ddt, permethrin. PROCESSING: acrylamide, benzo_a_pyrene, nitrosamines. HORMONES: rbgh_rbst, estradiol, ractopamine, igf_1, trenbolone_acetate. ANTIBIOTICS: tetracycline, oxytetracycline, amoxicillin, chloramphenicol, florfenicol, erythromycin. AQUACULTURE: emamectin_benzoate, ethoxyquin, synthetic_astaxanthin, malachite_green, diflubenzuron. MICROBES: salmonella, e_coli_o157_h7, listeria_monocytogenes, campylobacter_jejuni, anisakis_simplex, vibrio_parahaemolyticus. ADDITIVES: aspartame, sodium_nitrite, carrageenan. RULES: For nuts/seeds/grains/vegetables check oxalates, phytates, lectins, tannins, aflatoxin_b1. For fish/seafood check mercury, lead, pcbs, dioxins_tcdd, microplastics, anisakis_simplex, and for farmed fish also ethoxyquin, emamectin_benzoate, synthetic_astaxanthin, antibiotics. For meat/poultry/dairy check hormones, antibiotics, salmonella, campylobacter_jejuni. Be thorough.`,
      'processing_methods': `Array of applicable methods from the allowed values.`,
      'category_sub': `Array of subcategory strings.`,
      'description_processing': `How this processed ingredient is made. Empty string if raw.`,
      'ingredients': `JSON array of ingredient entries. Each entry is EITHER a plain item OR a group. Plain item: {"name":"Tomatoes","ingredient_id":null}. Group: {"group":"Fresh Herbs","items":[{"name":"Basil","ingredient_id":null},{"name":"Parsley","ingredient_id":null}]}. Use groups when ingredients naturally cluster (e.g. "Fresh Herbs", "Spices", "Dressing", "Vegetables"). Always set ingredient_id to null.`,
    }

    const fieldDescriptions = fields
      .filter((f: any) => f.type !== 'image' && f.type !== 'video' && f.type !== 'readonly' && f.type !== 'date' && f.type !== 'linked_elements' && f.type !== 'linked_ingredients')
      .map((f: any) => {
        let desc = `- "${f.key}" (${f.label}): type=${f.type}`
        if (f.options) desc += `, allowed values: [${f.options.join(', ')}]`
        if (f.placeholder) desc += `, example: ${f.placeholder}`
        if (structuredFormats[f.key]) desc += `\n  FORMAT: ${structuredFormats[f.key]}`
        return desc
      }).join('\n')

    const userTopic = prompt ? `The record should be about: ${prompt}` : 'Generate a realistic, unique record with accurate health/nutrition data.'

    const systemPrompt = `You are a health & nutrition data assistant for the HealthScan app. You create complete, realistic database records with accurate nutritional and health data based on real USDA/WHO data. Always return valid JSON. Match the FORMAT specified for structured fields. Be factual — do not invent nutritional values. For select/tags fields, only use the allowed values. For number fields, return numbers. For array fields, return arrays. For JSON fields, return properly structured objects. For text/textarea, return well-written strings. For boolean fields, return true or false. Make the record unique.
CRITICAL FIELD KEY RULES — use these exact keys:
- For recipe records: use "name_common" (NOT "name") for the recipe name
- For recipe records: use "meal_slot" (NOT "type") for meal timing (e.g. breakfast, lunch, dinner)
- Only return keys that were explicitly listed in the fields to fill`

    const userPrompt = `Create a brand new ${tabType || 'catalog'} record with ALL of the following fields populated:
${fieldDescriptions}

${userTopic}
${sampleContext}

IMPORTANT: Use real USDA-level nutritional data. For taste_profile use 0-10 scale. For hazards be realistic. For processing description, describe how it's made if processed.

Return ONLY a JSON object with the field keys and their values. No markdown, no explanation, just the JSON object. Every field must have a value — do not leave any empty.`

    console.log(`[AI Create] Generating new ${tabType} record${prompt ? ` about "${prompt}"` : ''}`)

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[AI Create] OpenAI error:', errText)
      return c.json({ success: false, error: `OpenAI API error: ${openaiRes.status}` }, 500)
    }

    const openaiData = await openaiRes.json()
    const content = openaiData.choices?.[0]?.message?.content
    if (!content) return c.json({ success: false, error: 'No content returned from AI' }, 500)

    let generatedRecord: Record<string, any>
    try {
      generatedRecord = JSON.parse(content)
    } catch {
      console.error('[AI Create] Failed to parse AI response:', content)
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    // Only keep fields that are in the config
    const validKeys = new Set(fields.map((f: any) => f.key))
    const validated: Record<string, any> = {}
    for (const [key, val] of Object.entries(generatedRecord)) {
      if (validKeys.has(key) && key !== 'id' && key !== 'created_at' && key !== 'image_url' && key !== 'video_url') {
        validated[key] = val
      }
    }

    // Insert the record
    validated.created_at = new Date().toISOString()
    validated.source = 'ai-generated'

    if (table === 'catalog_products') {
      const id = crypto.randomUUID()
      await kv.set(id, { id, ...validated })
      console.log(`[AI Create] Inserted AI-generated product ${id} by ${adminValidation.user.email}`)
      return c.json({ success: true, id, record: { id, ...validated }, fieldsGenerated: Object.keys(validated).length })
    }

    const { data, error } = await supabase.from(table).insert(validated).select().single()
    if (error) {
      console.error('[AI Create] Insert error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    console.log(`[AI Create] Inserted AI-generated ${table} record ${data.id} by ${adminValidation.user.email}`)
    return c.json({ success: true, id: data.id, record: data, fieldsGenerated: Object.keys(validated).length })
  } catch (error: any) {
    console.error('[AI Create] Error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// ============ REFERRAL INVITE EMAIL ============

// Send a referral invite email on behalf of a user
app.post('/make-server-ed0fe4c2/send-referral-invite', async (c: any) => {
  try {
    const body = await c.req.json()
    const { toEmail, message, senderName, senderEmail, referralCode } = body

    if (!toEmail || !message) {
      return c.json({ success: false, error: 'toEmail and message are required' }, 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(toEmail.trim().toLowerCase())) {
      return c.json({ success: false, error: 'Invalid recipient email' }, 400)
    }

    const emailService = createEmailService()
    if (!emailService) {
      return c.json({ success: false, error: 'Email service not configured' }, 500)
    }

    const fromName = senderName || 'A HealthScan member'
    const referralLink = referralCode ? `https://healthscan.live?ref=${referralCode}` : 'https://healthscan.live'

    // Build a clean HTML email
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background-color:#111827;padding:24px 40px;text-align:center;">
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:600;color:#ffffff;">HealthScan</p>
  </td></tr>
  <tr><td style="padding:32px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Invited by <strong style="color:#111827;">${fromName}</strong>${senderEmail ? ` (${senderEmail})` : ''}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
    <div style="font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td align="center" style="background-color:#111827;border-radius:6px;">
      <a href="${referralLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Join HealthScan</a>
    </td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#9ca3af;">This email was sent on behalf of ${fromName} via HealthScan. If you didn't expect this, you can safely ignore it.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

    const textContent = `${fromName} invited you to HealthScan!\n\n${message}\n\nJoin here: ${referralLink}`

    const result = await emailService.sendEmail({
      to: toEmail.trim().toLowerCase(),
      subject: `${fromName} invited you to try HealthScan 🌱`,
      html: htmlContent,
      text: textContent,
      from: 'invites@healthscan.live'
    })

    if (result.success) {
      console.log(`✅ Referral invite sent from ${senderEmail || 'unknown'} to ${toEmail}`)
      return c.json({ success: true, message: 'Invite sent!' })
    }

    return c.json({ success: false, error: result.error || 'Failed to send' }, 500)
  } catch (error: any) {
    console.error('❌ Referral invite error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// ============ FUNNEL EVENT TRACKING ============

// Public: Receive funnel events (batched)
app.post('/make-server-ed0fe4c2/events', async (c: any) => {
  try {
    const { events } = await c.req.json()
    if (!Array.isArray(events) || events.length === 0) {
      return c.json({ success: true, stored: 0 })
    }
    // Store each event with a time-based key for efficient prefix queries
    let stored = 0
    for (const evt of events.slice(0, 100)) { // cap at 100 per batch
      const ts = evt.timestamp || new Date().toISOString()
      const key = `funnel_evt_${ts.replace(/[^0-9]/g, '')}_${Math.random().toString(36).substring(2, 8)}`
      await kv.set(key, {
        event: evt.event,
        anonymous_id: evt.anonymous_id,
        user_id: evt.user_id || null,
        timestamp: ts,
        referral_code: evt.referral_code || null,
        utm_source: evt.utm_source || null,
        utm_medium: evt.utm_medium || null,
        utm_campaign: evt.utm_campaign || null,
        metadata: evt.metadata || null
      })
      stored++
    }
    return c.json({ success: true, stored })
  } catch (error: any) {
    console.error('❌ Event tracking error:', error)
    return c.json({ success: true, stored: 0 }) // fail silently for tracking
  }
})

// Admin: Fetch URL metadata (OG title, description, image, type detection)
app.post('/make-server-ed0fe4c2/admin/url-metadata', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { url } = await c.req.json()
    if (!url || typeof url !== 'string') return c.json({ success: false, error: 'URL is required' }, 400)

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HealthScanBot/1.0)' },
      redirect: 'follow',
    })
    if (!res.ok) return c.json({ success: false, error: `Failed to fetch URL: ${res.status}` }, 400)

    const html = await res.text()
    const isPdf = url.toLowerCase().endsWith('.pdf') || res.headers.get('content-type')?.includes('pdf')

    const getMeta = (prop: string): string => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
      ]
      for (const p of patterns) {
        const m = html.match(p)
        if (m?.[1]) return m[1].trim()
      }
      return ''
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = getMeta('og:title') || getMeta('twitter:title') || titleMatch?.[1]?.trim() || ''
    const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || ''
    const image = getMeta('og:image') || getMeta('twitter:image') || ''
    const siteName = getMeta('og:site_name') || ''

    return c.json({ success: true, title, description, image, siteName, isPdf, url })
  } catch (error: any) {
    console.error('[Admin] URL metadata error:', error)
    return c.json({ success: false, error: error?.message || 'Failed to fetch metadata' }, 500)
  }
})

// Admin: Parse bulk text into content links using AI
app.post('/make-server-ed0fe4c2/admin/parse-content-links', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const { text, context } = await c.req.json()
    if (!text || typeof text !== 'string') return c.json({ success: false, error: 'text is required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    const systemPrompt = `You are a content extraction assistant. Extract all references (papers, books, URLs, social media posts) from the provided text and return them as a JSON array.

For each item extract:
- url: the primary URL (PubMed, PMC, publisher, DOI, etc.) — pick the most authoritative one
- title: full paper/book title
- description: 1-2 sentence health-focused summary of what this is about and why it matters
- image: screenshot/thumbnail URL if provided (e.g. thum.io URLs, image suggestions)
- siteName: journal name, publisher, or site name
- contentType: one of "paper", "book", "social", "article" — infer from context
- isPdf: true if the URL ends in .pdf or is explicitly a PDF link

Return ONLY valid JSON array, no markdown, no explanation. Example:
[{"url":"https://pubmed.ncbi.nlm.nih.gov/12345/","title":"Study title","description":"Health summary.","image":"","siteName":"PubMed","contentType":"paper","isPdf":false}]`

    const userPrompt = `${context ? `Context: ${context}\n\n` : ''}Extract all content references from this text:\n\n${text}`

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    })

    const aiData = await aiRes.json()
    const raw = aiData.choices?.[0]?.message?.content?.trim() || '[]'

    let parsed: any[] = []
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 500)
    }

    const links = parsed.map((item: any) => ({
      id: crypto.randomUUID(),
      url: item.url || '',
      title: item.title || item.url || '',
      description: item.description || '',
      image: item.image || '',
      siteName: item.siteName || '',
      isPdf: item.isPdf || false,
      contentType: item.contentType || 'paper',
      votes: 0,
      addedAt: new Date().toISOString(),
    })).filter((l: any) => l.url)

    return c.json({ success: true, links })
  } catch (error: any) {
    console.error('[Admin] Parse content links error:', error)
    return c.json({ success: false, error: error?.message || 'Failed to parse content' }, 500)
  }
})

// Admin: Summarise a content link (paper/book/article) in plain language using AI
app.post('/make-server-ed0fe4c2/admin/summarise-content-link', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    const { title, description, abstract, url, contentType, recordContext } = await c.req.json()
    if (!title && !description && !abstract) return c.json({ success: false, error: 'At least one of title, description, or abstract is required' }, 400)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OpenAI API key not configured' }, 500)

    const contentParts = [
      title ? `Title: ${title}` : '',
      description ? `Description: ${description}` : '',
      abstract ? `Abstract: ${abstract}` : '',
      url ? `URL: ${url}` : '',
    ].filter(Boolean).join('\n\n')

    const contextPart = recordContext ? `\nThis content is related to: ${recordContext}` : ''

    const systemPrompt = `You are a health science communicator who specialises in making complex research accessible to everyday people. Your job is to summarise scientific papers, books, and articles in clear, friendly, plain English — no jargon, no technical terms unless briefly explained. Write as if explaining to a curious, intelligent person with no science background. Be concise (3-5 sentences), focus on: what was studied, what was found, and why it matters for health.`

    const userPrompt = `Please summarise this content in plain, everyday language:

${contentParts}${contextPart}

Write a clear 3-5 sentence summary that explains:
1. What this paper/book/article is about
2. What the key finding or message is
3. Why this matters for someone's health

Keep it simple, engaging, and jargon-free.`

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.6,
        max_tokens: 300,
      }),
    })
    const aiData = await aiRes.json()
    const summary = aiData.choices?.[0]?.message?.content?.trim()
    if (!summary) return c.json({ success: false, error: 'AI did not return a summary' }, 500)
    return c.json({ success: true, summary })
  } catch (error: any) {
    console.error('[Admin] Summarise content link error:', error)
    return c.json({ success: false, error: error?.message || 'Failed to summarise content' }, 500)
  }
})

// Admin: Get funnel metrics (aggregated counts + raw events for time calcs)
app.get('/make-server-ed0fe4c2/admin/funnel-metrics', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    // Get all funnel events
    const allEvents = await kv.getByPrefix('funnel_evt_')

    // Aggregate counts by event type
    const counts: Record<string, number> = {}
    const eventsByType: Record<string, any[]> = {}
    const eventsByDay: Record<string, Record<string, number>> = {}

    for (const evt of allEvents) {
      const type = evt.event || 'unknown'
      counts[type] = (counts[type] || 0) + 1
      if (!eventsByType[type]) eventsByType[type] = []
      eventsByType[type].push(evt)

      // Group by day for trend
      const day = (evt.timestamp || '').substring(0, 10)
      if (day) {
        if (!eventsByDay[day]) eventsByDay[day] = {}
        eventsByDay[day][type] = (eventsByDay[day][type] || 0) + 1
      }
    }

    // Compute median times between funnel steps per anonymous_id
    const sessionEvents: Record<string, any[]> = {}
    for (const evt of allEvents) {
      const sid = evt.user_id || evt.anonymous_id || 'unknown'
      if (!sessionEvents[sid]) sessionEvents[sid] = []
      sessionEvents[sid].push(evt)
    }

    function medianDiffMinutes(fromType: string, toType: string): number | null {
      const diffs: number[] = []
      for (const evts of Object.values(sessionEvents)) {
        const from = evts.filter(e => e.event === fromType).sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp))[0]
        const to = evts.filter(e => e.event === toType).sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp))[0]
        if (from && to) {
          const diff = (new Date(to.timestamp).getTime() - new Date(from.timestamp).getTime()) / 60000
          if (diff > 0 && diff < 10080) diffs.push(diff) // cap at 7 days
        }
      }
      if (diffs.length === 0) return null
      diffs.sort((a, b) => a - b)
      return diffs[Math.floor(diffs.length / 2)]
    }

    const medianTimes = {
      view_to_submit: medianDiffMinutes('lp_view', 'signup_submit'),
      cta_to_submit: medianDiffMinutes('cta_click', 'signup_submit'),
      submit_to_confirm: medianDiffMinutes('signup_submit', 'email_confirm'),
      confirm_to_referral: medianDiffMinutes('email_confirm', 'referral_email_confirm')
    }

    return c.json({
      success: true,
      counts,
      medianTimes,
      dailyTrend: eventsByDay,
      totalEvents: allEvents.length
    })
  } catch (error: any) {
    console.error('❌ Funnel metrics error:', error)
    return c.json({ success: false, error: error?.message || 'Internal server error' }, 500)
  }
})

// ============ END ADMIN CRUD ROUTES ============

// Mount Referral endpoints
app.route('/make-server-ed0fe4c2', referralApp)

// Mount Zapier endpoints
app.route('/make-server-ed0fe4c2/zapier', zapierApp)

// Mount Blog RSS endpoints
app.route('/make-server-ed0fe4c2', blogRssApp)

// Register Notification endpoints
registerNotificationRoutes(app)

// Add explicit blog endpoint for debugging
app.get('/make-server-ed0fe4c2/blog/test', (c) => {
  return c.json({
    success: true,
    message: 'Blog endpoint is working',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/make-server-ed0fe4c2/blog/articles',
      '/make-server-ed0fe4c2/blog/health',
      '/make-server-ed0fe4c2/blog/ping'
    ]
  })
})

// Health endpoint specifically for blog service
app.get('/make-server-ed0fe4c2/blog/service-health', (c) => {
  return c.json({
    success: true,
    message: 'Blog service is operational',
    timestamp: new Date().toISOString(),
    service: 'blog-rss-service',
    status: 'healthy'
  })
})

// ─── Staging ↔ Production Sync Endpoints ────────────────────────────────────
// Production Supabase project: ermbkttsyvpenjjxaxcf
const PROD_URL = 'https://ermbkttsyvpenjjxaxcf.supabase.co'
const PROD_SERVICE_KEY = Deno.env.get('PROD_SUPABASE_SERVICE_ROLE_KEY') || ''

// Parent tables first (order matters for FK constraints), then junction tables.
// 2026-07-03: rebuilt from the ACTUAL schema — the old list contained tables
// that don't exist (recipe_ingredients, recipe_elements, symptom_elements,
// activity_elements) and missed the real catalog_* junctions, so junction data
// (catalog_recipe_ingredients, catalog_product_elements, aliases, …) silently
// never synced. User tables are NEVER in this list. protocols/protocol_items
// stay out too (protocols carries user_id — needs a scoped sync, not a mirror).
const SYNC_TABLES = [
  // ── Parent catalog tables ──
  'catalog_elements', 'catalog_ingredients', 'catalog_cooking_methods', 'catalog_equipment',
  'catalog_symptoms', 'catalog_activities', 'catalog_products', 'catalog_recipes',
  // ── HS tables ──
  // hs_products merged into catalog_products + dropped (20260710); hs_packages is dead but kept for now
  'hs_tests', 'hs_supplements', 'hs_experts', 'hs_services', 'hs_packages',
  // ── Junction/child tables (depend on parents above; deletes run in reverse) ──
  'catalog_element_aliases', 'catalog_element_symptoms',
  'catalog_ingredient_aliases', 'catalog_ingredient_elements',
  'catalog_activity_aliases', 'catalog_activity_equipment', 'catalog_activity_related',
  'catalog_activity_steps', 'catalog_activity_suggested_products',
  'catalog_product_aliases', 'catalog_product_elements', 'catalog_product_ingredients', 'catalog_product_recipes',
  'catalog_recipe_aliases', 'catalog_recipe_cooking_methods', 'catalog_recipe_equipment',
  'catalog_recipe_elements', 'catalog_recipe_ingredients',
] as const
type SyncTable = typeof SYNC_TABLES[number]

// Persist every sync/merge run (incl. dry runs) to staging's sync_runs table —
// the durable audit trail behind the console.log lines.
async function logSyncRun(kind: string, actor: string | undefined, dryRun: boolean, tables: string[], results: any): Promise<void> {
  try {
    const stagingKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stagingUrl = Deno.env.get('SUPABASE_URL')!
    await fetch(`${stagingUrl}/rest/v1/sync_runs`, {
      method: 'POST',
      headers: { apikey: stagingKey, Authorization: `Bearer ${stagingKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ kind, actor: actor || null, dry_run: dryRun, tables, results }),
    })
  } catch (e) { console.warn('[Sync] sync_runs log failed:', e) }
}

async function fetchAllFromSupabase(baseUrl: string, serviceKey: string, table: string): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  const limit = 1000
  while (true) {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    })
    if (!res.ok) throw new Error(`Failed to fetch ${table} from ${baseUrl}: ${res.status}`)
    const batch = await res.json()
    all.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }
  return all
}

async function fetchAllIds(baseUrl: string, serviceKey: string, table: string): Promise<string[]> {
  const all: string[] = []
  let offset = 0
  const limit = 1000
  while (true) {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=${limit}&offset=${offset}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    })
    if (!res.ok) throw new Error(`Failed to fetch ids for ${table} from ${baseUrl}: ${res.status}`)
    const batch = await res.json()
    all.push(...batch.map((r: any) => String(r.id)))
    if (batch.length < limit) break
    offset += limit
  }
  return all
}

async function upsertToSupabase(baseUrl: string, serviceKey: string, table: string, records: any[], actor?: string, syncSource?: string): Promise<void> {
  const batchSize = 100
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
        // the audit_row_change() trigger reads these to attribute the write
        ...(actor ? { 'x-admin-email': actor } : {}),
        ...(syncSource ? { 'x-sync-source': syncSource } : {}),
      },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Upsert failed for ${table} batch ${i}: ${err}`)
    }
  }
}

// GET /admin/sync/diff — compare staging vs production record counts + newest updated_at per table
app.get('/make-server-ed0fe4c2/admin/sync/diff', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    if (!PROD_SERVICE_KEY) return c.json({ success: false, error: 'PROD_SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

    const stagingKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stagingUrl = Deno.env.get('SUPABASE_URL')!

    const results: Record<string, any> = {}
    for (const table of SYNC_TABLES) {
      const [stagingRes, prodRes] = await Promise.all([
        fetch(`${stagingUrl}/rest/v1/${table}?select=id,updated_at&limit=5000`, {
          headers: { 'apikey': stagingKey, 'Authorization': `Bearer ${stagingKey}`, 'Prefer': 'count=exact' }
        }),
        fetch(`${PROD_URL}/rest/v1/${table}?select=id,updated_at&limit=5000`, {
          headers: { 'apikey': PROD_SERVICE_KEY, 'Authorization': `Bearer ${PROD_SERVICE_KEY}`, 'Prefer': 'count=exact' }
        })
      ])
      const stagingData: any[] = await stagingRes.json()
      const prodData: any[] = await prodRes.json()

      const stagingIds = new Set(stagingData.map((r: any) => r.id))
      const prodIds = new Set(prodData.map((r: any) => r.id))
      const onlyInStaging = stagingData.filter((r: any) => !prodIds.has(r.id)).length
      const onlyInProd = prodData.filter((r: any) => !stagingIds.has(r.id)).length

      // Find records newer in staging than prod
      const prodMap = new Map(prodData.map((r: any) => [r.id, r.updated_at]))
      const newerInStaging = stagingData.filter((r: any) => {
        const prodUpdated = prodMap.get(r.id)
        return prodUpdated && r.updated_at > prodUpdated
      }).length

      results[table] = {
        staging: stagingData.length,
        production: prodData.length,
        onlyInStaging,
        onlyInProd,
        newerInStaging,
        inSync: onlyInStaging === 0 && onlyInProd === 0 && newerInStaging === 0,
      }
    }
    return c.json({ success: true, diff: results })
  } catch (error: any) {
    console.error('[Sync] Diff error:', error)
    return c.json({ success: false, error: error?.message || 'Diff failed' }, 500)
  }
})

// POST /admin/sync/push-to-prod — copy selected table(s) from staging → production
app.post('/make-server-ed0fe4c2/admin/sync/push-to-prod', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    if (!PROD_SERVICE_KEY) return c.json({ success: false, error: 'PROD_SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

    const { tables, ids } = await c.req.json() as { tables?: string[], ids?: Record<string, string[]> }
    const targetTables = (tables || [...SYNC_TABLES]).filter(t => SYNC_TABLES.includes(t as SyncTable))
    if (!targetTables.length) return c.json({ success: false, error: 'No valid tables specified' }, 400)

    const stagingKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stagingUrl = Deno.env.get('SUPABASE_URL')!

    const results: Record<string, any> = {}
    for (const table of targetTables) {
      try {
        let records: any[]
        if (ids?.[table]?.length) {
          // Push specific records by id
          const res = await fetch(`${stagingUrl}/rest/v1/${table}?id=in.(${ids[table].join(',')})&select=*`, {
            headers: { 'apikey': stagingKey, 'Authorization': `Bearer ${stagingKey}` }
          })
          records = await res.json()
        } else {
          records = await fetchAllFromSupabase(stagingUrl, stagingKey, table)
        }
        // Strip fields that may not exist in prod schema
        const clean = records.map((r: any) => {
          const c2 = { ...r }
          delete c2._displayIndex
          return c2
        })
        await upsertToSupabase(PROD_URL, PROD_SERVICE_KEY, table, clean, adminValidation.user?.email, 'push-to-prod')
        results[table] = { pushed: clean.length, status: 'ok' }
        console.log(`[Sync] Pushed ${clean.length} ${table} records to production by ${adminValidation.user?.email}`)
      } catch (err: any) {
        results[table] = { status: 'error', error: err.message }
      }
    }
    await logSyncRun('push-to-prod', adminValidation.user?.email, false, targetTables, results)
    return c.json({ success: true, results })
  } catch (error: any) {
    console.error('[Sync] Push-to-prod error:', error)
    return c.json({ success: false, error: error?.message || 'Push failed' }, 500)
  }
})

// POST /admin/sync/pull-from-prod — copy selected table(s) from production → staging
app.post('/make-server-ed0fe4c2/admin/sync/pull-from-prod', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    if (!PROD_SERVICE_KEY) return c.json({ success: false, error: 'PROD_SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

    const { tables } = await c.req.json() as { tables?: string[] }
    const targetTables = (tables || [...SYNC_TABLES]).filter(t => SYNC_TABLES.includes(t as SyncTable))
    if (!targetTables.length) return c.json({ success: false, error: 'No valid tables specified' }, 400)

    const stagingKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stagingUrl = Deno.env.get('SUPABASE_URL')!

    const results: Record<string, any> = {}
    for (const table of targetTables) {
      try {
        const records = await fetchAllFromSupabase(PROD_URL, PROD_SERVICE_KEY, table)
        const clean = records.map((r: any) => { const c2 = { ...r }; delete c2._displayIndex; return c2 })
        await upsertToSupabase(stagingUrl, stagingKey, table, clean, adminValidation.user?.email, 'pull-from-prod')
        results[table] = { pulled: clean.length, status: 'ok' }
        console.log(`[Sync] Pulled ${clean.length} ${table} records from production by ${adminValidation.user?.email}`)
      } catch (err: any) {
        results[table] = { status: 'error', error: err.message }
      }
    }
    await logSyncRun('pull-from-prod', adminValidation.user?.email, false, targetTables, results)
    return c.json({ success: true, results })
  } catch (error: any) {
    console.error('[Sync] Pull-from-prod error:', error)
    return c.json({ success: false, error: error?.message || 'Pull failed' }, 500)
  }
})

// POST /admin/catalog/merge-prod — apply a merge that already ran on staging to
// production too, so the two stay in sync. Runs merge_catalog_records() on prod
// (re-points every FK + deletes the duplicate) for each duplicate id, then
// mirrors the survivor row (so prod's surviving record matches staging's merged
// one). Needs PROD_SUPABASE_SERVICE_ROLE_KEY + the RPC migration applied on prod.
app.post('/make-server-ed0fe4c2/admin/catalog/merge-prod', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    if (!PROD_SERVICE_KEY) return c.json({ success: false, error: 'PROD_SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

    const { table, survivorId, duplicateIds, survivorRow } = await c.req.json() as {
      table?: string; survivorId?: string; duplicateIds?: string[]; survivorRow?: any
    }
    if (!table || !survivorId || !Array.isArray(duplicateIds) || !duplicateIds.length) {
      return c.json({ success: false, error: 'table, survivorId and duplicateIds[] are required' }, 400)
    }

    const repointed: Record<string, number> = {}
    for (const dupId of duplicateIds) {
      if (!dupId || dupId === survivorId) continue
      const res = await fetch(`${PROD_URL}/rest/v1/rpc/merge_catalog_records`, {
        method: 'POST',
        headers: { apikey: PROD_SERVICE_KEY, Authorization: `Bearer ${PROD_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_table: table, p_survivor: survivorId, p_duplicate: dupId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // dup may simply not exist on prod yet — treat 'row not found'-ish as a skip, surface real errors
        const msg = typeof body === 'object' ? JSON.stringify(body) : String(body)
        if (/merge_catalog_records.*does not exist|not found|PGRST202/i.test(msg)) {
          return c.json({ success: false, error: `Prod is missing merge_catalog_records — apply migration 20260625_merge_catalog_records_rpc.sql on production. (${res.status})` }, 500)
        }
        console.warn(`[Sync] merge-prod ${table} ${dupId} → ${res.status}: ${msg}`)
        continue
      }
      if (body && typeof body === 'object') for (const [k, v] of Object.entries(body)) repointed[k] = (repointed[k] || 0) + (Number(v) || 0)
    }

    // mirror the merged survivor row so prod matches staging
    if (survivorRow && typeof survivorRow === 'object') {
      try { const clean = { ...survivorRow }; delete clean._displayIndex; await upsertToSupabase(PROD_URL, PROD_SERVICE_KEY, table, [clean], adminValidation.user?.email, 'merge-prod') }
      catch (e: any) { console.warn(`[Sync] merge-prod survivor upsert failed: ${e?.message || e}`) }
    }

    console.log(`[Sync] merge-prod ${table}: folded ${duplicateIds.length} into ${survivorId} by ${adminValidation.user?.email}`)
    await logSyncRun('merge-prod', adminValidation.user?.email, false, [table], { survivorId, duplicateIds, repointed })
    return c.json({ success: true, repointed })
  } catch (error: any) {
    console.error('[Sync] merge-prod error:', error)
    return c.json({ success: false, error: error?.message || 'merge-prod failed' }, 500)
  }
})

// POST /admin/sync/mirror-to-prod — make production MIRROR staging for the chosen
// tables: upsert all staging rows, then DELETE prod rows whose id isn't in staging
// (via mirror_delete_absent — set-based, FK-safe). { dryRun: true } only reports
// what WOULD change (insert/update + delete counts), writing nothing.
app.post('/make-server-ed0fe4c2/admin/sync/mirror-to-prod', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)
    if (!PROD_SERVICE_KEY) return c.json({ success: false, error: 'PROD_SUPABASE_SERVICE_ROLE_KEY not configured' }, 500)

    const { tables, dryRun } = await c.req.json() as { tables?: string[]; dryRun?: boolean }
    const targetTables = (tables || [...SYNC_TABLES]).filter(t => SYNC_TABLES.includes(t as SyncTable))
    if (!targetTables.length) return c.json({ success: false, error: 'No valid tables specified' }, 400)

    const stagingKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stagingUrl = Deno.env.get('SUPABASE_URL')!
    const results: Record<string, any> = {}

    // ── dry run: report counts only, no writes ──
    if (dryRun) {
      for (const table of targetTables) {
        try {
          const [stagingIds, prodIds] = await Promise.all([
            fetchAllIds(stagingUrl, stagingKey, table),
            fetchAllIds(PROD_URL, PROD_SERVICE_KEY, table),
          ])
          const keep = new Set(stagingIds)
          const willDelete = prodIds.filter(id => !keep.has(id)).length
          results[table] = { staging: stagingIds.length, prod: prodIds.length, willUpsert: stagingIds.length, willDelete, status: 'ok' }
        } catch (err: any) { results[table] = { status: 'error', error: err.message } }
      }
      await logSyncRun('mirror-to-prod', adminValidation.user?.email, true, targetTables, results)
      return c.json({ success: true, dryRun: true, results })
    }

    // ── real mirror: upsert pass (parent-first), then delete pass (child-first) ──
    const stagingIdsByTable: Record<string, string[]> = {}
    for (const table of targetTables) {
      try {
        const records = await fetchAllFromSupabase(stagingUrl, stagingKey, table)
        stagingIdsByTable[table] = records.map((r: any) => String(r.id))
        const clean = records.map((r: any) => { const c2 = { ...r }; delete c2._displayIndex; return c2 })
        await upsertToSupabase(PROD_URL, PROD_SERVICE_KEY, table, clean, adminValidation.user?.email, 'mirror-to-prod')
        results[table] = { upserted: clean.length, status: 'ok' }
      } catch (err: any) { results[table] = { status: 'error', error: err.message } }
    }
    for (const table of [...targetTables].reverse()) {
      if (results[table]?.status === 'error') continue
      const keep = stagingIdsByTable[table] || []
      if (!keep.length) { results[table].deleted = 0; results[table].note = 'staging empty — skipped delete'; continue }
      try {
        const res = await fetch(`${PROD_URL}/rest/v1/rpc/mirror_delete_absent`, {
          method: 'POST',
          headers: {
            apikey: PROD_SERVICE_KEY, Authorization: `Bearer ${PROD_SERVICE_KEY}`, 'Content-Type': 'application/json',
            'x-admin-email': adminValidation.user?.email || '', 'x-sync-source': 'mirror-to-prod',
          },
          body: JSON.stringify({ p_table: table, p_keep_ids: keep }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) { results[table].deleteError = typeof body === 'object' ? JSON.stringify(body) : String(body); continue }
        results[table].deleted = Number(body) || 0
      } catch (err: any) { results[table].deleteError = err.message }
    }
    console.log(`[Sync] mirror-to-prod (${targetTables.join(',')}) by ${adminValidation.user?.email}`)
    await logSyncRun('mirror-to-prod', adminValidation.user?.email, false, targetTables, results)
    return c.json({ success: true, results })
  } catch (error: any) {
    console.error('[Sync] mirror-to-prod error:', error)
    return c.json({ success: false, error: error?.message || 'Mirror failed' }, 500)
  }
})
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
//  POST /admin/import-element-data — Generate official EU/USA/HealthScan data
//  Fills: age_ranges, testing_or_diagnostics, interventions, key_interactions,
//         food_data, content_urls, regions_meta, daily_recommended_adult,
//         other_names, slug_path, confidence
// ═══════════════════════════════════════════════════════════════════════════
app.post('/make-server-ed0fe4c2/admin/import-element-data', async (c: any) => {
  try {
    const accessToken = c.req.header('Authorization')?.replace('Bearer ', '')
    const adminValidation = await validateAdminAccess(accessToken)
    if (adminValidation.error) return c.json({ success: false, error: adminValidation.error }, adminValidation.status)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return c.json({ success: false, error: 'OPENAI_API_KEY not configured' }, 500)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const { elementIds, source, fields } = await c.req.json() as {
      elementIds: string[];
      source?: 'eu' | 'usa' | 'healthscan' | 'all';
      fields?: string[];
    }

    if (!elementIds?.length) return c.json({ success: false, error: 'elementIds required' }, 400)
    const importSource = source || 'all'

    // Default fields to generate if not specified
    const fieldsToGenerate = fields || [
      'age_ranges', 'testing_or_diagnostics', 'interventions', 'key_interactions',
      'food_data', 'content_urls', 'regions_meta', 'daily_recommended_adult',
      'other_names', 'slug_path', 'confidence'
    ]

    // Fetch elements
    const fetchRes = await fetch(`${supabaseUrl}/rest/v1/catalog_elements?id=in.(${elementIds.join(',')})&select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    })
    if (!fetchRes.ok) return c.json({ success: false, error: 'Failed to fetch elements' }, 500)
    const elements = await fetchRes.json()

    const AGE_GROUPS = ['0-6m', '7-12m', '1-3y', '4-8y', '9-13y', '14-18y', '19-30y', '31-50y', '51+y']

    const results: any[] = []

    for (const element of elements) {
      const name = element.name_common || element.name_other || 'Unknown'
      const category = element.category || element.type_label || 'nutrient'
      const healthRole = element.health_role || 'beneficial'
      const unit = element.nutrient_unit || 'mg'

      // Determine which regions to generate
      const regions: string[] = []
      if (importSource === 'all' || importSource === 'eu') regions.push('europe')
      if (importSource === 'all' || importSource === 'usa') regions.push('north_america')
      if (importSource === 'all' || importSource === 'healthscan') regions.push('healthscan')

      const regionInstructions = regions.map(r => {
        if (r === 'europe') return 'For "europe": Use EFSA (European Food Safety Authority) Dietary Reference Values. Use real published EFSA DRV numbers.'
        if (r === 'north_america') return 'For "north_america": Use NIH/IOM Dietary Reference Intakes (DRIs). Use real published NIH DRI numbers.'
        return 'For "healthscan": Create a curated blend taking the stricter (more protective) values from EU and USA, suitable as a health-optimized default.'
      }).join('\n')

      const systemPrompt = `You are a clinical nutrition data specialist. You produce EXACT, research-backed nutritional reference data in strict JSON format. You MUST use real published values from EFSA and NIH/IOM. Never fabricate numbers — use actual DRI/DRV tables.

Element: "${name}" (${category}, ${healthRole})
Unit: ${unit}

Age groups to cover: ${AGE_GROUPS.join(', ')} plus standalone "pregnancy" and "breastfeeding" entries.

${regionInstructions}

CRITICAL RULES:
- deficiency.threshold = approximately 70% of the RDA/recommended value (clinical deficiency cutoff)
- optimal.minimum = EAR (Estimated Average Requirement) or lower bound
- optimal.recommended = RDA (Recommended Dietary Allowance) or AI (Adequate Intake)
- optimal.maximum = UL (Tolerable Upper Intake Level)
- excess.daily_limit.value = UL
- excess.acute_limit.value = approximately 1.5× UL
- For infants (0-6m, 7-12m): use AI (Adequate Intake) since no RDA exists
- For pregnancy/breastfeeding standalone entries: only include "female" key (no "male")
- For female entries in age groups 14-18y, 19-30y, 31-50y: include nested "pregnancy" and "breastfeeding" sub-objects
- All symptom strings must start with emoji: 🟠 for deficiency, 🟢 for benefits, 🔴 for excess
- Include exactly 2 mild deficiency symptoms, 2 severe deficiency symptoms, 6 optimal benefits, 2 daily excess symptoms, 2 acute excess symptoms
- Use the element's native unit consistently throughout

For hazardous elements (health_role = "hazardous"):
- There are NO "benefits" — use risk thresholds instead
- deficiency block should show "safe below" ranges
- optimal block represents "acceptable exposure" range
- excess block represents regulatory limits (FDA, WHO, EU)`

      const fieldsRequest: Record<string, string> = {}

      if (fieldsToGenerate.includes('age_ranges')) {
        fieldsRequest.age_ranges = `Generate the full age_ranges object with keys: ${regions.map(r => `"${r}"`).join(', ')}. Each is an array of ${AGE_GROUPS.length + 2} entries (${AGE_GROUPS.join(', ')}, pregnancy, breastfeeding). Follow the exact structure described in the system prompt.`
      }
      if (fieldsToGenerate.includes('daily_recommended_adult')) {
        fieldsRequest.daily_recommended_adult = `{"male":{"value":NUMBER,"unit":"${unit}"},"female":{"value":NUMBER,"unit":"${unit}"}} using adult 19-50y RDA values.`
      }
      if (fieldsToGenerate.includes('regions_meta')) {
        fieldsRequest.regions_meta = 'Generate authority metadata for each region being imported.'
      }
      if (fieldsToGenerate.includes('testing_or_diagnostics')) {
        fieldsRequest.testing_or_diagnostics = 'Generate full testing & diagnostics object with best_test, optimal_range, detection_threshold, methods array.'
      }
      if (fieldsToGenerate.includes('interventions')) {
        fieldsRequest.interventions = 'Generate 2-4 evidence-based interventions with dosage_by_age_gender per region.'
      }
      if (fieldsToGenerate.includes('key_interactions')) {
        fieldsRequest.key_interactions = 'Generate 3-6 key interactions with element names, types, descriptions, and PubMed reference URLs.'
      }
      if (fieldsToGenerate.includes('food_data')) {
        fieldsRequest.food_data = 'Generate rich food source data with USDA amounts per 100g, bioavailability percentages, strategies, and preparation methods.'
      }
      if (fieldsToGenerate.includes('content_urls')) {
        fieldsRequest.content_urls = 'Generate reference URLs (wikipedia, examine, pubmed, nih_factsheet) using real URLs.'
      }
      if (fieldsToGenerate.includes('other_names')) {
        fieldsRequest.other_names = 'Generate array of alternative/common/scientific names.'
      }
      if (fieldsToGenerate.includes('slug_path')) {
        fieldsRequest.slug_path = 'Generate URL-friendly snake_case identifier.'
      }
      if (fieldsToGenerate.includes('confidence')) {
        fieldsRequest.confidence = 'Set to "ai_generated".'
      }

      const userPrompt = `Generate the following fields for "${name}" (${category}):

${Object.entries(fieldsRequest).map(([k, v]) => `## ${k}\n${v}`).join('\n\n')}

Return a single JSON object with these exact keys. Every numeric value must be a real published number, not a placeholder.`

      try {
        // Use gpt-4o for accuracy on regulatory data (not gpt-4o-mini)
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: 16000,
            response_format: { type: 'json_object' }
          })
        })

        if (!openaiRes.ok) {
          const errText = await openaiRes.text()
          console.error(`[Import] OpenAI error for ${name}:`, errText)
          results.push({ id: element.id, name, status: 'error', error: `OpenAI: ${openaiRes.status}` })
          continue
        }

        const openaiData = await openaiRes.json()
        const content = openaiData.choices?.[0]?.message?.content
        if (!content) {
          results.push({ id: element.id, name, status: 'error', error: 'No AI content' })
          continue
        }

        let parsed: Record<string, any>
        try { parsed = JSON.parse(content) } catch {
          results.push({ id: element.id, name, status: 'error', error: 'Invalid JSON from AI' })
          continue
        }

        // Merge age_ranges with existing data (preserve user edits in other regions)
        if (parsed.age_ranges && element.age_ranges && typeof element.age_ranges === 'object') {
          parsed.age_ranges = { ...element.age_ranges, ...parsed.age_ranges }
        }

        // Build update payload — only include fields that were generated
        const updatePayload: Record<string, any> = {}
        for (const field of fieldsToGenerate) {
          if (parsed[field] !== undefined) {
            updatePayload[field] = parsed[field]
          }
        }

        if (Object.keys(updatePayload).length === 0) {
          results.push({ id: element.id, name, status: 'skipped', error: 'No fields generated' })
          continue
        }

        // Update in Supabase
        const updateRes = await fetch(
          `${supabaseUrl}/rest/v1/catalog_elements?id=eq.${element.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(updatePayload)
          }
        )

        if (!updateRes.ok) {
          const errText = await updateRes.text()
          results.push({ id: element.id, name, status: 'error', error: `DB update failed: ${errText}` })
          continue
        }

        const generatedFields = Object.keys(updatePayload)
        const ageRangeRegions = parsed.age_ranges ? Object.keys(parsed.age_ranges) : []
        results.push({
          id: element.id,
          name,
          status: 'success',
          fieldsGenerated: generatedFields.length,
          fields: generatedFields,
          regions: ageRangeRegions,
          tokens: openaiData.usage?.total_tokens || 0
        })

        console.log(`[Import] Generated ${generatedFields.length} fields for ${name} (regions: ${ageRangeRegions.join(',')}), tokens: ${openaiData.usage?.total_tokens || '?'}`)
      } catch (err: any) {
        results.push({ id: element.id, name, status: 'error', error: err.message })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const totalTokens = results.reduce((sum, r) => sum + (r.tokens || 0), 0)

    return c.json({
      success: true,
      source: importSource,
      processed: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
      totalTokens,
      results
    })
  } catch (error: any) {
    console.error('[Import] Error:', error)
    return c.json({ success: false, error: error?.message || 'Import failed' }, 500)
  }
})

// All admin CRUD routes are now in admin-endpoints-fixed.tsx to avoid Hono sub-app routing conflicts

// Start server
Deno.serve(app.fetch)
