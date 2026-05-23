// === server.js ===
const express = require('express'); // Добавили
const http = require('http'); // Добавили
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express(); // Инициализация express
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'server_db.json');

// Добавляем раздачу статики (html, css, js)
app.use(express.static(__dirname));

// Создаем HTTP-сервер
const server = http.createServer(app);

// --- Инициализация простейшей БД ---
let db = { players: {} };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("[БД] Ошибка чтения файла БД, создаем чистую...");
    }
}

const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
};

// Хранилище активных соединений сокетов: [id] = ws
const clients = new Map();

// ПРИВЯЗЫВАЕМ СОКЕТЫ К HTTP СЕРВЕРУ
const wss = new WebSocket.Server({ server });

// --- Глобальный игровой цикл (раз в секунду) ---
setInterval(() => {
    Object.keys(db.players).forEach(id => {
        const p = db.players[id];
        
        // Симуляция прироста дней и обсчет базовой экономики на сервере
        p.daysPassed = (p.daysPassed || 0) + 1;
        
        // Эквивалент calculateIncome с клиента
        const taxRate = p.taxRate !== undefined ? p.taxRate : 50;
        const popIncome = (p.population || 100) * 0.001 * (taxRate / 100);
        const mineLvl = p.buildings?.goldmineLevel || 0;
        const mineIncome = mineLvl * 5;
        const income = popIncome + mineIncome;
        
        p.gold = (p.gold || 0) + income;

        // Эквивалент calculatePopulationGrowth
        const maxPop = 1000000 + ((p.buildings?.ricefieldLevel || 0) * 1400000);
        if ((p.population || 100) < maxPop) {
            const taxMultiplier = Math.max(0, 1 - (taxRate / 100));
            const spaceFactor = (maxPop - p.population) / maxPop;
            const baseGrowthRate = Math.sqrt(p.population) * 2;
            const riceBonus = (p.buildings?.ricefieldLevel || 0) * 15;
            let finalGrowth = Math.floor((baseGrowthRate + riceBonus) * spaceFactor * taxMultiplier);
            if (finalGrowth <= 0 && taxRate < 100) finalGrowth = 1;
            
            p.population = Math.min(maxPop, p.population + finalGrowth);
        }

        // Если игрок онлайн — шлем ему персональный тик
        if (clients.has(id)) {
            const ws = clients.get(id);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'SERVER_TICK',
                    payload: { serverData: getClientState(id) }
                }));
            }
        }
    });

    // Раз в 5 секунд синкаем файл базы на диск и рассылаем лидерборд всем онлайн
    if (Date.now() % 5000 < 1000) {
        saveDB();
        broadcastLeaderboard();
    }
}, 1000);

// Хелпер формирования пакета стейта (без лишнего мусора)
function getClientState(id) {
    const p = db.players[id];
    return {
        id: p.id,
        name: p.name,
        gold: Math.floor(p.gold),
        population: Math.floor(p.population),
        daysPassed: p.daysPassed,
        taxRate: p.taxRate !== undefined ? p.taxRate : 50, // <--- ДОБАВЬ ЭТУ СТРОКУ
        stage: p.stage || 1,
        buildings: p.buildings,
        army: p.army,
        reserve: p.reserve,
        unitTech: p.unitTech,
        inventory: p.inventory || [],
        market: p.market
    };
}

// Сборка топа для рассылки
function broadcastLeaderboard() {
    const playersArray = Object.values(db.players).map(p => ({
        id: p.id,
        name: p.name,
        gold: Math.floor(p.gold),
        stage: p.stage || 1
    }));

    const packet = JSON.stringify({
        type: 'SERVER_LEADERBOARD_DATA',
        payload: { players: playersArray }
    });

    clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(packet);
        }
    });
}

