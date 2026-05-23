// === js/app.js ===
import { state } from './state.js';
import { combatLogic } from './combat.js';
import { leaderboardService } from './leaderboard.js';
import { socketService } from './socketService.js';

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

    const startAudio = () => {
        // Добавляем проверку, чтобы не вызывать play() без необходимости
        if (!bgMusic || bgMusic.playing) return; 
        
        bgMusic.play()
            .then(() => {
                console.log("Аудио поток успешно запущен.");
                // Удаляем слушатели, чтобы не засорять память
                document.removeEventListener('click', startAudio);
                document.removeEventListener('touchstart', startAudio);
            })
            .catch(err => {
                // Если это ошибка "NotAllowedError", игнорируем её, 
                // так как она ожидаема до первого клика
                if (err.name !== 'NotAllowedError') {
                    console.error("Ошибка воспроизведения:", err);
                }
            });
    };
    
    // Оставляем слушатели
    document.addEventListener('click', startAudio);
    document.addEventListener('touchstart', startAudio);

    // ==========================================
    // 1. Инициализация локального стейта и сети
    // ==========================================
    socketService.init();
    state.init();
     // Поднимаем WebSocket-соединение
    
    // Налоги отправляем на сервер. Сервер валидирует диапазон и применяет к сессии игрока.
    document.getElementById('tax-slider')?.addEventListener('input', (e) => {
        const rate = parseInt(e.target.value);
        const taxValEl = document.getElementById('tax-val');
        if (taxValEl) taxValEl.textContent = rate;
        
        socketService.send('CLIENT_SET_TAX', { taxRate: rate });
    });

    // ==========================================
    // 2. Игровые триггеры (Отправка интентов на сервер)
    // ==========================================
    document.getElementById('click-btn')?.addEventListener('click', () => {
        // Сервер сам посчитает силу клика по уровню кузницы в БД
        socketService.send('CLIENT_CLICK_GOLD');
    });

    document.getElementById('forge-btn')?.addEventListener('click', () => {
        // Запрос на крафт. Сервер проверит ресурсы и вернет результат
        socketService.send('CLIENT_CRAFT_REQUEST');
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
        // Запрос серверу на симуляцию кампании
        socketService.send('CLIENT_START_CAMPAIGN');
    });

    document.getElementById('start-duel-btn')?.addEventListener('click', () => {
        hideCombatPlaceholder();
        // Передаем null, чтобы сервер подобрал случайного оппонента из базы данных
        socketService.send('CLIENT_START_DUEL', { targetPlayerId: null });
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
                tabs.forEach(t => {
                    document.getElementById(t.btn)?.classList.remove('active');
                    document.getElementById(t.screen)?.classList.remove('active');
                });
                
                document.getElementById(tab.btn)?.classList.add('active');
                document.getElementById(tab.screen)?.classList.add('active');

                if (tab.id === 'leaderboard') {
                    // Запрашиваем актуальный топ у сервера при открытии вкладки
                    socketService.send('CLIENT_REQ_LEADERBOARD');
                }

                if (tab.id === 'barracks' || tab.id === 'combat') {
                    state.updateUI();
                }

                if (tab.id !== 'combat') {
                    if (combatLogic && typeof combatLogic.stop === 'function') {
                        combatLogic.stop();
                    }
                    
                    const container = document.getElementById('battle-container');
                    const placeholder = document.getElementById('combat-placeholder-desc');
                    
                    if (container) container.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'block';
                    
                    const bBtn = document.getElementById('start-campaign-btn');
                    const dBtn = document.getElementById('start-duel-btn');
                    if (bBtn) bBtn.disabled = false;
                    if (dBtn) dBtn.disabled = false;
                }
            });
        }
    });
});
