export const clinicViews = Object.freeze({
  cleaning: 'cistenie-36-37',
  pulp: 'dren-36',
  smile: 'usmev',
});

export function readClinicView(params) {
  const view = params.get('pohlad');
  return Object.values(clinicViews).includes(view) ? view : null;
}

/** Keep a native link for long-press and open-in-new-tab. A normal tap
 * copies the canonical URL for the clinical demonstration. */
export function createClinicShare(stage, base, signal) {
  const doc = stage.ownerDocument;
  const group = doc.createElement('span');
  group.className = 'clinic-share';
  group.hidden = true;
  const link = doc.createElement('a');
  link.className = 'text-button';
  link.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 14 4-4M8.5 16.8l-1 1a3.7 3.7 0 0 1-5.3-5.2l4.7-4.7a3.7 3.7 0 0 1 5.2 0M15.5 7.2l1-1a3.7 3.7 0 0 1 5.3 5.2l-4.7 4.7a3.7 3.7 0 0 1-5.2 0"/></svg><span class="clinic-share-full">Kopírovať odkaz</span><span class="clinic-share-short">Odkaz</span>';
  const notice = doc.createElement('span');
  notice.className = 'clinic-copy-status';
  notice.setAttribute('role', 'status');
  group.append(link, notice);
  stage.querySelector('.header-actions').prepend(group);
  let current = null, timer;
  link.addEventListener('click', async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = link.href, view = current;
    let copied = false;
    try {
      await navigator.clipboard.writeText(destination);
      copied = true;
    } catch {
      // Older browsers and denied clipboard permission can still use native
      // copy via the prompt, or the link's own context menu.
      if (!signal.aborted && current === view) window.prompt('Skopírujte odkaz na ukážku', destination);
    }
    if (signal.aborted || current !== view || !copied) return;
    notice.textContent = view === clinicViews.cleaning ? 'Odkaz na čistenie skopírovaný' : 'Odkaz na dreň skopírovaný';
    clearTimeout(timer);
    timer = setTimeout(() => { notice.textContent = ''; }, 2000);
  }, { signal });
  signal.addEventListener('abort', () => { clearTimeout(timer); group.remove(); }, { once: true });
  return view => {
    if (view === current) return;
    current = view;
    clearTimeout(timer);
    notice.textContent = '';
    group.hidden = !view;
    if (!view) return;
    const url = new URL(base);
    url.search = '';
    url.hash = '';
    url.searchParams.set('pohlad', view);
    link.href = url.href;
    const label = view === clinicViews.cleaning ? 'Kopírovať odkaz na čistenie medzi 36 a 37' : 'Kopírovať odkaz na rez šestkou s dreňou';
    link.setAttribute('aria-label', label);
    link.title = label;
  };
}
