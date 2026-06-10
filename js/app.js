/**
 * アプリ初期化 & ルーティング
 */
import { initDB } from './db.js';
import { renderHome } from './views/home.js';
import { renderTeam } from './views/team.js';
import { renderGameSetup } from './views/gameSetup.js';
import { renderGame } from './views/game.js';
import { renderHistory } from './views/history.js';

const routes = {
  home: renderHome,
  team: renderTeam,
  gameSetup: renderGameSetup,
  game: renderGame,
  history: renderHistory,
};

let currentRoute = null;
let navigationVersion = 0;

function navigate(route, params = {}) {
  if (route === currentRoute && Object.keys(params).length === 0) {
    return;
  }
  const thisNavigation = ++navigationVersion;
  currentRoute = route;
  const container = document.getElementById('app');
  if (!container) return;

  const renderFn = routes[route];
  if (renderFn) {
    const renderResult = renderFn(container, navigate, params);
    if (renderResult && typeof renderResult.then === 'function') {
      renderResult.finally(() => {
        if (thisNavigation !== navigationVersion) return;
      });
    }
  } else {
    console.warn('Unknown route:', route);
    renderHome(container, navigate);
  }

  // Update URL hash for back button support
  if (window.location.hash.slice(1) !== route) {
    window.location.hash = route;
  }
}

// Expose navigate globally for game menu back button
window.__navigate = navigate;

async function init() {
  try {
    // Initialize database
    initDB();

    // Set up container
    const container = document.getElementById('app');
    if (!container) {
      console.error('App container not found');
      return;
    }

    // Handle back button
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'home';
      if (hash !== currentRoute && routes[hash]) {
        navigate(hash);
      }
    });

    // Initial render
    const initialRoute = window.location.hash.slice(1) || 'home';
    navigate(routes[initialRoute] ? initialRoute : 'home');

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered');
      } catch (err) {
        console.log('Service Worker registration failed:', err);
      }
    }

    console.log('⚾ Baseball Scorebook initialized');
  } catch (err) {
    console.error('App initialization failed:', err);
    document.getElementById('app').innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #E8ECF1;">
        <h2>初期化エラー</h2>
        <p style="color: #7C8A96; margin-top: 1rem;">${err.message}</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4ECDC4; color: #0F1923; border: none; border-radius: 8px; cursor: pointer;">再読込</button>
      </div>
    `;
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
