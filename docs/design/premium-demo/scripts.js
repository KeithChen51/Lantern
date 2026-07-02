// 高级显现动画监听
const revealItems = document.querySelectorAll('.reveal');
const observerOptions = {
  root: null,
  rootMargin: '0px 0px -8% 0px',
  threshold: 0.12
};

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

revealItems.forEach((item) => revealObserver.observe(item));

const heroBg = document.getElementById('hero-bg');

// 顶部搜索与消息浮层
const popoverToggles = document.querySelectorAll('[data-popover-toggle]');
const popoverPanels = document.querySelectorAll('[data-popover-panel]');

function closeAllPopovers(exceptId = '') {
  popoverToggles.forEach((toggle) => {
    const targetId = toggle.getAttribute('data-popover-toggle');
    if (targetId === exceptId) return;
    toggle.setAttribute('aria-expanded', 'false');
  });

  popoverPanels.forEach((panel) => {
    if (panel.id === exceptId) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  });
}

popoverToggles.forEach((toggle) => {
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const targetId = toggle.getAttribute('data-popover-toggle');
    const panel = targetId ? document.getElementById(targetId) : null;
    if (!panel) return;

    const nextOpen = toggle.getAttribute('aria-expanded') !== 'true';
    closeAllPopovers(targetId);
    toggle.setAttribute('aria-expanded', String(nextOpen));
    panel.classList.toggle('is-open', nextOpen);
    panel.setAttribute('aria-hidden', String(!nextOpen));

    if (nextOpen) {
      panel.querySelector('input')?.focus();
    }
  });
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.utility-popover')) return;
  closeAllPopovers();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllPopovers();
});

const demoSearchInput = document.querySelector('[data-demo-search]');
const demoSearchResults = document.querySelectorAll('[data-demo-search-results] a');

demoSearchInput?.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  demoSearchResults.forEach((item) => {
    const text = item.textContent.toLowerCase();
    item.classList.toggle('is-hidden', Boolean(query) && !text.includes(query));
  });
});

// 视差滚动特效 (respects reduced motion)
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  let scrollTicking = false;

  function updateParallax() {
    const scrolled = window.scrollY;

    if (heroBg && scrolled < window.innerHeight) {
      heroBg.style.transform = `translateY(${scrolled * 0.35}px)`;
    }

    scrollTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      requestAnimationFrame(updateParallax);
      scrollTicking = true;
    }
  }, { passive: true });
}

// 移动端菜单逻辑
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const mobileNavDrawer = document.querySelector('.mobile-nav-drawer');
const drawerLinks = document.querySelectorAll('.mobile-nav-drawer a');

const menuIcon = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.6" fill="none"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
const closeIcon = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.6" fill="none"><path d="M18 6L6 18M6 6l12 12"/></svg>';

if (mobileMenuBtn && mobileNavDrawer) {
  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = mobileNavDrawer.classList.toggle('is-open');
    mobileMenuBtn.innerHTML = isOpen ? closeIcon : menuIcon;
    mobileMenuBtn.setAttribute('aria-label', isOpen ? '关闭菜单' : '打开菜单');
    mobileNavDrawer.setAttribute('aria-hidden', !isOpen);
  });

  drawerLinks.forEach((link) => {
    link.addEventListener('click', () => {
      mobileNavDrawer.classList.remove('is-open');
      mobileMenuBtn.innerHTML = menuIcon;
      mobileMenuBtn.setAttribute('aria-label', '打开菜单');
      mobileNavDrawer.setAttribute('aria-hidden', 'true');
    });
  });
}
