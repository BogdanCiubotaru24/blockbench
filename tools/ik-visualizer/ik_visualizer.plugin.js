// plugins/ik_visualizer.plugin.js
(function() {
  const PLUGIN_ID = 'ik_visualizer';
  const PANEL_ID  = 'ik_visualizer_panel';

  function openPanel() {
    // Create container
    let panel = document.getElementById(PANEL_ID);
    if (panel) return; // already open
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed', left: '16px', top: '16px', right: '16px', bottom: '16px',
      background: '#0f1115', border: '1px solid #2b3147', borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1e9, overflow: 'hidden'
    });

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#141821;border-bottom:1px solid #2b3147;color:#cbd5e1';
    bar.innerHTML = '<div>IK Workspace Visualizer</div><button id="ikv_close" style="all:unset;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px">×</button>';

    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { width: '100%', height: '100%', border: '0' });

    panel.appendChild(bar);
    panel.appendChild(iframe);
    document.body.appendChild(panel);

    document.getElementById('ikv_close').onclick = () => panel.remove();

    // Load local HTML (served by dev server or packed with app)
    const rel = 'tools/ik-visualizer/index.html';
    const base = location.origin; // if you have a dev server; otherwise compute file path
    iframe.src = base + '/' + rel;

    iframe.addEventListener('load', () => {
      const w = iframe.contentWindow;
      // Bridge core BB globals so the adapter works
      try {
        w.THREE = window.THREE;
        w.Group = window.Group;
        w.Locator = window.Locator;
        w.IKPreviewInstance = window.IKPreviewInstance || null;
        console.log('[ik_visualizer] bridge attached');
      } catch (e) {
        console.warn('[ik_visualizer] bridge failed', e);
      }
    });
  }

  // Register an action in the Tools menu
  const actionId = 'open_ik_visualizer';
  const action = new Action(actionId, {
    name: 'IK Workspace Visualizer',
    description: 'Visualize IK reachability and constraints',
    icon: 'fa-cube',
    click: openPanel
  });
  MenuBar.addAction(action, 'tools');

  // Optional: export a small API
  window.IKVisualizer = { open: openPanel };
})();
