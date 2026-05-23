// === js/network.js ===
// ИМПОРТ STATE УДАЛЕН. СВЯЗЬ ЧЕРЕЗ WINDOW.STATE

export const socketService = {
    ws: null,
    reconnectInterval: 3000,
    
    init() {
        const serverUrl = 'wss://shogun-forge-multiplayer.onrender.com';
        console.log(`[СЕТЬ] Подключение к серверу: ${serverUrl}`);
        
        this.ws = new WebSocket(serverUrl);
        
        // Регистрируем сервис глобально, чтобы app.js имел к нему прямой доступ
        window.socketService = this;
        
        this.ws.onopen = () => {
            console.log('[СЕТЬ] Соединение установлено успешно.');
            this.authenticate();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const { type, payload } = JSON.parse(event.data);
                this.handleMessage(type, payload);
            } catch (err) {
                console.error('[СЕТЬ] Ошибка парсинга входящего пакета:', err);
            }
        };

        this.ws.onclose = () => {
            console.warn(`[СЕТЬ] Соединение разорвано. Переподключение через ${this.reconnectInterval / 1000} сек...`);
            setTimeout(() => this.init(), this.reconnectInterval);
        };

        this.ws.onerror = (err) => {
            console.error('[СЕТЬ] Ошибка сокета:', err);
        };
    },
    
    authenticate() {
        const playerName = localStorage.getItem('shogun_name') || `Daimyo_${Math.floor(100 + Math.random() * 900)}`;
        console.log(`[СЕТЬ] Отправка авторизации под именем: ${playerName}`);
        
        const localData = window.state ? window.state.data : null;

        this.send('CLIENT_AUTH', {
            name: playerName,
            localData: localData
        });
    },
    
    handleMessage(type, payload) {
        if (!window.state) return;

        switch (type) {
            case 'SERVER_STATE_SYNC':
            case 'SERVER_TICK':
                window.state.syncWithServer(payload);
                break;
            case 'SERVER_LEADERBOARD_DATA':
                if (window.leaderboardService && typeof window.leaderboardService.updateData === 'function') {
                    window.leaderboardService.updateData(payload.players);
                }
                break;
            case 'SERVER_BATTLE_RESULT':
                console.log('Результат кампании:', payload);
                if (payload.win) {
                    alert(`Победа в кампании! Награда: ${payload.reward}💰`);
                } else {
                    alert('Поражение! Ваша регулярная армия разбита.');
                }
                break;
            case 'SERVER_COMBAT_LOG':
                console.log('[СЕТЬ] Получен боевой лог дуэли:', payload);
                // Запуск визуализатора на Canvas, если модуль примонтирован к window
                if (window.combatLogic && typeof window.combatLogic.start === 'function') {
                    window.combatLogic.start(payload.playerArmy, payload.enemyArmy, payload.mode, payload.opponentName);
                }
                break;
            case 'SERVER_ALERT':
                alert(payload.message);
                break;
            default:
                console.warn(`[СЕТЬ] Неизвестный тип пакета от сервера: ${type}`);
        }
    },

    send(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[СЕТЬ] Сокет в режиме соединения. Буферизация запроса...');
            setTimeout(() => this.send(type, payload), 500);
        } else {
            console.warn('[СЕТЬ] Отмена отправки. WebSocket мертв:', type);
        }
    }
};
