// === js/app.js ===
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
    // ==========================================
    // ЗВУКОВОЙ ДВИЖОК
    // ==========================================
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

    // ==========================================
    // 1. Инициализация локального стейта и сети
    // ==========================================
    socketService.init();
    state.init();
    barracksLogic.init();

    // Принудительно генерируем / получаем имя игрока для авторизации
    const playerName = localStorage.getItem('shogun_name') || "Daimyo_" + Math.floor(Math.random() * 1000);
    localStorage.setItem('shogun_name', playerName);

    // Экспонируем хэндлер авторизации в window, чтобы network.js мог вызвать его строго в onopen
    window.authPlayerSession = () => {
        socketService.send('CLIENT_AUTH', { 
            name: playerName,
            localData: state.data 
        });
        console.log("[АП] Сессия авторизована через WebSocket для:", playerName);
    };

    // Налоги отправляем на сервер при изменении ползунка
    document.getElementById('tax-slider')?.addEventListener('input', (e) => {
        const rate = parseInt(e.target.value);
        const taxValEl = document.getElementById('tax-val');
        if (taxValEl) taxValEl.textContent = rate;
        
        socketService.send('CLIENT_SET_TAX', { taxRate: rate });
    });

    // ==========================================
    // 2. Игровые триггеры
    // ==========================================
    document.getElementById('click-btn')?.addEventListener('click', () => {
        // Вызываем метод стейта, инкапсулирующий отправку клика
        state.addGold(state.data.clickPower || 1);
    });

    document.getElementById('forge-btn')?.addEventListener('click', () => {
        // Вызываем метод крафта из стейта, где проверяется золото
        state.Craft();
    });

    // ==========================================
    // 3. Управление режимами боя
    // ==========================================
    const hideCombatPlaceholder = () => {
        const placeholder = document.getElementById('combat-placeholder-desc');
        const container = document.getElementById('battle-container');
        if (placeholder) placeholder.style.display = 'none';
        if (container) container.style.display = 'block';
    };

    document.getElementById('start-campaign-btn')?.addEventListener('click', () => {
        hideCombatPlaceholder();
        // Запуск через метод стейта с валидацией армии
        state.StartCampaign();
    });

    document.getElementById('start-duel-btn')?.addEventListener('click', () => {
        hideCombatPlaceholder();
        // Запуск асинхронного дуэльного цикла с поиском оппонента из state.js
        state.startDuel();
    });

    // ==========================================
    // 4. Навигация по вкладкам
    // ==========================================
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
                // 1. Сброс активных классов
                tabs.forEach(t => {
                    document.getElementById(t.btn)?.classList.remove('active');
                    document.getElementById(t.screen)?.classList.remove('active');
                });
                
                // 2. Активация выбранного таба
                document.getElementById(tab.btn)?.classList.add('active');
                document.getElementById(tab.screen)?.classList.add('active');

                // 3. Вызов специфичной логики табов
                if (tab.id === 'leaderboard') {
                    socketService.send('CLIENT_REQ_LEADERBOARD');
                }

                if (tab.id === 'barracks' || tab.id === 'combat') {
                    state.updateUI();
                }

                // 4. Синхронизация View и Controller для боевки
                const container = document.getElementById('battle-container');
                const placeholder = document.getElementById('combat-placeholder-desc');
                
                if (tab.id === 'combat') {
                    // Пользователь вернулся во вкладку боя. Опрашиваем движок.
                    if (combatLogic.isActive) {
                        if (container) container.style.display = 'block';
                        if (placeholder) placeholder.style.display = 'none';
                    } else {
                        if (container) container.style.display = 'none';
                        if (placeholder) placeholder.style.display = 'block';
                    }
                } else {
                    // Пользователь ушел в другую вкладку. 
                    // ДВИЖОК НЕ ОСТАНАВЛИВАЕМ. Скрываем только UI (контейнер канваса).
                    if (container) container.style.display = 'none';
                }
            });
        }
    });
});
