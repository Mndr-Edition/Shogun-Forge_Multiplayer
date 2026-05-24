import { state } from './state.js';
import { combatLogic } from './combat.js';
import { leaderboardService } from './leaderboard.js';
import { socketService } from './network.js';
import { barracksLogic } from './barracks.js';

window.state = state;
window.socketService = socketService;
window.combatLogic = combatLogic;
window.leaderboardService = leaderboardService;

document.addEventListener('DOMContentLoaded', () => {
    const musicUrl = 'https://raw.githubusercontent.com/Mndr-Edition/Sprites/main/%5Bnoloop%5DOblivion.ogg';
    let bgMusic = new Audio(musicUrl); 
    bgMusic.loop = true;
    bgMusic.volume = 0.4;
    let isMusicPlaying = false;

    const startAudio = () => {
        if (isMusicPlaying) return; 
        
        bgMusic.play()
            .then(() => {
                console.log("Аудио поток успешно запущен.");
                isMusicPlaying = true;
                document.removeEventListener('click', startAudio);
                document.removeEventListener('touchstart', startAudio);
            })
            .catch(err => {
                if (err.name !== 'NotAllowedError') {
                    console.error("Ошибка воспроизведения:", err);
                }
            });
    };
    
    document.addEventListener('click', startAudio);
    document.addEventListener('touchstart', startAudio);

    socketService.init();
    state.init();
    barracksLogic.init();

    const playerName = localStorage.getItem('shogun_name') || "Daimyo_" + Math.floor(Math.random() * 1000);
    localStorage.setItem('shogun_name', playerName);

    window.authPlayerSession = () => {
        socketService.send('CLIENT_AUTH', { 
            name: playerName,
            localData: state.data 
        });
        console.log("[АП] Сессия авторизована через WebSocket для:", playerName);
    };

    document.getElementById('tax-slider')?.addEventListener('input', (e) => {
        const rate = parseInt(e.target.value);
        const taxValEl = document.getElementById('tax-val');
        if (taxValEl) taxValEl.textContent = rate;
        
        socketService.send('CLIENT_SET_TAX', { taxRate: rate });
    });

    document.getElementById('click-btn')?.addEventListener('click', () => {
        state.addGold(state.data.clickPower || 1);
    });

    document.getElementById('forge-btn')?.addEventListener('click', () => {
        state.Craft();
    });

    const hideCombatPlaceholder = () => {
        const placeholder = document.getElementById('combat-placeholder-desc');
        const container = document.getElementById('battle-container');
        if (placeholder) placeholder.style.display = 'none';
        if (container) container.style.display = 'block';
    };

    document.getElementById('start-campaign-btn')?.addEventListener('click', () => {
        hideCombatPlaceholder();
        state.StartCampaign();
    });

    document.getElementById('start-duel-btn')?.addEventListener('click', () => {
        hideCombatPlaceholder();
        state.startDuel();
    });

    const tabs = [
        { btn: 'tab-center-btn', screen: 'screen-center', id: 'center' },
        { btn: 'tab-forge-btn', screen: 'screen-forge', id: 'forge' },
        { btn: 'tab-barracks-btn', screen: 'screen-barracks', id: 'barracks' },
        { btn: 'tab-market-btn', screen: 'screen-market', id: 'market' },
        { btn: 'tab-combat-btn', screen: 'screen-combat', id: 'combat' },
        { btn: 'tab-leaderboard-btn', screen: 'screen-leaderboard', id: 'leaderboard' }
    ];

    tabs.forEach(tab => {
        const btnEl = document.getElementById(tab.btn);
        if (btnEl) {
            btnEl.addEventListener('click', () => {
                tabs.forEach(t => {
                    document.getElementById(t.btn)?.classList.remove('active');
                    document.getElementById(t.screen)?.classList.remove('active');
                });
                
                document.getElementById(tab.btn)?.classList.add('active');
                document.getElementById(tab.screen)?.classList.add('active');

                if (tab.id === 'leaderboard') {
                    socketService.send('CLIENT_REQ_LEADERBOARD');
                }

                if (tab.id === 'barracks' || tab.id === 'combat') {
                    state.updateUI();
                }

                const container = document.getElementById('battle-container');
                const placeholder = document.getElementById('combat-placeholder-desc');
                
                if (tab.id === 'combat') {
                    if (combatLogic.isActive) {
                        if (container) container.style.display = 'block';
                        if (placeholder) placeholder.style.display = 'none';
                    } else {
                        if (container) container.style.display = 'none';
                        if (placeholder) placeholder.style.display = 'block';
                    }
                } else {
                    if (container) container.style.display = 'none';
                }
            });
        }
    });
});
