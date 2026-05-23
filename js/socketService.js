// === js/socketService.js ===
// УДАЛИ ИМПОРТ STATE ОТСЮДА!

export const socketService = {
    ws: null,
    
    init() {
        // Если сервер на другом домене (Render), замени window.location.hostname
        this.ws = new WebSocket('wss://shogun-forge-multiplayer.onrender.com');
        
        this.ws.onmessage = (event) => {
            const { type, payload } = JSON.parse(event.data);
            this.handleMessage(type, payload);
        };
    },
    
    handleMessage(type, payload) {
        // Используем window.state, который мы объявили глобально
        if (!window.state) return;

        switch (type) {
            case 'SERVER_STATE_SYNC':
            case 'SERVER_TICK':
                window.state.syncWithServer(payload.serverData || payload);
                break;
            case 'SERVER_BATTLE_RESULT':
                console.log('Результат боя:', payload);
                break;
            case 'SERVER_COMBAT_LOG':
                // Логика запуска комбат-движка
                break;
            case 'SERVER_LEADERBOARD_DATA':
                // Здесь можешь дернуть leaderboardService, если он глобален, 
                // или через window.leaderboardService
                break;
        }
    },
    
send(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type, payload }));
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        // Очередь или повтор: ждем 500мс и пробуем еще раз
        console.log('[СЕТЬ] Сокет соединяется, ждем...');
        setTimeout(() => this.send(type, payload), 500);
    } else {
        console.warn('[СЕТЬ] Сокет закрыт или не инициализирован:', type);
    }
}
};
