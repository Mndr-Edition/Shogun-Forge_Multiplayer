// === js/network.js ===
import { state } from './state.js';
import { leaderboardService } from './leaderboard.js';

export const socketService = {
    socket: null,
    reconnectInterval: 3000,

    init() {
        // Так как сервер запущен локально в терминале Acode на порту 5000
        const serverUrl = 'wss://shogun-forge-multiplayer.onrender.com';
 // Это тестовый сервер для проверки сети

        console.log(`[СЕТЬ] Подключение к серверу: ${serverUrl}`);
        this.socket = new WebSocket(serverUrl);

        this.socket.onopen = () => {
            console.log('[СЕТЬ] Соединение установлено успешно.');
            this.authenticate();
        };

        this.socket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                this.handlePacket(packet);
            } catch (err) {
                console.error('[СЕТЬ] Ошибка парсинга пакета:', err);
            }
        };

        this.socket.onclose = () => {
            console.warn(`[СЕТЬ] Соединение разорвано. Переподключение через ${this.reconnectInterval / 1000} сек...`);
            setTimeout(() => this.init(), this.reconnectInterval);
        };

        this.socket.onerror = (err) => {
            console.error('[СЕТЬ] Ошибка сокета:', err);
        };
    },

    authenticate() {
        // Берем имя из стейта (или дефолтное, если пустой)
        const playerName = state.data.name || `Daimyo_${Math.floor(100 + Math.random() * 900)}`;
        
        console.log(`[СЕТЬ] Отправка авторизации под именем: ${playerName}`);
        this.send('CLIENT_AUTH', {
            name: playerName,
            localData: state.data // Отдаем локальный сейв, если игрока нет в базе сервера
        });
    },

    send(type, payload = {}) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, payload }));
        } else {
            console.warn(`[СЕТЬ] Ошибка отправки. Сокет закрыт. Тип пакета: ${type}`);
        }
    },

    handlePacket(packet) {
        const { type, payload } = packet;

        switch (type) {
            case 'SERVER_STATE_SYNC':
                console.log('[СЕТЬ] Получен полный синк стейта от сервера:', payload);
                // Накатываем серверные данные на локальный теневой стейт
                Object.assign(state.data, payload);
                state.updateUI();
                break;

            case 'SERVER_TICK':
                // Ежесекундный экономический синк от сервера
                if (payload.serverData) {
                    Object.assign(state.data, payload.serverData);
                    state.updateUI();
                }
                break;

            case 'SERVER_LEADERBOARD_DATA':
                // Обновляем топ игроков в интерфейсе
                leaderboardService.updateData(payload.players);
                break;

            case 'SERVER_COMBAT_LOG':
                console.log('[СЕТЬ] Получен боевой лог для дуэли:', payload);
                // Здесь вызывается запуск симуляции на Canvas
                // combatLogic.start(payload.playerArmy, payload.enemyArmy, payload.mode);
                break;

            case 'SERVER_ALERT':
                alert(payload.message);
                break;

            default:
                console.warn(`[СЕТЬ] Неизвестный тип пакета от сервера: ${type}`);
        }
    }
};
