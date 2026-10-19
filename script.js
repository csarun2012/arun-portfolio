const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('motion-ready');

const menuButton = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const siteHeader = document.querySelector('.site-header');

if (menuButton && siteNav) {
  const closeMenu = ({ returnFocus = false } = {}) => {
    menuButton.setAttribute('aria-expanded', 'false');
    siteNav.classList.remove('open');
    document.body.classList.remove('menu-open');
    if (returnFocus) menuButton.focus();
  };

  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closeMenu();
      return;
    }

    menuButton.setAttribute('aria-expanded', 'true');
    siteNav.classList.add('open');
    document.body.classList.add('menu-open');
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu({ returnFocus: true });
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1100 && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
    }
  });
}

const navigationLinks = siteNav
  ? [...siteNav.querySelectorAll('a[href^="#"]')]
  : [];
const navigationSections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
const brandLink = document.querySelector('.brand[href^="#"]');

if (navigationLinks.length && navigationSections.length) {
  let navigationUpdatePending = false;

  const setActiveNavigation = (sectionId) => {
    const isTopActive = !sectionId;

    if (brandLink) {
      brandLink.classList.toggle('is-active', isTopActive);
      if (isTopActive) brandLink.setAttribute('aria-current', 'page');
      else brandLink.removeAttribute('aria-current');
    }

    navigationLinks.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${sectionId}`;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const updateActiveNavigation = () => {
    siteHeader?.classList.toggle('is-scrolled', window.scrollY > 24);
    const headerHeight = siteHeader?.offsetHeight || 66;
    const readingLine = window.scrollY + headerHeight + Math.min(window.innerHeight * 0.25, 180);
    const pageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    let activeSectionId = pageBottom ? navigationSections[navigationSections.length - 1].id : '';

    if (!pageBottom) {
      navigationSections.forEach((section) => {
        if (section.offsetTop <= readingLine) activeSectionId = section.id;
      });
    }

    setActiveNavigation(activeSectionId);
    navigationUpdatePending = false;
  };

  const requestNavigationUpdate = () => {
    if (navigationUpdatePending) return;
    navigationUpdatePending = true;
    window.requestAnimationFrame(updateActiveNavigation);
  };

  window.addEventListener('scroll', requestNavigationUpdate, { passive: true });
  window.addEventListener('resize', requestNavigationUpdate);
  window.addEventListener('hashchange', requestNavigationUpdate);
  window.addEventListener('load', requestNavigationUpdate);
  requestNavigationUpdate();
}

// Reusable, one-time reveal motion. Classes are applied only when JavaScript is active,
// keeping every item visible if scripting or IntersectionObserver is unavailable.
const revealConfigurations = [
  { selector: '#about .section-heading', stagger: 0, baseDelay: 0 },
  { selector: '#about .about-copy', stagger: 0, baseDelay: 100 },
  { selector: '#about .career-snapshot-row', stagger: 0, baseDelay: 200 },
  { selector: '#expertise .expertise-pillar-header', stagger: 60, baseDelay: 60 },
  { selector: '#expertise .expertise-pillar:nth-child(1) .expertise-card', stagger: 60, baseDelay: 120 },
  { selector: '#expertise .expertise-pillar:nth-child(2) .expertise-card', stagger: 60, baseDelay: 180 },
  { selector: '#expertise .expertise-pillar:nth-child(3) .expertise-card', stagger: 60, baseDelay: 240, maxDelay: 360 },
  { selector: '#expertise .core-stack > span', stagger: 0, baseDelay: 330, maxDelay: 330 },
  { selector: '#expertise .core-stack > strong', stagger: 35, baseDelay: 365, maxDelay: 600 },
  { selector: '#stories .section-heading, #stories .story-principle', stagger: 0, baseDelay: 0 },
  { selector: '#stories .story-impact-row > div', stagger: 50, baseDelay: 80 },
  { selector: '#stories .story-card', stagger: 65, baseDelay: 140, maxDelay: 360 },
  { selector: '#stories .leadership-story', stagger: 0, baseDelay: 360, maxDelay: 360 },
  { selector: '#contact .eyebrow, #contact h2, #contact .contact-content > p:not(.eyebrow)', stagger: 0, baseDelay: 0 },
  { selector: '#contact .contact-email', stagger: 0, baseDelay: 80 },
  { selector: '#contact .contact-links', stagger: 0, baseDelay: 140 },
  { selector: '#innovation .innovation-content', stagger: 0, baseDelay: 0 },
  { selector: '#innovation .innovation-visual', stagger: 0, baseDelay: 140 },
  { selector: '.section-heading, .about-copy, .career-snapshot-row, .featured-quote, .expertise-overview', stagger: 0 },
  { selector: '.impact-grid article', stagger: 75 },
  { selector: '.timeline-item', stagger: 55 },
  { selector: '.credential-grid article', stagger: 55 },
  { selector: '.recommendation-card', stagger: 65 },
  { selector: '#recommendations .show-more', stagger: 0, baseDelay: 195 },
];
const revealItems = new Set();

revealConfigurations.forEach(({ selector, stagger, baseDelay = 0, maxDelay = 240 }) => {
  document.querySelectorAll(selector).forEach((element, index) => {
    if (revealItems.has(element)) return;
    revealItems.add(element);
    element.classList.add('reveal-item');
    element.dataset.revealDelay = String(Math.min(baseDelay + index * stagger, maxDelay));
  });
});

const revealImmediately = (element) => {
  element.classList.add('is-visible', 'reveal-complete');
};

if (reducedMotionQuery.matches || !('IntersectionObserver' in window)) {
  revealItems.forEach(revealImmediately);
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const entersDuringInitialLoad = window.scrollY < 8
        && entry.target.getBoundingClientRect().top < window.innerHeight;
      const delay = (Number(entry.target.dataset.revealDelay) || 0)
        + (entersDuringInitialLoad ? 620 : 0);
      window.setTimeout(() => {
        entry.target.classList.add('is-visible');
        window.setTimeout(() => entry.target.classList.add('reveal-complete'), 700);
      }, delay);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealItems.forEach((element) => revealObserver.observe(element));
}

// One-time Experience timeline progress. Geometry is measured from the actual
// timeline nodes so the effect stays aligned across mobile and desktop layouts.
const experienceTimeline = document.querySelector('#experience .timeline');

if (experienceTimeline) {
  const timelineItems = [...experienceTimeline.querySelectorAll('.timeline-item')];
  const timelineNodes = timelineItems
    .map((item) => item.querySelector('.timeline-marker i'))
    .filter(Boolean);
  const timelineProgress = experienceTimeline.querySelector('.timeline-progress');

  const getTimelineOffset = (element) => {
    let top = 0;
    let left = 0;
    let current = element;

    while (current && current !== experienceTimeline) {
      top += current.offsetTop;
      left += current.offsetLeft;
      current = current.offsetParent;
    }

    return { top, left };
  };

  const updateTimelineGeometry = () => {
    if (!timelineProgress || timelineNodes.length < 2) return;
    const firstNode = timelineNodes[0];
    const lastNode = timelineNodes[timelineNodes.length - 1];
    const firstOffset = getTimelineOffset(firstNode);
    const lastOffset = getTimelineOffset(lastNode);
    const startTop = firstOffset.top + firstNode.offsetHeight / 2;
    const endTop = lastOffset.top + lastNode.offsetHeight / 2;
    const lineLeft = firstOffset.left + firstNode.offsetWidth / 2;

    experienceTimeline.style.setProperty('--timeline-progress-top', `${Math.round(startTop)}px`);
    experienceTimeline.style.setProperty('--timeline-progress-left', `${Math.round(lineLeft)}px`);
    experienceTimeline.style.setProperty('--timeline-progress-height', `${Math.max(Math.round(endTop - startTop), 0)}px`);
  };

  let timelineGeometryFrame = 0;
  const requestTimelineGeometry = () => {
    if (timelineGeometryFrame) return;
    timelineGeometryFrame = window.requestAnimationFrame(() => {
      updateTimelineGeometry();
      timelineGeometryFrame = 0;
    });
  };

  requestTimelineGeometry();
  window.addEventListener('load', requestTimelineGeometry);
  window.addEventListener('resize', requestTimelineGeometry);

  if ('ResizeObserver' in window) {
    const timelineResizeObserver = new ResizeObserver(requestTimelineGeometry);
    timelineResizeObserver.observe(experienceTimeline);
  }

  if (!reducedMotionQuery.matches && 'IntersectionObserver' in window && timelineItems.length) {
    let maximumProgress = 0;
    const timelineObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const activeIndex = timelineItems.indexOf(entry.target);
        if (activeIndex < 0) return;

        timelineItems.slice(0, activeIndex + 1).forEach((item) => {
          item.classList.add('is-timeline-active');
        });

        const progress = timelineItems.length > 1
          ? Math.max(.04, activeIndex / (timelineItems.length - 1))
          : 1;
        maximumProgress = Math.max(maximumProgress, progress);
        experienceTimeline.style.setProperty('--timeline-progress-value', String(maximumProgress));
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.28, rootMargin: '0px 0px -16% 0px' });

    timelineItems.forEach((item) => timelineObserver.observe(item));
  }
}

// Count each metric once when the cards enter the viewport.
const metricValues = [...document.querySelectorAll('.impact-grid strong')];

const animateMetric = (element) => {
  if (reducedMotionQuery.matches) return;
  if (element.dataset.counted === 'true') return;
  element.dataset.counted = 'true';
  const finalText = element.textContent.trim();
  const match = finalText.match(/^([\d.]+)(.*)$/);
  if (!match) return;

  const target = Number(match[1]);
  const suffix = match[2];
  const duration = 900;
  const startedAt = performance.now();
  element.setAttribute('aria-label', finalText);
  element.textContent = `0${suffix}`;

  const updateValue = (now) => {
    if (reducedMotionQuery.matches) {
      element.textContent = finalText;
      return;
    }
    const progress = Math.min((now - startedAt) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const value = Number.isInteger(target)
      ? Math.round(target * easedProgress)
      : Math.round(target * easedProgress * 10) / 10;
    element.textContent = progress < 1 ? `${value}${suffix}` : finalText;
    if (progress < 1) window.requestAnimationFrame(updateValue);
  };

  window.requestAnimationFrame(updateValue);
};

if (!reducedMotionQuery.matches && 'IntersectionObserver' in window) {
  const metricObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const index = metricValues.indexOf(entry.target);
      const entersDuringInitialLoad = window.scrollY < 8
        && entry.target.getBoundingClientRect().top < window.innerHeight;
      observer.unobserve(entry.target);
      const delay = Math.max(index, 0) * 80 + (entersDuringInitialLoad ? 620 : 0);
      window.setTimeout(() => animateMetric(entry.target), delay);
    });
  }, { threshold: 0.55 });

  metricValues.forEach((metric) => metricObserver.observe(metric));
}

// Pointer-only radial spotlight for metric and expertise cards.
const spotlightCards = [...document.querySelectorAll('.impact-grid article, .expertise-card')];
spotlightCards.forEach((card) => card.classList.add('spotlight-card'));

if (!reducedMotionQuery.matches && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  spotlightCards.forEach((card) => {
    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;

    const updateSpotlight = () => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--spotlight-x', `${pointerX - bounds.left}px`);
      card.style.setProperty('--spotlight-y', `${pointerY - bounds.top}px`);
      frameId = 0;
    };

    card.addEventListener('pointerenter', () => card.classList.add('is-spotlight'));
    card.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frameId) frameId = window.requestAnimationFrame(updateSpotlight);
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-spotlight');
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
    });
  });
}

// Brief, non-blocking confirmation for the mailto action.
const contactEmail = document.querySelector('#contact .contact-email');
const contactEmailLabel = contactEmail?.querySelector('[data-contact-email-label]');
let contactEmailFeedbackTimer = 0;

contactEmail?.addEventListener('click', () => {
  if (!contactEmailLabel) return;
  window.clearTimeout(contactEmailFeedbackTimer);
  contactEmailLabel.textContent = 'Email opened';
  contactEmail.classList.add('is-activated');
  contactEmailFeedbackTimer = window.setTimeout(() => {
    contactEmailLabel.textContent = 'Email Me';
    contactEmail.classList.remove('is-activated');
  }, 1800);
});

// Accessible full-screen view for the detailed career snapshot.
const careerSnapshotLightbox = document.querySelector('#career-snapshot-lightbox');
const careerSnapshotOpeners = [...document.querySelectorAll('[data-career-snapshot-open]')];
const careerSnapshotClose = careerSnapshotLightbox?.querySelector('[data-career-snapshot-close]');
const careerSnapshotImage = careerSnapshotLightbox?.querySelector('.career-lightbox-image');
let careerSnapshotReturnFocus = null;
let careerSnapshotCloseTimer = 0;
let careerSnapshotPreloadImage = null;

const loadCareerSnapshotFullImage = () => {
  if (!careerSnapshotImage || careerSnapshotImage.dataset.fullLoaded === 'true' || careerSnapshotPreloadImage) return;
  const fullImageSource = careerSnapshotImage.dataset.fullSrc;
  if (!fullImageSource) return;
  careerSnapshotPreloadImage = new Image();
  careerSnapshotPreloadImage.decoding = 'async';
  careerSnapshotPreloadImage.addEventListener('load', () => {
    careerSnapshotImage.src = fullImageSource;
    careerSnapshotImage.dataset.fullLoaded = 'true';
    careerSnapshotPreloadImage = null;
  }, { once: true });
  careerSnapshotPreloadImage.addEventListener('error', () => {
    careerSnapshotPreloadImage = null;
  }, { once: true });
  careerSnapshotPreloadImage.src = fullImageSource;
};

const setCareerSnapshotZoom = (isZoomed, origin = { x: 0.5, y: 0.5 }) => {
  if (!careerSnapshotLightbox || !careerSnapshotImage) return;
  careerSnapshotLightbox.classList.toggle('is-zoomed', isZoomed);
  careerSnapshotImage.setAttribute('aria-pressed', String(isZoomed));
  careerSnapshotImage.setAttribute(
    'aria-label',
    isZoomed ? 'Zoom out of career experience snapshot' : 'Zoom in on career experience snapshot'
  );

  window.requestAnimationFrame(() => {
    if (!isZoomed) {
      careerSnapshotLightbox.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }
    const imageBounds = careerSnapshotImage.getBoundingClientRect();
    const imageLeft = imageBounds.left + careerSnapshotLightbox.scrollLeft;
    const imageTop = imageBounds.top + careerSnapshotLightbox.scrollTop;
    careerSnapshotLightbox.scrollTo({
      left: imageLeft + imageBounds.width * origin.x - careerSnapshotLightbox.clientWidth / 2,
      top: imageTop + imageBounds.height * origin.y - careerSnapshotLightbox.clientHeight / 2,
      behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
    });
  });
};

const closeCareerSnapshot = () => {
  if (!careerSnapshotLightbox || careerSnapshotLightbox.hidden) return;
  careerSnapshotLightbox.classList.remove('is-open');
  window.clearTimeout(careerSnapshotCloseTimer);
  const finishClose = () => {
    setCareerSnapshotZoom(false);
    careerSnapshotLightbox.hidden = true;
    document.body.classList.remove('career-lightbox-open');
    careerSnapshotReturnFocus?.focus();
    careerSnapshotReturnFocus = null;
  };
  if (reducedMotionQuery.matches) finishClose();
  else careerSnapshotCloseTimer = window.setTimeout(finishClose, 320);
};

const openCareerSnapshot = (opener) => {
  if (!careerSnapshotLightbox || !careerSnapshotClose) return;
  window.clearTimeout(careerSnapshotCloseTimer);
  loadCareerSnapshotFullImage();
  careerSnapshotReturnFocus = opener;
  setCareerSnapshotZoom(false);
  careerSnapshotLightbox.hidden = false;
  document.body.classList.add('career-lightbox-open');
  window.requestAnimationFrame(() => {
    careerSnapshotLightbox.classList.add('is-open');
    careerSnapshotClose.focus();
  });
};

careerSnapshotOpeners.forEach((opener) => {
  opener.addEventListener('pointerenter', loadCareerSnapshotFullImage, { once: true });
  opener.addEventListener('focus', loadCareerSnapshotFullImage, { once: true });
  opener.addEventListener('click', () => openCareerSnapshot(opener));
});

careerSnapshotClose?.addEventListener('click', closeCareerSnapshot);

careerSnapshotImage?.addEventListener('click', (event) => {
  const imageBounds = careerSnapshotImage.getBoundingClientRect();
  const isZoomed = careerSnapshotLightbox?.classList.contains('is-zoomed') || false;
  setCareerSnapshotZoom(!isZoomed, {
    x: (event.clientX - imageBounds.left) / imageBounds.width,
    y: (event.clientY - imageBounds.top) / imageBounds.height,
  });
});

careerSnapshotImage?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const isZoomed = careerSnapshotLightbox?.classList.contains('is-zoomed') || false;
  setCareerSnapshotZoom(!isZoomed);
});

careerSnapshotLightbox?.addEventListener('click', (event) => {
  const lightboxDialog = careerSnapshotLightbox.querySelector('.career-lightbox-dialog');
  if (event.target === careerSnapshotLightbox || event.target === lightboxDialog) closeCareerSnapshot();
});

document.addEventListener('keydown', (event) => {
  if (!careerSnapshotLightbox || careerSnapshotLightbox.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCareerSnapshot();
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const focusableControls = [careerSnapshotClose, careerSnapshotImage].filter(Boolean);
    const currentIndex = focusableControls.indexOf(document.activeElement);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex = (currentIndex + direction + focusableControls.length) % focusableControls.length;
    focusableControls[nextIndex]?.focus();
  }
});

const recommendationButton = document.querySelector('#show-more-recommendations');
const extraRecommendations = [...document.querySelectorAll('.extra-recommendation')];

if (recommendationButton && extraRecommendations.length) {
  recommendationButton.addEventListener('click', () => {
    const isExpanded = recommendationButton.getAttribute('aria-expanded') === 'true';
    recommendationButton.setAttribute('aria-expanded', String(!isExpanded));
    extraRecommendations.forEach((card) => { card.hidden = isExpanded; });
    recommendationButton.querySelector('span').textContent = isExpanded
      ? 'View all recommendations'
      : 'Show fewer recommendations';
  });
}

const resumeDialog = document.querySelector('#resume-request-dialog');
const resumeRequestOpeners = [...document.querySelectorAll('[data-resume-request]')];
const resumeRequestForm = resumeDialog?.querySelector('#resume-request-form');
const resumeDialogCloseButtons = resumeDialog
  ? [...resumeDialog.querySelectorAll('[data-resume-dialog-close], [data-resume-dialog-cancel], [data-resume-dialog-done]')]
  : [];
const resumeTurnstileHost = resumeDialog?.querySelector('[data-resume-turnstile]');
const resumeFormStatus = resumeDialog?.querySelector('[data-resume-form-status]');
const resumeSubmitButton = resumeDialog?.querySelector('[data-resume-submit]');
const resumeSubmitLabel = resumeDialog?.querySelector('[data-resume-submit-label]');
const resumeSuccess = resumeDialog?.querySelector('[data-resume-success]');
const resumeEmailField = resumeRequestForm?.elements.namedItem('email');
const resumeMessageField = resumeRequestForm?.elements.namedItem('message');
const resumeCharacterCount = resumeDialog?.querySelector('[data-resume-character-count]');
const resumeDownloadButton = resumeDialog?.querySelector('[data-resume-download]');
const resumeDownloadMeta = resumeDialog?.querySelector('[data-resume-download-meta]');
const resumeSuccessMessage = resumeDialog?.querySelector('[data-resume-success-message]');
let resumeDownloadToken = '';
let resumeDownloadsRemaining = 0;
let resumeDownloadPending = false;
let resumeReturnFocus = null;
let resumeTurnstileWidget = null;
let resumeTurnstileToken = '';
let resumeIdempotencyKey = '';
let resumeRequestSucceeded = false;
let resumeConfigPromise = null;
let resumeTurnstileScriptPromise = null;

const setResumeStatus = (message = '') => {
  if (resumeFormStatus) resumeFormStatus.textContent = message;
};

const validateResumeEmail = () => {
  if (!resumeEmailField) return;
  const value = resumeEmailField.value.trim().toLowerCase();
  const separator = value.lastIndexOf('@');
  const domain = separator >= 0 ? value.slice(separator + 1).replace(/\.+$/u, '') : '';
  const isIbmDomain = domain === 'ibm.com' || domain.endsWith('.ibm.com');
  resumeEmailField.setCustomValidity(
    isIbmDomain
      ? 'This email domain is not eligible for resume delivery. Please use another email address.'
      : '',
  );
};

resumeEmailField?.addEventListener('input', validateResumeEmail);

const getResumeConfig = () => {
  if (!resumeConfigPromise) {
    resumeConfigPromise = fetch('/api/config', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.turnstileSiteKey) throw new Error('Configuration unavailable');
      return result;
    });
  }
  return resumeConfigPromise;
};

const loadTurnstileScript = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!resumeTurnstileScriptPromise) {
    resumeTurnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(window.turnstile), { once: true });
      script.addEventListener('error', () => reject(new Error('Verification unavailable')), { once: true });
      document.head.append(script);
    });
  }
  return resumeTurnstileScriptPromise;
};

const renderResumeTurnstile = async () => {
  if (!resumeTurnstileHost || resumeTurnstileWidget !== null) return;
  try {
    const [config, turnstile] = await Promise.all([getResumeConfig(), loadTurnstileScript()]);
    resumeTurnstileWidget = turnstile.render(resumeTurnstileHost, {
      sitekey: config.turnstileSiteKey,
      action: 'resume_request',
      theme: 'dark',
      size: 'flexible',
      callback: (token) => {
        resumeTurnstileToken = token;
        setResumeStatus();
      },
      'expired-callback': () => {
        resumeTurnstileToken = '';
        setResumeStatus('Verification expired. Please complete it again.');
      },
      'error-callback': () => {
        resumeTurnstileToken = '';
        setResumeStatus('Verification could not be loaded. Please try again.');
      },
    });
  } catch {
    setResumeStatus('Verification could not be loaded. Please close the dialog and try again.');
  }
};

const resetResumeTurnstile = () => {
  resumeTurnstileToken = '';
  if (resumeTurnstileWidget !== null && window.turnstile) {
    window.turnstile.reset(resumeTurnstileWidget);
  }
};

const resetResumeDialog = () => {
  if (!resumeRequestSucceeded) return;
  resumeRequestForm?.reset();
  resumeRequestForm?.removeAttribute('hidden');
  if (resumeSuccess) resumeSuccess.hidden = true;
  resumeRequestSucceeded = false;
  resumeDownloadToken = '';
  resumeDownloadsRemaining = 0;
  if (resumeDownloadButton) resumeDownloadButton.hidden = true;
  resumeIdempotencyKey = '';
  setResumeStatus();
  resetResumeTurnstile();
  if (resumeCharacterCount) resumeCharacterCount.textContent = '0 / 1000';
};

const closeResumeDialog = () => {
  if (!resumeDialog?.open) return;
  resumeDialog.close();
  document.body.classList.remove('resume-dialog-open');
  resetResumeDialog();
  resumeReturnFocus?.focus();
  resumeReturnFocus = null;
};

const openResumeDialog = (opener) => {
  if (!resumeDialog || resumeDialog.open) return;
  resumeReturnFocus = opener || document.activeElement;
  document.body.classList.add('resume-dialog-open');
  resumeDialog.showModal();
  resumeDialog.querySelector('input')?.focus();
  renderResumeTurnstile();
};

resumeRequestOpeners.forEach((opener) => {
  opener.addEventListener('click', () => openResumeDialog(opener));
});

resumeDialogCloseButtons.forEach((button) => button.addEventListener('click', closeResumeDialog));

resumeDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeResumeDialog();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !resumeDialog?.open) return;
  event.preventDefault();
  closeResumeDialog();
});

resumeDialog?.addEventListener('click', (event) => {
  if (event.target !== resumeDialog) return;
  const bounds = resumeDialog.getBoundingClientRect();
  const isInside = (
    event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom
  );
  if (!isInside) closeResumeDialog();
});

resumeMessageField?.addEventListener('input', () => {
  if (resumeCharacterCount) resumeCharacterCount.textContent = `${resumeMessageField.value.length} / 1000`;
});

resumeRequestForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  validateResumeEmail();
  const linkedInField = resumeRequestForm.elements.namedItem('linkedinUrl');
  if (linkedInField?.value) {
    try {
      const linkedInUrl = new URL(linkedInField.value);
      const hostname = linkedInUrl.hostname.toLowerCase();
      const isLinkedIn = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
      const isProfile = /^\/(?:in|pub)\//u.test(linkedInUrl.pathname);
      linkedInField.setCustomValidity(
        linkedInUrl.protocol === 'https:' && isLinkedIn && isProfile
          ? ''
          : 'Enter a full LinkedIn profile URL beginning with https://.',
      );
    } catch {
      linkedInField.setCustomValidity('Enter a full LinkedIn profile URL beginning with https://.');
    }
  } else {
    linkedInField?.setCustomValidity('');
  }

  const invalidOptionalField = resumeRequestForm.querySelector('.resume-optional :invalid');
  if (invalidOptionalField) invalidOptionalField.closest('details').open = true;
  if (!resumeRequestForm.reportValidity()) return;
  if (!resumeTurnstileToken) {
    setResumeStatus('Please complete the security verification.');
    return;
  }

  if (!resumeIdempotencyKey) {
    resumeIdempotencyKey = crypto.randomUUID().replaceAll('-', '');
  }
  const formData = new FormData(resumeRequestForm);
  const payload = {
    name: formData.get('name'),
    email: formData.get('email'),
    company: formData.get('company'),
    linkedinUrl: formData.get('linkedinUrl'),
    message: formData.get('message'),
    turnstileToken: resumeTurnstileToken,
    idempotencyKey: resumeIdempotencyKey,
  };

  resumeSubmitButton.disabled = true;
  resumeSubmitButton.setAttribute('aria-busy', 'true');
  resumeRequestForm.setAttribute('aria-busy', 'true');
  if (resumeSubmitLabel) resumeSubmitLabel.textContent = 'Preparing your resume…';
  setResumeStatus('Sending your request securely…');

  try {
    const response = await fetch('/api/resume/request', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      resumeIdempotencyKey = '';
      const failure = new Error(
        typeof result.message === 'string'
          ? result.message
          : 'The request could not be completed right now. Please try again later.',
      );
      failure.isPublic = true;
      throw failure;
    }

    resumeDownloadToken = typeof result.token === 'string' ? result.token : '';
    resumeDownloadsRemaining = result.remainingDeliveries || 0;
    if (resumeDownloadButton) {
      resumeDownloadButton.hidden = !resumeDownloadToken;
      resumeDownloadButton.disabled = resumeDownloadPending;
    }
    resumeSuccessMessage.textContent = resumeDownloadToken
      ? 'Download it now. We’ve also emailed you a link for later.'
      : 'Your request was already received. Please use the access link in your inbox.';
    resumeDownloadMeta.hidden = !resumeDownloadToken;
    resumeDownloadMeta.textContent = 'Access expires in seven days · 3 downloads remaining';
    resumeRequestSucceeded = true;
    resumeRequestForm.hidden = true;
    if (resumeSuccess) {
      resumeSuccess.hidden = false;
      resumeSuccess.focus();
    }
    setResumeStatus();
  } catch (error) {
    setResumeStatus(
      error.isPublic
        ? error.message
        : 'The request could not be completed right now. Please try again later.',
    );
    resetResumeTurnstile();
  } finally {
    resumeSubmitButton.disabled = false;
    resumeSubmitButton.removeAttribute('aria-busy');
    resumeRequestForm.removeAttribute('aria-busy');
    if (resumeSubmitLabel) resumeSubmitLabel.textContent = 'Get Resume';
  }
});

resumeDownloadButton?.addEventListener('click', async () => {
  if (!resumeDownloadToken || resumeDownloadsRemaining < 1 || resumeDownloadPending) return;
  const token = resumeDownloadToken;
  resumeDownloadPending = true;
  resumeDownloadButton.disabled = true;
  resumeDownloadButton.setAttribute('aria-busy', 'true');
  resumeDownloadButton.textContent = 'Preparing…';
  try {
    const response = await fetch('/api/resume/download', {
      method: 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/pdf, application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (token !== resumeDownloadToken) return;
      if (['LIMIT_REACHED', 'EXPIRED_LINK', 'INVALID_LINK'].includes(result.code)) resumeDownloadsRemaining = 0;
      resumeSuccessMessage.textContent = result.message || 'Download unavailable. Please try again.';
      return;
    }
    const pdf = await response.blob();
    if (pdf.type !== 'application/pdf') throw new Error('Invalid file');
    const objectUrl = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'Arun-CS-Staff-Software-Engineer-Resume.pdf';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    if (token !== resumeDownloadToken) return;
    const [used, maximum] = (response.headers.get('X-Resume-Delivery') || '').split('/').map(Number);
    resumeDownloadsRemaining = Number.isInteger(used) && Number.isInteger(maximum) && maximum >= used
      ? maximum - used : Math.max(0, resumeDownloadsRemaining - 1);
    resumeSuccessMessage.textContent = 'Your download has started. The emailed link uses the same download allowance.';
    resumeDownloadMeta.textContent = 'Access expires in seven days · ' + resumeDownloadsRemaining + ' downloads remaining';
  } catch {
    if (token === resumeDownloadToken) resumeSuccessMessage.textContent = 'The download could not be completed. Please try again or use your emailed link.';
  } finally {
    resumeDownloadPending = false;
    resumeDownloadButton.removeAttribute('aria-busy');
    resumeDownloadButton.textContent = 'Download resume';
    resumeDownloadButton.disabled = resumeDownloadsRemaining < 1;
  }
});

if (window.location.hash === '#request-resume') {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  window.requestAnimationFrame(() => openResumeDialog(resumeRequestOpeners[0]));
}

document.querySelector('[data-copy-email]')?.addEventListener('click', async () => {
  const status = document.querySelector('[data-copy-email-status]');
  try {
    await navigator.clipboard.writeText('csarun.careers@gmail.com');
    status.textContent = 'Email address copied.';
  } catch {
    status.textContent = 'Please copy this address: csarun.careers@gmail.com';
  }
});

document.querySelectorAll('[data-linkedin-announcement]').forEach(announcement => {
  announcement.addEventListener('toggle', () => {
    if (!announcement.open) return;
    const container = announcement.querySelector('[data-linkedin-container]');
    const template = announcement.querySelector('[data-linkedin-template]');
    if (container && template && !container.querySelector('iframe')) {
      container.append(template.content.cloneNode(true));
    }
  });
});

// Only animate the conceptual signal flow when it is visible and motion is welcome.
const emmaSignals = document.querySelector('[data-emma-signals]');
const emmaPauseButton = document.querySelector('[data-emma-pause]');
if (emmaSignals && emmaPauseButton && 'IntersectionObserver' in window) {
  let emmaVisible = false;
  let emmaPaused = false;
  const updateEmmaSignals = () => {
    const enabled = !reducedMotionQuery.matches;
    emmaSignals.classList.toggle('emma-signal-enabled', enabled);
    emmaSignals.classList.toggle('emma-signal-active', enabled && emmaVisible && !emmaPaused && !document.hidden);
    emmaPauseButton.hidden = !enabled;
    emmaPauseButton.setAttribute('aria-pressed', String(emmaPaused));
    emmaPauseButton.textContent = emmaPaused ? 'Resume animation' : 'Pause animation';
  };
  const emmaObserver = new IntersectionObserver(([entry]) => {
    emmaVisible = entry.isIntersecting;
    updateEmmaSignals();
  }, { threshold: .2 });
  emmaObserver.observe(emmaSignals);
  emmaPauseButton.addEventListener('click', () => { emmaPaused = !emmaPaused; updateEmmaSignals(); });
  reducedMotionQuery.addEventListener('change', updateEmmaSignals);
  document.addEventListener('visibilitychange', updateEmmaSignals);
  updateEmmaSignals();
}

// Open the case-study details before following its preview anchor.
document.querySelectorAll('.work-preview-copy > a[href^="#story-"]').forEach(link => {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.getAttribute('href'));
    const details = target?.querySelector('.story-details');
    if (details) details.open = true;
  });
});

// Keep the portrait stationary; only the surrounding halo follows a fine pointer.
const heroSpotlight = document.querySelector('.hero-visual');
const heroSection = document.querySelector('.hero');
const heroFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
if (heroSpotlight && heroSection) {
  let spotlightFrame = 0;
  let spotlightX = 0;
  let spotlightY = 0;
  const resetSpotlight = () => {
    window.cancelAnimationFrame(spotlightFrame);
    spotlightFrame = 0;
    heroSpotlight.style.removeProperty('--spotlight-x');
    heroSpotlight.style.removeProperty('--spotlight-y');
  };
  heroSpotlight.addEventListener('pointermove', event => {
    if (reducedMotionQuery.matches || !heroFinePointer.matches) return;
    const bounds = heroSpotlight.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    spotlightX = ((event.clientX - bounds.left) / bounds.width - .5) * 24;
    spotlightY = ((event.clientY - bounds.top) / bounds.height - .5) * 18;
    if (spotlightFrame) return;
    spotlightFrame = window.requestAnimationFrame(() => {
      heroSpotlight.style.setProperty('--spotlight-x', spotlightX + 'px');
      heroSpotlight.style.setProperty('--spotlight-y', spotlightY + 'px');
      spotlightFrame = 0;
    });
  });
  heroSpotlight.addEventListener('pointerleave', resetSpotlight);
  reducedMotionQuery.addEventListener('change', resetSpotlight);
  heroFinePointer.addEventListener('change', resetSpotlight);
  if ('IntersectionObserver' in window) {
    const heroIntroObserver = new IntersectionObserver((entries, observer) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      heroSection.classList.add('hero-interactions-ready');
      observer.disconnect();
    }, { threshold: .15 });
    heroIntroObserver.observe(heroSection);
  } else {
    heroSection.classList.add('hero-interactions-ready');
  }
}
