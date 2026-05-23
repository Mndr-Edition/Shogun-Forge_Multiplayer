// === js/leaderboard.js ===
import { state } from './state.js';
import { socketService } from './network.js'; // ИСПРАВЛЕНО: Импортируем из network.js, а не app.js

const formatLeaderboardGold = (num) => {
    const n = parseFloat(num);
    if (isNaN(n) || n <= 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.floor(n).toString();
};

export const leaderboardService = {
    currentTop: [],

    updateData(serverPlayers) {
        this.currentTop = serverPlayers || [];
        this.render();
    },

    render() {
        const listEl = document.querySelector('#leaderboard-list');
        if (!listEl) return;

        if (this.currentTop.length === 0) {
            listEl.innerHTML = `<li style="color: #aaa; font-family: monospace;">Загрузка топа...</li>`;
            return;
        }

        const sorted = [...this.currentTop].sort((a, b) => b.gold - a.gold);

        listEl.innerHTML = sorted.map((p, index) => {
            const isLocal = p.id === state.data.id || p.name === state.data.name;

            return `
                <li style="margin-bottom: 12px; font-family: monospace; list-style: none; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="color: ${isLocal ? '#00ff77' : '#ffd700'}">${index + 1}. ${p.name}</span> 
                        — <span style="color: #aaa">${formatLeaderboardGold(p.gold)} 💰</span> 
                        <span style="color: #666; font-size: 11px;">(Этап ${p.stage || 1})</span>
                    </div>
                    ${!isLocal ? `
                        <button 
                            onclick="window.startDuelWith('${p.id || p.name}')"
                            style="background: #ff3333; color: #fff; border: 1px solid #ff4d4d; padding: 2px 8px; font-family: monospace; cursor: pointer; font-size: 11px;"
                        >
                            ДУЭЛЬ
                        </button>
                    ` : '<span style="color: #00ff77; font-size: 11px; padding-right: 10px;">Это ты</span>'}
                </li>
            `;
        }).join('');
    }
};

window.startDuelWith = (targetId) => {
    const placeholder = document.getElementById('combat-placeholder-desc');
    const container = document.getElementById('battle-container');
    if (placeholder) placeholder.style.display = 'none';
    if (container) container.style.display = 'block';

    console.log(`[ДУЭЛЬ] Запрос боя против: ${targetId}`);
    socketService.send('CLIENT_START_DUEL', { targetPlayerId: targetId });
};
