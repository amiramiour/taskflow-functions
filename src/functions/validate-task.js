const { app } = require('@azure/functions')
const { createClient } = require('@supabase/supabase-js')

app.http('validate-task', {
  methods: ['POST'],
  authLevel: 'anonymous',

  handler: async (req, context) => {

    const authHeader = req.headers.get('authorization')

    if (!authHeader) {
      return { status: 401, jsonBody: { error: 'Non authentifié' } }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()
    const { project_id, title, due_date, assigned_to } = body || {}

    const errors = []

    if (!title || title.trim().length < 3)
      errors.push('Titre trop court')

    if (title?.length > 200)
      errors.push('Titre trop long')

    if (due_date && new Date(due_date) < new Date())
      errors.push('Date passée')

    if (assigned_to) {
      const { data } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', project_id)
        .eq('user_id', assigned_to)
        .single()

      if (!data) errors.push('User pas membre')
    }

    if (errors.length > 0) {
      return { status: 400, jsonBody: { valid: false, errors } }
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id,
        title: title.trim(),
        due_date,
        assigned_to,
        created_by: user?.id
      })
      .select()
      .single()

    if (error) {
      return { status: 500, jsonBody: { error: error.message } }
    }

    return { status: 201, jsonBody: { valid: true, task: data } }
  }
})