export async function loadDashboard() {
  const user = await fetch('/api/user');
  const projects = await fetch('/api/projects');
  const alerts = await fetch('/api/alerts');
  return { user, projects, alerts };
}
