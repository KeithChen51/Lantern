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

// 背景切换逻辑
const bgButtons = document.querySelectorAll('[data-bg]');
const root = document.documentElement;
const heroBg = document.getElementById('hero-bg');

bgButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const newBg = `url("${button.dataset.bg}")`;
    root.style.setProperty('--hero-image', newBg);

    if (heroBg) {
      heroBg.style.backgroundImage = newBg;
    }

    bgButtons.forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
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