// --- Обработка сетевых пакетов ---
wss.on('connection', (ws) => {
    let clientId = null;

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message);
            const { type, payload } = packet;

            switch (type) {
                case 'CLIENT_AUTH':
                    // Авторизация по имени (для простоты теста). На проде лучше токен/uuid в localStorage
                    let player = Object.values(db.players).find(p => p.name === payload.name);
                    
                    if (!player) {
                        // Первое появление даймё — инициализируем структуру на основе дефолта клиента
                        const newId = uuidv4();
                        db.players[newId] = {
                            id: newId,
                            name: payload.name,
                            ...payload.localData
                        };
                        player = db.players[newId];
                        console.log(`[БД] Зарегистрирован новый клан: ${player.name}`);
                    }
                    
                    clientId = player.id;
                    clients.set(clientId, ws);
                    
                    console.log(`[СЕТЬ] Даймё ${player.name} вошел в сеть.`);
                    
                    // Синкаем стейт сразу после входа
                    ws.send(JSON.stringify({
                        type: 'SERVER_STATE_SYNC',
                        payload: getClientState(clientId)
                    }));
                    broadcastLeaderboard();
                    break;
                    
                    case 'CLIENT_START_CAMPAIGN':
    if (clientId && db.players[clientId]) {
        const p = db.players[clientId];
        const stage = payload.stage;
        
        // 1. Генерируем врага на сервере (контроль сложности)
        const enemyArmy = generateEnemyArmy(stage);
        
        // 2. Логика симуляции боя (на сервере!)
        const battleResult = combatEngine.simulate(p.army, enemyArmy);

        if (battleResult.win) {
            const reward = stage * 250;
            p.gold += reward;
            p.stage++;
        } else {
            // Обнуляем армию при проигрыше
            Object.keys(p.army).forEach(type => p.army[type] = 0);
        }

        // 3. Отправляем результат клиенту для отображения анимации
        ws.send(JSON.stringify({ 
            type: 'SERVER_BATTLE_RESULT', 
            payload: { 
                win: battleResult.win,
                enemyArmy,
                reward: battleResult.win ? (stage * 250) : 0
            } 
        }));
        
        // Синхронизируем состояние
        ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
    }
    break;


                case 'PING':
                    ws.send(JSON.stringify({ type: 'PONG' }));
                    break;

                case 'CLIENT_SET_TAX':
                    if (clientId && db.players[clientId]) {
                        const rate = parseInt(payload.taxRate);
                        if (rate >= 0 && rate <= 100) {
                            db.players[clientId].taxRate = rate;
                        }
                    }
                    break;

                case 'CLIENT_CLICK_GOLD':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const forgeLvl = p.buildings?.forge ? (p.buildings.forgeLevel || 1) : 0;
                        const clickPower = 1 + (forgeLvl * 5);
                        p.gold += clickPower;
                    }
                    break;
                                    case 'CLIENT_BUY_BUILDING':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const { buildingId, cost } = payload;
                        if (p.gold >= cost) {
                            p.gold -= cost;
                            if (!p.buildings) p.buildings = {};
                            const key = `${buildingId}Level`;
                            p.buildings[key] = (p.buildings[key] || 0) + 1;
                            // Сразу синкаем, чтобы клиент не ждал тика
                            ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                        }
                    }
                    break;

                case 'CLIENT_CRAFT':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const { item, cost } = payload;
                        if (p.gold >= cost) {
                            p.gold -= cost;
                            if (!p.inventory) p.inventory = [];
                            p.inventory.push(item);
                            ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                        }
                    }
                    break;


                case 'CLIENT_REQ_LEADERBOARD':
                    broadcastLeaderboard();
                    break;

                case 'CLIENT_START_DUEL':
                    if (!clientId || !db.players[clientId]) return;
                    const attacker = db.players[clientId];
                    
                    let targetId = payload.targetPlayerId;
                    
                    // Если конкретная цель не указана — ищем рандомного оффлайн/онлайн чувака (но не себя)
                    if (!targetId) {
                        const pool = Object.keys(db.players).filter(id => id !== clientId);
                        if (pool.length === 0) {
                            ws.send(JSON.stringify({
                                type: 'SERVER_ALERT',
                                payload: { message: "Мир пуст! На сервере больше нет даймё для дуэли." }
                            }));
                            return;
                        }
                        targetId = pool[Math.floor(Math.random() * pool.length)];
                    }

                    const defender = db.players[targetId];
                    if (!defender) return;

                    // Сервер забирает текущие слепки армий из БД
                    const playerArmy = Object.entries(attacker.army || {}).map(([type, count]) => ({ type, count })).filter(u => u.count > 0);
                    let enemyArmy = Object.entries(defender.army || {}).map(([type, count]) => ({ type, count })).filter(u => u.count > 0);

                    // Страховочный пак врагу, если у него по нулям
                    if (enemyArmy.length === 0) {
                        enemyArmy.push({ type: 'ashigaru_spear', count: 5 }); 
                    }

                    // Отправляем лог боя. Клиент нарисует симуляцию в Canvas.
                    // Поскольку боевка обсчитывается детерминированно визуализатором на фронте, 
                    // сервер отдает команду симулировать. Результат улетает обратно.
                    ws.send(JSON.stringify({
                        type: 'SERVER_COMBAT_LOG',
                        payload: {
                            opponentName: defender.name,
                            mode: 'duel',
                            playerArmy,
                            enemyArmy
                        }
                    }));
                    break;
                
                // Сюда будут расширяться обработчики крафта, рынка, кампаний
            }
        } catch (err) {
            console.error("[СЕТЬ] Ошибка обработки сообщения сокета:", err);
        }
    });
    
});

server.listen(PORT, () => {
    console.log(`[СЕРВЕР] Слушаю порт ${PORT}`);
});

