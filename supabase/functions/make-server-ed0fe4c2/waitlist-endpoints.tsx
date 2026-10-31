import { createEmailService } from './email-service.tsx'
import * as kv from './kv_store.tsx'
import { googleSheetsService } from './google-sheets-service.tsx'

// Helper function to trigger Zapier webhooks
async function triggerZapierWebhook(triggerType: string, payload: any) {
  try {
    // Get enabled Zapier configurations
    const configs = await kv.getByPrefix('zapier_config_');
    const enabledConfigs = configs.filter(
      config => config.enabled && config.triggers.includes(triggerType)
    );

    if (enabledConfigs.length === 0) {
      console.log(`🔇 No enabled Zapier webhooks for ${triggerType}`);
      return;
    }

    console.log(`📡 Triggering ${triggerType} webhooks for ${enabledConfigs.length} configurations`);

    // Send webhooks in parallel
    const webhookPromises = enabledConfigs.map(async (config) => {
      try {
        const webhookPayload = {
          trigger: triggerType,
          timestamp: new Date().toISOString(),
          data: payload
        };

        const response = await fetch(config.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.auth_token && { 'Authorization': `Bearer ${config.auth_token}` })
          },
          body: JSON.stringify(webhookPayload)
        });

        if (response.ok) {
          console.log(`✅ Zapier webhook sent successfully for ${triggerType} to ${config.config_name}`);
          
          // Log successful webhook
          await kv.set(`zapier_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, {
            trigger: triggerType,
            config_name: config.config_name,
            webhook_url: config.webhook_url,
            status: 'success',
            timestamp: new Date().toISOString(),
            payload_size: JSON.stringify(webhookPayload).length
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`⚠️ Zapier webhook failed for ${triggerType} to ${config.config_name}:`, error.message);
        
        // Log failed webhook
        await kv.set(`zapier_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, {
          trigger: triggerType,
          config_name: config.config_name,
          webhook_url: config.webhook_url,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Wait for all webhooks to complete (but don't fail if they fail)
    await Promise.allSettled(webhookPromises);
  } catch (error) {
    console.error(`❌ Error triggering Zapier webhooks for ${triggerType}:`, error);
  }
}

// Generate consistent referral code for user
function generateConsistentReferralCode(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const positiveHash = Math.abs(hash)
  const code = positiveHash.toString(36).substring(0, 6).padEnd(6, '0')
  return `hs_${code}`
}

// Calculate real sequential waitlist position (no fake randomization)
function calculateWaitlistPosition(userCount: number): number {
  return userCount + 1
}

// Referral milestone tiers - deterministic rewards based on total referrals
const REFERRAL_MILESTONES = [
  { count: 1, boost: 5, badge: 'seed' },
  { count: 3, boost: 15, badge: 'sprout' },
  { count: 5, boost: 30, badge: 'grower' },
  { count: 10, boost: 50, badge: 'champion' },
  { count: 25, boost: 100, badge: 'founding_member' }
]

// Get the referral boost for a given total referral count (deterministic)
function getReferralBoost(totalReferrals: number): { boost: number; badge: string; nextMilestone: number | null } {
  let currentMilestone = REFERRAL_MILESTONES[0]
  let nextMilestone: number | null = REFERRAL_MILESTONES[0].count

  for (const milestone of REFERRAL_MILESTONES) {
    if (totalReferrals >= milestone.count) {
      currentMilestone = milestone
    }
  }

  const nextIdx = REFERRAL_MILESTONES.findIndex(m => m.count > totalReferrals)
  nextMilestone = nextIdx >= 0 ? REFERRAL_MILESTONES[nextIdx].count : null

  return {
    boost: currentMilestone.boost,
    badge: currentMilestone.badge,
    nextMilestone
  }
}

// Reusable Slack notification for ALL waitlist signups (new + returning)
async function sendSlackWaitlistNotification(params: {
  email: string;
  name: string;
  position: number;
  totalWaitlist: number;
  referralCode: string;
  usedReferralCode?: string | null;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  signupDate: string;
  emailSent?: boolean;
  isReturning?: boolean;
}) {
  try {
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')
    if (!slackWebhookUrl) {
      console.log('⚠️ SLACK_WEBHOOK_URL not set — skipping Slack notification')
      return
    }

    const { email, name, position, totalWaitlist, referralCode, usedReferralCode, source, utm_source, utm_medium, utm_campaign, ipAddress, userAgent, signupDate, emailSent, isReturning } = params
    const timestamp = new Date(signupDate).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', dateStyle: 'medium', timeStyle: 'short' })
    const utmParts = [utm_source, utm_medium, utm_campaign].filter(Boolean)
    const utmLine = utmParts.length > 0 ? utmParts.join(' / ') : 'None'
    const supabaseLink = 'https://supabase.com/dashboard/project/mofhvoudjxinvpplsytd/database/tables'
    const adminLink = 'https://healthscan.live/admin'

    let device = 'Unknown'
    let browser = ''
    if (userAgent) {
      if (userAgent.includes('iPhone') || userAgent.includes('iPad')) device = 'iOS'
      else if (userAgent.includes('Android')) device = 'Android'
      else if (userAgent.includes('Mac')) device = 'macOS'
      else if (userAgent.includes('Windows')) device = 'Windows'
      else if (userAgent.includes('Linux')) device = 'Linux'
      if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome'
      else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari'
      else if (userAgent.includes('Firefox')) browser = 'Firefox'
      else if (userAgent.includes('Edg')) browser = 'Edge'
    }

    const contextParts: string[] = []
    if (ipAddress && ipAddress !== '' && ipAddress !== 'unknown') contextParts.push(`IP: \`${ipAddress}\``)
    if (device !== 'Unknown') contextParts.push(`${device}${browser ? ' / ' + browser : ''}`)

    const headerText = isReturning
      ? `Returning User — #${position}`
      : `New Waitlist Signup — #${position}`

    const blocks: any[] = [
      { type: 'header', text: { type: 'plain_text', text: headerText, emoji: false } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Email:*\n${email}` },
        { type: 'mrkdwn', text: `*Name:*\n${name}` },
        { type: 'mrkdwn', text: `*Position:*\n#${position} of ${totalWaitlist}` },
        { type: 'mrkdwn', text: `*Source:*\nWebsite (${source || 'direct'})` },
        { type: 'mrkdwn', text: `*Signed Up:*\n${timestamp}` },
        { type: 'mrkdwn', text: `*Referral Code:*\n\`${referralCode}\`` }
      ]},
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Referred By:*\n${usedReferralCode ? `\`${usedReferralCode}\`` : 'Direct signup'}` },
        { type: 'mrkdwn', text: `*UTM:*\n${utmLine}` },
        { type: 'mrkdwn', text: `*Email Sent:*\n${emailSent ? 'Yes' : 'No'}` },
        { type: 'mrkdwn', text: `*Type:*\n${isReturning ? 'Returning' : 'New'}` }
      ]}
    ]

    if (contextParts.length > 0) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextParts.join('  |  ') }] })
    }

    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'View in Supabase', emoji: false }, url: supabaseLink, action_id: 'view_supabase' },
        { type: 'button', text: { type: 'plain_text', text: 'Admin Panel', emoji: false }, url: adminLink, action_id: 'view_admin' }
      ]
    })
    blocks.push({ type: 'divider' })

    const label = isReturning ? 'Returning user' : 'New waitlist signup'
    fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${label}: ${name} (${email}) — #${position} via website`,
        blocks
      })
    }).catch(() => {})
    console.log('✅ Slack notification queued')
  } catch (slackErr) {
    console.warn('⚠️ Slack notification error (non-critical):', slackErr)
  }
}

