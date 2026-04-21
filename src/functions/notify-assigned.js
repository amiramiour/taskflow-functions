const { app } = require('@azure/functions')
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

async function getUserInfo(userId, context) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  })

  const user = await userRes.json()
  context.log('USER RAW:', JSON.stringify(user))

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=username,full_name`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  )

  const [profile] = await profileRes.json()

  return {
    email: user.user?.email, // ✅ CORRECTION ICI
    ...profile
  }
}

async function insertNotification(userId, type, title, body, metadata) {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      type,
      title,
      body,
      metadata
    }),
  })
}

app.http('notify-assigned', {
  methods: ['POST'],
  authLevel: 'anonymous',

  handler: async (req, context) => {

    context.log('=== FUNCTION CALLED ===')

    const payload = await req.json()
    context.log('PAYLOAD:', JSON.stringify(payload))

    if (!payload || payload.type !== 'UPDATE') {
      return { status: 200, body: 'ignored' }
    }

    const { record, old_record } = payload

    const newAssignee = record?.assigned_to
    const oldAssignee = old_record?.assigned_to

    if (!newAssignee || newAssignee === oldAssignee) {
      context.log('No new assignment detected')
      return { status: 200, body: 'no new assignment' }
    }

    try {
      const assignee = await getUserInfo(newAssignee, context)

      context.log('ASSIGNEE EMAIL:', assignee.email)

      // edit mail
      const emailToSend = assignee.email || 'tttttt@gmail.com'

      const result = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: [emailToSend],
        subject: `Nouvelle tâche : ${record.title}`,
        html: `<h1>Test email</h1><p>${record.title}</p>`,
      })

      context.log('RESEND RESULT:', JSON.stringify(result))

      await insertNotification(
        newAssignee,
        'task_assigned',
        `Nouvelle tâche : ${record.title}`,
        `Priorité ${record.priority}`,
        {
          task_id: record.id,
          project_id: record.project_id
        }
      )

      return { status: 200, jsonBody: { ok: true } }

    } catch (err) {
      context.log.error('ERROR:', err.message)
      return { status: 500, jsonBody: { error: err.message } }
    }
  }
})