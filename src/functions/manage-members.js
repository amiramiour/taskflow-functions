const { app } = require('@azure/functions')
const { createClient } = require('@supabase/supabase-js')

app.http('manage-members', {
  methods: ['POST'],
  authLevel: 'anonymous',

  handler: async (req, context) => {
    const authHeader = req.headers.get('authorization')

    if (!authHeader) {
      return { status: 401, body: 'Unauthorized' }
    }

    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    const adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data: { user } } = await userClient.auth.getUser()

    if (!user) {
      return { status: 401, body: 'Invalid token' }
    }

    const body = await req.json()
    const { action, project_id, target_user_id, role } = body ?? {}

    // 🔐 vérifier rôle appelant
    const { data: callerRole } = await adminClient
      .from('project_members')
      .select('role')
      .eq('project_id', project_id)
      .eq('user_id', user.id)
      .single()

    if (!callerRole || !['admin', 'owner'].includes(callerRole.role)) {
      return {
        status: 403,
        jsonBody: { error: 'Admin requis' }
      }
    }

    // ➕ ADD
    if (action === 'add') {
      const { error } = await adminClient
        .from('project_members')
        .insert({
          project_id,
          user_id: target_user_id,
          role: role ?? 'member'
        })

      return error
        ? { status: 400, jsonBody: { error: error.message } }
        : { status: 200, jsonBody: { success: true } }
    }

    // ➖ REMOVE
    if (action === 'remove') {
      const { data: target } = await adminClient
        .from('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', target_user_id)
        .single()

      if (target?.role === 'owner') {
        return {
          status: 403,
          jsonBody: { error: 'Impossible de retirer le owner' }
        }
      }

      const { error } = await adminClient
        .from('project_members')
        .delete()
        .eq('project_id', project_id)
        .eq('user_id', target_user_id)

      return error
        ? { status: 400, jsonBody: { error: error.message } }
        : { status: 200, jsonBody: { success: true } }
    }

    return {
      status: 400,
      jsonBody: { error: 'action invalide' }
    }
  }
})