const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function handleJsonResponse(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function postChat(payload) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res);
}

export async function postAgentRun(payload) {
  const res = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res);
}

export async function fetchTrend(repo, metric = 'openrank') {
  const url = new URL(`${API_BASE}/api/metrics/trend`);
  url.searchParams.set('repo', repo);
  url.searchParams.set('metric', metric);
  const res = await fetch(url.toString());
  return handleJsonResponse(res);
}

export async function bootstrapHealth(repoFullName) {
  const url = new URL(`${API_BASE}/api/health/bootstrap`);
  url.searchParams.set('repo_full_name', repoFullName);
  url.searchParams.set('metrics', 'all');
  const res = await fetch(url.toString(), { method: 'POST' });
  return handleJsonResponse(res);
}

export async function refreshTodayHealth() {
  const res = await fetch(`${API_BASE}/api/health/refresh-today`, {
    method: 'POST',
  });
  return handleJsonResponse(res);
}

export async function fetchLatestHealthOverview(repoFullName) {
  const url = new URL(`${API_BASE}/api/health/overview/latest`);
  url.searchParams.set('repo_full_name', repoFullName);
  const res = await fetch(url.toString());
  return handleJsonResponse(res);
}

export async function fetchDataEaseDashboardUrl(repoFullName) {
  const url = new URL(`${API_BASE}/api/dataease/dashboard-url`);
  url.searchParams.set('repo', repoFullName);
  const res = await fetch(url.toString());
  return handleJsonResponse(res);
}
