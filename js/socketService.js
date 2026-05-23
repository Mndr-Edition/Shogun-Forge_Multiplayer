// === js/socketService.js ===
import { state } from './state.js';

export const socketService = {
    ws: null,
    
    init() {
        this.ws = new WebSocket(`ws://${window.location.hostname}:5000`);
        
        this.ws.onmessage = (event) => {
            const { type, payload } = JSON.parse(event.data);
            this.handleMessage(type, payload);
        };
    },
    
    handleMessage(type, payload) {
        switch (type) {
            case 'SERVER_STATE_SYNC':
            case 'SERVER_TICK':
                state.syncWithServer(payload.serverData || payload);
                break;
            case 'SERVER_BATTLE_RESULT':
                // Тут триггерится показ окна с результатами боя
                console.log('Результат боя:', payload);
                break;
            case 'SERVER_COMBAT_LOG':
                // Логика запуска комбат-движка по команде сервера
                break;
            case 'SERVER_LEADERBOARD_DATA':
                // Обновление UI лидерборда
                break;
        }
    },
    
    send(type, payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }
};