// Enhanced waitlist signup - FIXED to properly work with Hono
export async function handleWaitlistSignup(c: any): Promise<Response> {
  try {
    console.log('📝 Starting waitlist signup processing...')
    
    // Enhanced request parsing with better error handling and validation
    let requestBody
    try {
      const rawBody = await c.req.text() // Use Hono's text method
      console.log('📋 Raw request body received:', {
        bodyLength: rawBody?.length,
        bodyPreview: rawBody?.substring(0, 200),
        hasContent: !!rawBody,
        contentType: c.req.header('Content-Type') // Use Hono's header method
      })
      
      if (!rawBody || rawBody.trim().length === 0) {
        throw new Error('Empty request body received')
      }
      
      requestBody = JSON.parse(rawBody)
      console.log('📋 Request body parsed successfully:', {
        parsedKeys: Object.keys(requestBody),
        email: requestBody.email ? 'present' : 'missing',
        emailType: typeof requestBody.email,
        emailValue: requestBody.email,
        fullBody: requestBody
      })
    } catch (jsonError) {
      console.error('❌ Failed to parse request JSON:', {
        error: jsonError,
        errorMessage: jsonError.message,
        contentType: c.req.header('Content-Type'), // Use Hono's header method
        method: c.req.method // Use Hono's method
      })
      return c.json({ // Use Hono's json response method
        success: false,
        error: 'Invalid request format. Please ensure you are sending valid JSON.',
        details: `JSON parsing failed: ${jsonError.message}`,
        errorType: 'JSON_PARSE_ERROR'
      }, 400)
    }
    
    // Safely extract fields with better validation
    const email = requestBody?.email
    const name = requestBody?.name
    const source = requestBody?.source
    const referralCode = requestBody?.referralCode
    const utm_source = requestBody?.utm_source
    const utm_medium = requestBody?.utm_medium
    const utm_campaign = requestBody?.utm_campaign
    const hardwareInterest = ['note', 'heart', 'both'].includes(requestBody?.hardwareInterest)
      ? requestBody.hardwareInterest
      : null
    
    console.log('📋 Extracted fields debug:', {
      email: {
        value: email,
        type: typeof email,
        present: email !== undefined && email !== null,
        stringValue: String(email),
        jsonValue: JSON.stringify(email)
      },
      name: name ? `"${name}" (${typeof name})` : 'missing',
      source: source ? `"${source}"` : 'missing',
      referralCode: referralCode ? 'present' : 'missing',
      hasRequestBody: !!requestBody,
      requestBodyType: typeof requestBody,
      requestBodyKeys: requestBody ? Object.keys(requestBody) : []
    })
    
    // Enhanced email validation and normalization with better debugging
    let normalizedEmail;
    try {
      console.log('📝 Raw email value debug:', {
        email: email,
        emailType: typeof email,
        emailLength: email?.length,
        emailValue: JSON.stringify(email),
        isString: typeof email === 'string',
        isNull: email === null,
        isUndefined: email === undefined,
        isEmpty: email === '',
        emailTrimmed: email?.trim?.(),
        requestBodyKeys: requestBody ? Object.keys(requestBody) : []
      });
      
      // Convert to string if it's not already (defensive programming)
      let emailString = email;
      if (email === null || email === undefined) {
        throw new Error('Email is required - received null or undefined');
      }
      
      // Convert to string if it's not a string (but not null/undefined)
      if (typeof email !== 'string') {
        emailString = String(email);
        console.log('⚠️ Email was not a string, converted to:', emailString);
      }
      
      if (!emailString || emailString.length === 0) {
        throw new Error('Email cannot be empty');
      }
      
      normalizedEmail = emailString.trim().toLowerCase();
      
      if (!normalizedEmail || normalizedEmail.length === 0) {
        throw new Error('Email cannot be empty after normalization');
      }
      
      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        throw new Error(`Invalid email format: ${normalizedEmail}`);
      }
      
      console.log('✅ Email normalized successfully:', {
        original: email,
        converted: emailString,
        normalized: normalizedEmail,
        length: normalizedEmail.length
      });
      
    } catch (normalizationError) {
      console.error('❌ Email normalization error:', {
        error: normalizationError,
        errorMessage: normalizationError.message,
        rawEmail: email,
        emailType: typeof email,
        requestBody: requestBody,
        requestBodyStringified: JSON.stringify(requestBody)
      });
      
      return c.json({
        success: false,
        error: 'Please provide a valid email address',
        details: normalizationError.message,
        errorType: 'EMAIL_VALIDATION_ERROR',
        debugInfo: {
          receivedEmail: email,
          receivedType: typeof email,
          isString: typeof email === 'string',
          isEmpty: email === '',
          isNullish: email == null,
          requestBodyHasEmail: requestBody && 'email' in requestBody
        }
      }, 400);
    }
    
    const userAgent = c.req.header('User-Agent') || ''
    const ipAddress = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || c.req.header('CF-Connecting-IP') || ''

    console.log('📝 Processing waitlist signup:', { 
      email: normalizedEmail ? 'normalized successfully' : 'normalization failed',
      emailLength: normalizedEmail?.length,
      name: name ? 'provided' : 'missing', 
      source, 
      referralCode: referralCode ? 'provided' : 'missing',
      hasUtmParams: !!(utm_source || utm_medium || utm_campaign)
    })
    
    // Validate required fields - name is optional, email is required
    if (!normalizedEmail) {
      return c.json({
        success: false,
        error: 'Email is required'
      }, 400)
    }
    
    // Use fallback name if not provided
    const userName = name?.trim() || normalizedEmail.split('@')[0]
    
    // Enhanced duplicate detection - Check if user already exists
    console.log('🔍 Checking for existing user:', normalizedEmail)
    let existingUser = null
    let isDuplicate = false
    
    try {
      // Primary check: KV store waitlist user
      existingUser = await kv.get(`waitlist_user_${normalizedEmail}`)
      console.log('🔍 KV store user check result:', existingUser ? 'found' : 'not found')
      
      if (existingUser) {
        isDuplicate = true
        console.log('✅ User already exists in waitlist - returning success with existing data:', normalizedEmail)
        
        // Update existing user's last activity
        existingUser.lastActiveDate = new Date().toISOString()
        existingUser.activityCount = (existingUser.activityCount || 1) + 1
        if (source === 'hardware-preorder' && hardwareInterest) {
          existingUser.hardwareInterest = hardwareInterest
          existingUser.hardwareInterestUpdatedAt = new Date().toISOString()
        }
        
        // Save updated activity tracking
        await kv.set(`waitlist_user_${normalizedEmail}`, existingUser)
        
        // Get current waitlist count for Google Sheets
        let currentCount = 0
        try {
          const countData = await kv.get('waitlist_count')
          currentCount = countData?.count || 0
        } catch (error) {
          console.warn('⚠️ Could not get waitlist count for existing user:', error)
        }
        
        // Optional Google Sheets backup for existing user (system works perfectly without this)
        let googleSheetsResult = null
        try {
          const sheetsResult = await googleSheetsService.saveEmailSignup({
            email: normalizedEmail,
            signupDate: existingUser.signupDate || new Date().toISOString(),
            referralCode: existingUser.referralCode,
            usedReferralCode: referralCode || '',
            position: existingUser.position,
            totalWaitlist: currentCount || 1,
            name: name?.trim() || normalizedEmail.split('@')[0],
            source: 'waitlist-existing',
            emailConfirmed: existingUser.confirmed || false,
            userAgent,
            ipAddress
          })
          googleSheetsResult = sheetsResult
          
          if (sheetsResult.success && !sheetsResult.skipped) {
            console.log('✅ Optional Google Sheets backup updated for existing user')
          } else if (sheetsResult.skipped) {
            console.log('✅ Existing user processed successfully (Google Sheets backup not configured - optional)')
          }
        } catch (sheetsError) {
          console.log('✅ Existing user processed successfully (Google Sheets backup unavailable - optional feature):', sheetsError)
          googleSheetsResult = { success: false, error: 'Google Sheets backup unavailable (optional)' }
        }
        
        // Process referral bonus for existing user if they arrived via a referral link
        // and haven't already been attributed to this referrer
        if (referralCode && referralCode !== existingUser.referralCode && !existingUser.referredBy) {
          try {
            console.log('🎁 Processing referral bonus for returning user. Referral code:', referralCode)
            
            const referrerUsers = await kv.getByPrefix('waitlist_user_')
            const referrer = referrerUsers.find(user => user.referralCode === referralCode)
            
            if (referrer && referrer.email !== normalizedEmail) {
              console.log('👤 Found referrer for returning user:', referrer.email)
              
              const totalReferrals = (referrer.referrals || 0) + 1
              const { boost, badge, nextMilestone } = getReferralBoost(totalReferrals)
              const newReferrerPosition = Math.max(1, referrer.position - boost)
              
              const updatedReferrer = {
                ...referrer,
                position: newReferrerPosition,
                referrals: totalReferrals,
                referralBadge: badge,
                lastReferralDate: new Date().toISOString(),
                nextMilestone: nextMilestone,
                totalBoostEarned: (referrer.totalBoostEarned || 0) + boost
              }
              
              await kv.set(`waitlist_user_${referrer.email}`, updatedReferrer)
              console.log(`🚀 Referrer ${referrer.email} earned ${boost}-position boost from returning user (badge: ${badge}, total referrals: ${totalReferrals})`)
              
              // Also update the existing user to track who referred them
              existingUser.referredBy = referralCode
              await kv.set(`waitlist_user_${normalizedEmail}`, existingUser)
              console.log(`✅ Updated returning user ${normalizedEmail} with referredBy: ${referralCode}`)
            } else {
              console.warn('⚠️ Referral code not found or self-referral for returning user:', referralCode)
            }
          } catch (refError) {
            console.error('❌ Error processing referral for returning user:', refError)
          }
        }

        // Slack notification for returning user (non-blocking)
        sendSlackWaitlistNotification({
          email: normalizedEmail,
          name: name?.trim() || existingUser.name || normalizedEmail.split('@')[0],
          position: existingUser.position,
          totalWaitlist: Math.max(currentCount || 1, existingUser.position || 1),
          referralCode: existingUser.referralCode,
          usedReferralCode: referralCode,
          source: 'waitlist-existing',
          ipAddress,
          userAgent,
          signupDate: existingUser.signupDate || new Date().toISOString(),
          isReturning: true
        })

        return c.json({
          success: true,
          message: "Welcome back! You're already on the waitlist.",
          position: existingUser.position,
          referralCode: existingUser.referralCode,
          totalWaitlist: Math.max(currentCount || 1, existingUser.position || 1),
          alreadyExists: true,
          isUpdate: true,
          googleSheetsStatus: googleSheetsResult || { skipped: true },
          data: {
            email: normalizedEmail,
            name: name?.trim() || existingUser.name || normalizedEmail.split('@')[0],
            position: existingUser.position,
            signupDate: existingUser.signupDate
          }
        }, 200)
      }
    } catch (error) {
      console.warn('⚠️ Error checking existing user:', error)
      // Continue with signup if we can't check existing users
    }
    
    // Additional duplicate checks in case primary check failed
    if (!isDuplicate) {
      try {
        console.log('🔍 Performing additional duplicate checks...')
        
        // Check all waitlist users for this email (fallback search)
        const allWaitlistUsers = await kv.getByPrefix('waitlist_user_')
        const duplicateUser = allWaitlistUsers.find(user => 
          user && user.email && user.email.toLowerCase().trim() === normalizedEmail
        )
        
        if (duplicateUser) {
          console.log('🔍 Found duplicate user via prefix search:', duplicateUser.email)
          isDuplicate = true
          existingUser = duplicateUser
          
          // Update existing user's last activity
          duplicateUser.lastActiveDate = new Date().toISOString()
          duplicateUser.activityCount = (duplicateUser.activityCount || 1) + 1
          if (source === 'hardware-preorder' && hardwareInterest) {
            duplicateUser.hardwareInterest = hardwareInterest
            duplicateUser.hardwareInterestUpdatedAt = new Date().toISOString()
          }
          
          // Save the duplicate user back with updated activity
          await kv.set(`waitlist_user_${normalizedEmail}`, duplicateUser)
          
          // Return early with duplicate user data
          const needsConfirmation = !duplicateUser.confirmed && !duplicateUser.emailConfirmedAt
          
          // Slack notification for returning user found via prefix search (non-blocking)
          sendSlackWaitlistNotification({
            email: normalizedEmail,
            name: name?.trim() || duplicateUser.name || normalizedEmail.split('@')[0],
            position: duplicateUser.position,
            totalWaitlist: allWaitlistUsers.length,
            referralCode: duplicateUser.referralCode,
            usedReferralCode: referralCode,
            source: 'waitlist-existing',
            ipAddress,
            userAgent,
            signupDate: duplicateUser.signupDate || new Date().toISOString(),
            isReturning: true
          })

          return c.json({
            success: true,
            message: needsConfirmation 
              ? "Welcome back! You're on the waitlist. Please check your email to confirm your spot."
              : "Welcome back! You're already on the waitlist.",
            position: duplicateUser.position,
            referralCode: duplicateUser.referralCode,
            totalWaitlist: allWaitlistUsers.length,
            alreadyExists: true,
            isDuplicate: true,
            isUpdate: true,
            needsConfirmation: needsConfirmation,
            emailConfirmed: duplicateUser.confirmed || !!duplicateUser.emailConfirmedAt,
            data: {
              email: normalizedEmail,
              name: name?.trim() || duplicateUser.name || normalizedEmail.split('@')[0],
              position: duplicateUser.position,
              signupDate: duplicateUser.signupDate,
              confirmed: duplicateUser.confirmed || false
            }
          }, 200)
        }
        
        console.log('✅ No duplicates found - proceeding with new user signup')
      } catch (duplicateCheckError) {
        console.warn('⚠️ Error in additional duplicate check:', duplicateCheckError)
        // Continue with signup even if duplicate check fails
      }
    }
    
    // Get current waitlist count using actual user count (fixes race condition)
    let currentCount = 0
    try {
      currentCount = await kv.countByPrefix('waitlist_user_')
      console.log('📊 Actual waitlist user count from KV:', currentCount)
    } catch (error) {
      console.warn('⚠️ Could not count waitlist users, falling back to counter:', error)
      try {
        const countData = await kv.get('waitlist_count')
        currentCount = countData?.count || 0
      } catch (fallbackError) {
        console.warn('⚠️ Fallback counter also failed:', fallbackError)
      }
    }
    
    // Calculate position with smart randomization
    const calculatedPosition = calculateWaitlistPosition(currentCount)
    
    // Generate referral code
    const userReferralCode = generateConsistentReferralCode(normalizedEmail)
    
    // Create user data
    const userData = {
      email: normalizedEmail,
      name: userName,
      position: calculatedPosition,
      referralCode: userReferralCode,
      source: source || 'website',
      referredBy: referralCode || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      hardwareInterest,
      hardwareInterestUpdatedAt: hardwareInterest ? new Date().toISOString() : null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      signupDate: new Date().toISOString(),
      confirmed: false,
      emailsSent: 0
    }
    
    // Store user data (this is critical - must succeed)
    console.log('💾 Attempting to store user data for:', normalizedEmail)
    try {
      await kv.set(`waitlist_user_${normalizedEmail}`, userData)
      console.log('✅ User data stored successfully')
      
      // Verify the save worked
      const verification = await kv.get(`waitlist_user_${normalizedEmail}`)
      if (!verification) {
        console.error('❌ User data verification failed - data not found after save')
        throw new Error('Data verification failed after save')
      }
      console.log('✅ User data verified successfully after save')
      
    } catch (kvError) {
      console.error('❌ Failed to store user data - KV STORE ERROR:', {
        error: kvError,
        message: kvError?.message,
        stack: kvError?.stack,
        userData: userData
      })
      return c.json({
        success: false,
        error: 'Failed to save your information. Please try again.',
        details: `KV Store error: ${kvError?.message || 'Unknown KV error'}`,
        errorType: 'KV_STORE_ERROR'
      }, 500)
    }
    
    // Update waitlist count (critical)
    try {
      const newCount = currentCount + 1
      await kv.set('waitlist_count', { count: newCount, lastUpdated: new Date().toISOString() })
      console.log('📊 Waitlist count updated to:', newCount)
    } catch (error) {
      console.warn('⚠️ Could not update waitlist count:', error)
    }
    
    // Handle referral bonus if applicable (optional)
    if (referralCode && referralCode !== userReferralCode) {
      try {
        console.log('🎁 Processing referral bonus for code:', referralCode)
        
        // Find referrer by code
        const referrerUsers = await kv.getByPrefix('waitlist_user_')
        const referrer = referrerUsers.find(user => user.referralCode === referralCode)
        
        if (referrer && referrer.email !== normalizedEmail) {
          console.log('👤 Found referrer:', referrer.email)
          
          // Deterministic milestone-based boost
          const totalReferrals = (referrer.referrals || 0) + 1
          const { boost, badge, nextMilestone } = getReferralBoost(totalReferrals)
          const newReferrerPosition = Math.max(1, referrer.position - boost)
          
          // Update referrer data with milestone tracking
          const updatedReferrer = {
            ...referrer,
            position: newReferrerPosition,
            referrals: totalReferrals,
            referralBadge: badge,
            lastReferralDate: new Date().toISOString(),
            nextMilestone: nextMilestone,
            totalBoostEarned: (referrer.totalBoostEarned || 0) + boost
          }
          
          await kv.set(`waitlist_user_${referrer.email}`, updatedReferrer)
          console.log(`🚀 Referrer ${referrer.email} earned ${boost}-position boost (badge: ${badge}, total referrals: ${totalReferrals}, next milestone: ${nextMilestone || 'max'})`)
        } else {
          console.warn('⚠️ Referral code not found:', referralCode)
        }
      } catch (error) {
        console.error('❌ Error processing referral:', error)
        // Don't fail the signup if referral processing fails
      }
    }
    
    // Optional Google Sheets backup (system operates perfectly without this)
    let googleSheetsResult = null
    try {
      console.log('📋 Primary signup completed - attempting optional Google Sheets backup...')
      const sheetsResult = await googleSheetsService.saveEmailSignup({
        email: normalizedEmail,
        signupDate: userData.signupDate,
        referralCode: userReferralCode,
        usedReferralCode: referralCode,
        position: calculatedPosition,
        totalWaitlist: currentCount + 1,
        name: userName,
        source: source || 'waitlist',
        emailConfirmed: false,
        userAgent,
        ipAddress
      })
      
      googleSheetsResult = sheetsResult
      
      if (sheetsResult.success && !sheetsResult.skipped) {
        console.log('✅ Successfully saved to optional Google Sheets backup')
      } else if (sheetsResult.skipped) {
        console.log('✅ Signup completed successfully (Google Sheets backup not configured - optional feature)')
      } else {
        console.log('✅ Signup completed successfully (Google Sheets backup issue - optional feature):', sheetsResult.error)
      }
    } catch (error) {
      console.log('✅ Signup completed successfully (Google Sheets backup unavailable - optional feature):', error)
      googleSheetsResult = { 
        success: false, 
        error: 'Google Sheets backup unavailable (optional feature)',
        skipped: true 
      }
    }
    
    // Send confirmation email using new Bitly-style template (optional)
    let emailSent = false
    let emailError = null
    
    try {
      const emailService = createEmailService()
      if (emailService) {
        console.log('📧 Sending Bitly-style waitlist confirmation email...')
        const emailResult = await emailService.sendWaitlistConfirmation(
          normalizedEmail, 
          calculatedPosition, 
          true // Use Bitly style
        )
        
        if (emailResult.success) {
          emailSent = true
          console.log('✅ Bitly-style confirmation email sent successfully')
          
          // Update user data to track email sent
          userData.emailsSent = 1
          userData.lastEmailSent = new Date().toISOString()
          await kv.set(`waitlist_user_${normalizedEmail}`, userData)
        } else {
          emailError = emailResult.error
          console.error('❌ Failed to send confirmation email:', emailResult.error)
        }

        try {
          const adminResult = await emailService.sendAdminWaitlistAlert({
            email: normalizedEmail,
            name: userName,
            position: calculatedPosition,
            referralCode: userReferralCode,
            usedReferralCode: referralCode,
            totalWaitlist: currentCount + 1,
            source: source || 'waitlist',
            utm_source,
            utm_medium,
            utm_campaign,
            ipAddress,
            userAgent,
            signupDate: userData.signupDate,
            emailSent,
            emailError: emailError || undefined
          })

          if (adminResult.success) {
            console.log('📧 Waitlist admin alert sent to waitlist@healthscan.live')
          } else {
            console.warn('⚠️ Waitlist admin alert failed:', adminResult.error)
          }
        } catch (alertError) {
          console.warn('⚠️ Waitlist admin alert threw error:', alertError)
        }
      } else {
        console.log('📧 Email service not configured - skipping confirmation + admin alert emails')
        emailError = 'Email service not configured'
      }
    } catch (error) {
      console.error('❌ Email service error:', error)
      emailError = error.message || 'Email service error'
    }
    
    // Trigger Zapier webhook for waitlist signup (non-blocking)
    try {
      await triggerZapierWebhook('waitlist_joined', {
        id: `waitlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email: normalizedEmail,
        referral_code: userReferralCode,
        used_referral_code: referralCode,
        position: calculatedPosition,
        created_at: userData.signupDate,
        source: source || 'direct',
        utm_source: utm_source,
        utm_medium: utm_medium,
        utm_campaign: utm_campaign,
        name: userName,
        total_waitlist: currentCount + 1
      });
    } catch (error) {
      // Don't fail the signup if webhook fails
      console.warn('⚠️ Zapier webhook failed (non-critical):', error);
    }

    // Slack notification for new signup (non-blocking, uses reusable function)
    sendSlackWaitlistNotification({
      email: normalizedEmail,
      name: userName,
      position: calculatedPosition,
      totalWaitlist: currentCount + 1,
      referralCode: userReferralCode,
      usedReferralCode: referralCode,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      ipAddress,
      userAgent,
      signupDate: userData.signupDate,
      emailSent,
      isReturning: false
    })

    // Log successful signup
    console.log('🎉 Waitlist signup completed:', {
      email: normalizedEmail,
      position: calculatedPosition,
      referralCode: userReferralCode,
      emailSent,
      googleSheetsStatus: googleSheetsResult?.success ? 'success' : googleSheetsResult?.skipped ? 'skipped' : 'failed'
    })
    
    // Return enhanced success response with email confirmation status
    const needsConfirmation = emailSent && !userData.confirmed
    
    return c.json({
      success: true,
      message: needsConfirmation
        ? 'Welcome to the HealthScan waitlist! Please check your email to confirm your spot.'
        : 'Welcome to the HealthScan waitlist!',
      position: calculatedPosition,
      referralCode: userReferralCode,
      totalWaitlist: currentCount + 1,
      emailSent,
      emailError,
      needsConfirmation: needsConfirmation,
      emailConfirmed: userData.confirmed || false,
      googleSheetsStatus: googleSheetsResult || { skipped: true },
      data: {
        email: normalizedEmail,
        name: userName,
        position: calculatedPosition,
        signupDate: userData.signupDate,
        confirmed: userData.confirmed || false,
        emailsSent: userData.emailsSent || 0
      }
    }, 201)
    
  } catch (error) {
    console.error('❌ Waitlist signup error - DETAILED DEBUG:', {
      error: error,
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      cause: error?.cause,
      type: typeof error,
      timestamp: new Date().toISOString(),
      // Additional comprehensive error details
      errorStringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      errorKeys: Object.keys(error),
      errorPrototype: Object.getPrototypeOf(error)
    })
    
    return c.json({
      success: false,
      error: 'An unexpected error occurred during signup. Please try again.',
      details: error?.message || 'Unknown server error',
      errorType: 'SERVER_ERROR',
      timestamp: new Date().toISOString()
    }, 500)
  }
}

// Get waitlist stats
export async function getWaitlistStats(c: any): Promise<Response> {
  try {
    console.log('📊 Getting waitlist stats...')
    
    // Get total count
    let totalCount = 0
    try {
      const countData = await kv.get('waitlist_count')
      totalCount = countData?.count || 0
    } catch (error) {
      console.warn('⚠️ Could not get waitlist count:', error)
    }
    
    // Get all users for more detailed stats
    let userCount = 0
    let confirmedCount = 0
    let recentSignups = 0
    
    try {
      const allUsers = await kv.getByPrefix('waitlist_user_')
      userCount = allUsers.length
      
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      
      confirmedCount = allUsers.filter(user => user.confirmed || user.emailConfirmedAt).length
      recentSignups = allUsers.filter(user => {
        const signupDate = new Date(user.signupDate)
        return signupDate > oneDayAgo
      }).length
      
    } catch (error) {
      console.warn('⚠️ Could not get detailed user stats:', error)
    }
    
    const stats = {
      totalUsers: Math.max(totalCount, userCount),
      confirmedUsers: confirmedCount,
      recentSignups: recentSignups,
      conversionRate: userCount > 0 ? Math.round((confirmedCount / userCount) * 100) : 0,
      lastUpdated: new Date().toISOString()
    }
    
    console.log('📊 Waitlist stats calculated:', stats)
    
    return c.json({
      success: true,
      stats: stats
    })
    
  } catch (error) {
    console.error('❌ Error getting waitlist stats:', error)
    
    return c.json({
      success: false,
      error: 'Failed to get waitlist statistics',
      details: error?.message || 'Unknown error'
    }, 500)
  }
}
