(() => {
  'use strict';
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav__links');
  function closeMenu() { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeMenu(); menu.focus(); } });
  const filters = [...document.querySelectorAll('[data-filter]')];
  const publications = [...document.querySelectorAll('.pub')];
  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(other => { other.classList.toggle('is-active', other === button); other.setAttribute('aria-pressed', String(other === button)); });
    let count = 0;
    publications.forEach(pub => {
      const show = button.dataset.filter === 'all' || pub.dataset.cat.split(' ').includes(button.dataset.filter);
      pub.classList.toggle('is-hidden', !show); if (show) count++;
    });
    document.querySelector('#publication-status').textContent = `${count} selected publications shown`;
  }));
  document.querySelector('#year').textContent = new Date().getFullYear();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .06 });
    document.querySelectorAll('.section__head, .card, .tl__item').forEach(el => { el.classList.add('reveal'); observer.observe(el); });
  }
})();
