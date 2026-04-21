const { app } = require('@azure/functions')
const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

async function getUserInfo(userId) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  })
  const user = await userRes.json()

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

  return { email: user.email, ...profile }
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
    const payload = await req.json()

    if (!payload || payload.type !== 'UPDATE') {
      return { status: 200, body: 'ignored' }
    }

    const { record, old_record } = payload

    const newAssignee = record?.assigned_to
    const oldAssignee = old_record?.assigned_to

    if (!newAssignee || newAssignee === oldAssignee) {
      return { status: 200, body: 'no new assignment' }
    }

    try {
      const assignee = await getUserInfo(newAssignee)

      await resend.emails.send({
        from: 'TaskFlow <notifications@resend.dev>',
        to: [assignee.email],
        subject: `[TaskFlow] Nouvelle tâche : ${record.title}`,
        html: `<h2>Bonjour ${assignee.full_name ?? assignee.username},</h2>
        <p>Tâche assignée : <strong>${record.title}</strong></p>
        <p>Priorité : ${record.priority}</p>`,
      })

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
      context.log.error(err.message)
      return { status: 500, jsonBody: { error: err.message } }
    }
  }
})