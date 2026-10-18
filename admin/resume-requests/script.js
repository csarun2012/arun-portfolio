const loginPanel = document.querySelector('[data-admin-login]');
const dashboard = document.querySelector('[data-admin-dashboard]');
const loginForm = document.querySelector('[data-admin-login-form]');
const loginStatus = document.querySelector('[data-admin-login-status]');
const loginSubmit = document.querySelector('[data-admin-login-submit]');
const turnstileHost = document.querySelector('[data-admin-turnstile]');
const filters = document.querySelector('[data-admin-filters]');
const requestList = document.querySelector('[data-admin-request-list]');
const dashboardStatus = document.querySelector('[data-admin-status]');
const previousButton = document.querySelector('[data-admin-previous]');
const nextButton = document.querySelector('[data-admin-next]');
const pageLabel = document.querySelector('[data-admin-page-label]');
let turnstileWidget = null;
let turnstileToken = '';
let currentPage = 1;
let totalPages = 1;

const setText = (element, value) => { if (element) element.textContent = value; };
const localDate = (value) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';
const statusLabels = {
  requested: 'Requested',
  'email-accepted': 'Email accepted by Gmail',
  'access-opened': 'Access page opened',
  'download-delivered': 'Download delivered',
  expired: 'Expired',
  'limit-reached': 'Download limit reached',
  'email-failed': 'Email failed',
};

const loadTurnstile = async () => {
  if (turnstileWidget !== null) return;
  try {
    const configResponse = await fetch('/api/config', { credentials: 'same-origin' });
    const config = await configResponse.json().catch(() => ({}));
    if (!configResponse.ok) throw new Error('Verification unavailable');
    await new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    turnstileWidget = window.turnstile.render(turnstileHost, {
      sitekey: config.turnstileSiteKey,
      action: 'admin_login',
      theme: 'dark',
      size: 'flexible',
      callback: (token) => {
        turnstileToken = token;
        setText(loginStatus, '');
      },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => {
        turnstileToken = '';
        setText(loginStatus, 'Verification could not be loaded. Please try again.');
      },
    });
  } catch {
    setText(loginStatus, 'Verification could not be loaded. Please refresh the page.');
  }
};

const makeDetail = (label, value, options = {}) => {
  const item = document.createElement('div');
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  if (options.link && value) {
    const link = document.createElement('a');
    link.href = value;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open profile ↗';
    detail.append(link);
  } else {
    detail.textContent = value ?? '—';
  }
  item.append(term, detail);
  return item;
};

const renderRequests = (requests) => {
  requestList.replaceChildren();
  for (const request of requests) {
    const card = document.createElement('article');
    card.className = 'admin-request-card';

    const heading = document.createElement('header');
    const identity = document.createElement('div');
    const name = document.createElement('h2');
    const company = document.createElement('p');
    const badge = document.createElement('span');
    name.textContent = request.name;
    company.textContent = request.company;
    badge.className = `admin-status-badge status-${request.current_status}`;
    badge.textContent = statusLabels[request.current_status] || 'Requested';
    identity.append(name, company);
    heading.append(identity, badge);

    const details = document.createElement('dl');
    details.append(
      makeDetail('Email', request.normalized_email),
      makeDetail('LinkedIn', request.linkedin_url, { link: true }),
      makeDetail('Message supplied', request.has_message ? 'Yes' : 'No'),
      makeDetail('Requested', localDate(request.requested_at)),
      makeDetail('Email status', request.email_status === 'accepted' ? 'Accepted by Gmail' : request.email_status),
      makeDetail('Expires', localDate(request.expires_at)),
      makeDetail('Access page activity', request.first_accessed_at ? `Last opened ${localDate(request.last_accessed_at)}` : 'No recorded activity'),
      makeDetail('Deliveries', `${request.download_count} / ${request.maximum_downloads}`),
      makeDetail('Latest delivery', localDate(request.last_download_at)),
    );
    card.append(heading, details);
    requestList.append(card);
  }
};

const loadRequests = async () => {
  const search = filters.elements.namedItem('search').value.trim();
  const status = filters.elements.namedItem('status').value;
  const query = new URLSearchParams({ page: String(currentPage), pageSize: '10', search, status });
  setText(dashboardStatus, 'Loading requests…');
  try {
    const response = await fetch(`/api/admin/resume-requests?${query}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      dashboard.hidden = true;
      loginPanel.hidden = false;
      loadTurnstile();
      return;
    }
    if (!response.ok) {
      const failure = new Error(
        typeof result.message === 'string' ? result.message : 'Requests could not be loaded.',
      );
      failure.isPublic = true;
      throw failure;
    }
    totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    renderRequests(result.requests);
    setText(dashboardStatus, result.total ? `${result.total} request${result.total === 1 ? '' : 's'}` : 'No matching requests.');
    setText(pageLabel, `Page ${currentPage} of ${totalPages}`);
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
  } catch (error) {
    setText(dashboardStatus, error.isPublic ? error.message : 'Requests could not be loaded.');
  }
};

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  if (!turnstileToken) {
    setText(loginStatus, 'Please complete the security verification.');
    return;
  }
  loginSubmit.disabled = true;
  setText(loginStatus, 'Signing in…');
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: loginForm.elements.namedItem('password').value,
        turnstileToken,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(
        typeof result.message === 'string' ? result.message : 'Sign-in was not accepted.',
      );
      failure.isPublic = true;
      throw failure;
    }
    loginForm.reset();
    loginPanel.hidden = true;
    dashboard.hidden = false;
    currentPage = 1;
    await loadRequests();
  } catch (error) {
    setText(loginStatus, error.isPublic ? error.message : 'Sign-in was not accepted.');
    turnstileToken = '';
    if (turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
  } finally {
    loginSubmit.disabled = false;
  }
});

filters?.addEventListener('submit', (event) => {
  event.preventDefault();
  currentPage = 1;
  loadRequests();
});
previousButton?.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadRequests();
  }
});
nextButton?.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage += 1;
    loadRequests();
  }
});
document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
  await fetch('/api/admin/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  });
  dashboard.hidden = true;
  loginPanel.hidden = false;
  loadTurnstile();
});

(async () => {
  try {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.authenticated) {
      dashboard.hidden = false;
      await loadRequests();
    } else {
      loginPanel.hidden = false;
      await loadTurnstile();
    }
  } catch {
    loginPanel.hidden = false;
    setText(loginStatus, 'The admin service is temporarily unavailable.');
  }
})();
