const { app } = require('@azure/functions')
const { createClient } = require('@supabase/supabase-js')

app.http('project-stats', {
  methods: ['GET'],
  authLevel: 'anonymous',

  handler: async (req, context) => {
    const projectId = req.query.get('project_id')

    if (!projectId) {
      return { status: 400, body: 'project_id requis' }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data: allTasks, error } = await supabase
      .from('tasks')
      .select('status, due_date, assigned_to')
      .eq('project_id', projectId)

    if (error) {
      return { status: 500, body: JSON.stringify({ error: error.message }) }
    }

    // 🔢 compter les statuts
    const statusCount = (allTasks ?? []).reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1
      return acc
    }, {})

    const today = new Date().toISOString().split('T')[0]

    const overdueCount = (allTasks ?? [])
      .filter(t => t.due_date && t.due_date < today && t.status !== 'done')
      .length

    const uniqueMembers = new Set(
      (allTasks ?? []).map(t => t.assigned_to).filter(Boolean)
    ).size

    const total = allTasks?.length ?? 0
    const done = statusCount['done'] ?? 0

    return {
      status: 200,
      jsonBody: {
        total_tasks: total,
        completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
        by_status: statusCount,
        overdue_count: overdueCount,
        active_members: uniqueMembers,
      }
    }
  }
})