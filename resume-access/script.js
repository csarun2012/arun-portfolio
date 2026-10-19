const statusPanel = document.querySelector('[data-access-status]');
const statusTitle = document.querySelector('[data-access-status-title]');
const statusMessage = document.querySelector('[data-access-status-message]');
const statusIcon = document.querySelector('[data-access-status-icon]');
const downloadButton = document.querySelector('[data-access-download]');
const downloadLabel = document.querySelector('[data-access-download-label]');
const accessMeta = document.querySelector('[data-access-meta]');
let accessToken = window.__resumeAccessToken || '';
let remainingDeliveries = 0;
const accessTitles = {
  INVALID_LINK: 'Invalid link',
  EXPIRED_LINK: 'Link expired',
  LIMIT_REACHED: 'Delivery limit reached',
  RESUME_UNAVAILABLE: 'Resume unavailable',
  TEMPORARY_FAILURE: 'Temporary server error',
};

const setAccessState = ({ kind, title, message, canDownload = false }) => {
  statusPanel.dataset.state = kind;
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  statusIcon.textContent = { loading: '↻', ready: '✓', success: '✓', error: '!' }[kind] || '·';
  downloadButton.disabled = !canDownload;
};

const localTime = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const inspectAccess = async () => {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(accessToken)) {
    setAccessState({
      kind: 'error',
      title: 'Invalid link',
      message: 'This resume access link is invalid.',
    });
    return;
  }

  try {
    const response = await fetch('/api/resume/access', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(
        typeof result.message === 'string'
          ? result.message
          : 'The link could not be checked right now. Please try again later.',
      );
      failure.code = result.code || 'TEMPORARY_FAILURE';
      failure.isPublic = true;
      throw failure;
    }
    remainingDeliveries = result.remainingDeliveries;
    accessMeta.hidden = false;
    accessMeta.textContent = `Expires ${localTime(result.expiresAt)} · ${remainingDeliveries} of 3 deliveries remaining`;
    setAccessState({
      kind: 'ready',
      title: 'Access link verified',
      message: 'Your resume is ready when you choose to download it.',
      canDownload: true,
    });
  } catch (error) {
    setAccessState({
      kind: 'error',
      title: accessTitles[error.code] || 'Access unavailable',
      message: error.isPublic
        ? error.message
        : 'The link could not be checked right now. Please try again later.',
    });
  }
};

downloadButton?.addEventListener('click', async () => {
  if (!accessToken || remainingDeliveries < 1) return;
  downloadButton.disabled = true;
  downloadButton.setAttribute('aria-busy', 'true');
  downloadLabel.textContent = 'Preparing…';
  setAccessState({
    kind: 'loading',
    title: 'Preparing the resume',
    message: 'The secure file is being delivered.',
  });

  try {
    const response = await fetch('/api/resume/download', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/pdf, application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const failure = new Error(
        typeof result.message === 'string'
          ? result.message
          : 'The resume could not be delivered right now. Please try again later.',
      );
      failure.code = result.code || 'TEMPORARY_FAILURE';
      failure.isPublic = true;
      throw failure;
    }

    const pdf = await response.blob();
    if (pdf.type !== 'application/pdf') throw new Error('The resume file is temporarily unavailable.');
    const objectUrl = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'Arun-CS-Staff-Software-Engineer-Resume.pdf';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);

    const [used, maximum] = (response.headers.get('X-Resume-Delivery') || '').split('/').map(Number);
    remainingDeliveries = Number.isInteger(used) && Number.isInteger(maximum) && maximum >= used
      ? maximum - used : Math.max(0, remainingDeliveries - 1);
    accessMeta.textContent = `${remainingDeliveries} of 3 deliveries remaining`;
    setAccessState({
      kind: 'success',
      title: 'Download delivered',
      message: remainingDeliveries
        ? 'The PDF response was delivered. You may retry if your browser or network interrupted it.'
        : 'The PDF response was delivered and this link has now reached its delivery limit.',
      canDownload: remainingDeliveries > 0,
    });
  } catch (error) {
    setAccessState({
      kind: 'error',
      title: accessTitles[error.code] || 'Download unavailable',
      message: error.isPublic
        ? error.message
        : 'The resume could not be delivered right now. Please try again later.',
      canDownload: remainingDeliveries > 0,
    });
  } finally {
    downloadButton.removeAttribute('aria-busy');
    downloadLabel.textContent = 'Download Resume';
  }
});

inspectAccess();
