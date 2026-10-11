(() => {
  'use strict';
  let saved;
  try { saved = localStorage.getItem('datatransform-theme'); } catch { /* Storage is optional. */ }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const update = () => button.setAttribute('aria-checked', String(document.documentElement.dataset.theme === 'dark'));
    update();
    button.addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('datatransform-theme', theme); } catch { /* The switch still works. */ }
      update();
    });
  });
})();
