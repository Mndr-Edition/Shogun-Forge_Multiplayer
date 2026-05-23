// === server.js ===
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'server_db.json');

app.use(express.static(__dirname));

const server = http.createServer(app);

// --- Инициализация БД ---
let db = { players: {} };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("[БД] Ошибка чтения файла БД, создаем чистую...");
    }
}

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.error("[БД] Ошибка записи файла базы данных:", err);
    }
};

const clients = new Map();
const wss = new WebSocket.Server({ server });

// --- Глобальный игровой цикл (1 тик = 1 секунда) ---
setInterval(() => {
    Object.keys(db.players).forEach(id => {
        const p = db.players[id];
        if (!p) return;
        
        // 1. Прирост дней
        p.daysPassed = (p.daysPassed || 0) + 1;
        
        // 2. Экономика
        const taxRate = p.taxRate !== undefined ? p.taxRate : 50;
        const popIncome = (p.population || 100) * 0.001 * (taxRate / 100);
        const mineLvl = p.buildings?.goldmineLevel || 0;
        const mineIncome = mineLvl * 5;
        const income = popIncome + mineIncome;
        
        p.gold = (p.gold || 0) + income;

        // 3. Прирост населения
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

        // 4. Отправка обновлений онлайн-игроку
        if (clients.has(id)) {
            const ws = clients.get(id);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'SERVER_TICK',
                    payload: getClientState(id)
                }));
            }
        }
    });

    if (Date.now() % 5000 < 1000) {
        saveDB();
        broadcastLeaderboard();
    }
}, 1000);

function getClientState(id) {
    const p = db.players[id];
    return {
        id: p.id,
        name: p.name,
        gold: Math.floor(p.gold),
        population: Math.floor(p.population),
        daysPassed: p.daysPassed,
        taxRate: p.taxRate !== undefined ? p.taxRate : 50,
        stage: p.stage || 1,
        buildings: p.buildings || {},
        army: p.army || {},
        reserve: p.reserve || {},
        unitTech: p.unitTech || {},
        inventory: p.inventory || [],
        market: p.market || { systemSlots: [], playerSlots: [] }
    };
}

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

const combatEngine = {
    simulate(playerArmy, enemyArmy) {
        const pPower = Object.values(playerArmy || {}).reduce((a, b) => a + b, 0);
        const ePower = Object.values(enemyArmy || {}).reduce((a, b) => a + b, 0);
        return { win: pPower > (ePower * 0.8) }; 
    }
};

function generateEnemyArmy(stage) {
    return {
        ashigaru_spear: 5 + (stage * 2),
        samurai_katana: Math.floor(stage / 2)
    };
}

wss.on('connection', (ws) => {
    let clientId = null;

    ws.on('message', (message) => {
        try {
            const packet = JSON.parse(message);
            const { type, payload } = packet;

            switch (type) {
                case 'CLIENT_AUTH': {
                    let player = Object.values(db.players).find(p => p.name === payload.name);
                    
                    if (!player) {
                        const newId = uuidv4();
                        const cleanLocalData = payload.localData ? JSON.parse(JSON.stringify(payload.localData)) : {};
                        
                        db.players[newId] = {
                            id: newId,
                            name: payload.name,
                            gold: cleanLocalData.gold !== undefined ? cleanLocalData.gold : 200,
                            population: cleanLocalData.population || 100,
                            daysPassed: cleanLocalData.daysPassed || 0,
                            taxRate: cleanLocalData.taxRate || 50,
                            stage: cleanLocalData.stage || 1,
                            buildings: cleanLocalData.buildings || {},
                            army: cleanLocalData.army || {},
                            reserve: cleanLocalData.reserve || {},
                            unitTech: cleanLocalData.unitTech || {},
                            inventory: cleanLocalData.inventory || [],
                            market: cleanLocalData.market || { systemSlots: [], playerSlots: [] }
                        };
                        player = db.players[newId];
                        console.log(`[БД] Зарегистрирован новый клан: ${player.name}`);
                    }
                    
                    clientId = player.id;
                    clients.set(clientId, ws);
                    
                    console.log(`[СЕТЬ] Даймё ${player.name} вошел в сеть.`);
                    
                    ws.send(JSON.stringify({
                        type: 'SERVER_STATE_SYNC',
                        payload: getClientState(clientId)
                    }));
                    broadcastLeaderboard();
                    break;
                }
                    
                case 'CLIENT_START_CAMPAIGN': {
                    if (!clientId || !db.players[clientId]) return;
                    const p = db.players[clientId];
                    const currentStage = p.stage || 1;
                    
                    const enemyArmy = generateEnemyArmy(currentStage);
                    const battleResult = combatEngine.simulate(p.army, enemyArmy);

                    if (battleResult.win) {
                        const reward = currentStage * 250;
                        p.gold += reward;
                        p.stage = currentStage + 1;
                    } else {
                        if (p.army) {
                            Object.keys(p.army).forEach(type => p.army[type] = 0);
                        }
                    }

                    saveDB();
                    ws.send(JSON.stringify({ 
                        type: 'SERVER_BATTLE_RESULT', 
                        payload: { 
                            win: battleResult.win,
                            enemyArmy,
                            reward: battleResult.win ? (currentStage * 250) : 0
                        } 
                    }));
                    
                    ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                    break;
                }

                case 'CLIENT_SET_TAX':
                    if (clientId && db.players[clientId]) {
                        const rate = parseInt(payload.taxRate);
                        if (!isNaN(rate) && rate >= 0 && rate <= 100) {
                            db.players[clientId].taxRate = rate;
                            saveDB();
                        }
                    }
                    break;

                case 'CLIENT_CLICK_GOLD':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const forgeLvl = p.buildings?.forgeLevel || 0;
                        p.gold += (1 + (forgeLvl * 5));
                        saveDB(); 
                        ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                    }
                    break;

                case 'CLIENT_BUY_BUILDING':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const { buildingId, cost } = payload;
                        if (p.gold >= cost) {
                            p.gold -= cost;
                            if (!p.buildings) p.buildings = {};
                            
                            // Сохраняем и флаг наличия, и инкрементируем уровень здания корректно
                            p.buildings[buildingId] = true; 
                            p.buildings[`${buildingId}Level`] = (p.buildings[`${buildingId}Level`] || 0) + 1;
                            
                            saveDB();
                            ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                        }
                    }
                    break;

                case 'CLIENT_CRAFT_WEAPON':
                    if (clientId && db.players[clientId]) {
                        const p = db.players[clientId];
                        const techLevel = p.buildings?.forgeLevel || 1;
                        const generatedItem = payload.item || {
                            id: uuidv4(),
                            name: `Катана Ранга ${techLevel}`,
                            basePrice: techLevel * 300,
                            rarity: techLevel > 5 ? 'epic' : 'common'
                        };
                        const cost = techLevel * 150;

                        if (p.gold >= cost) {
                            p.gold -= cost;
                            if (!p.inventory) p.inventory = [];
                            p.inventory.push(generatedItem);
                            saveDB();
                            ws.send(JSON.stringify({ type: 'SERVER_STATE_SYNC', payload: getClientState(clientId) }));
                        }
                    }
                    break;

                case 'CLIENT_REQ_LEADERBOARD':
                    broadcastLeaderboard();
                    break;

                case 'CLIENT_START_DUEL': {
                    if (!clientId || !db.players[clientId]) return;
                    const attacker = db.players[clientId];
                    let targetId = payload.targetPlayerId;
                    
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

                    const playerArmy = Object.entries(attacker.army || {}).map(([type, count]) => ({ type, count })).filter(u => u.count > 0);
                    let enemyArmy = Object.entries(defender.army || {}).map(([type, count]) => ({ type, count })).filter(u => u.count > 0);

                    if (enemyArmy.length === 0) {
                        enemyArmy.push({ type: 'ashigaru_spear', count: 5 }); 
                    }

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
                }
            }
        } catch (err) {
            console.error("[СЕТЬ] Ошибка обработки сообщения сокета:", err);
        }
    });

    ws.on('close', () => {
        if (clientId) {
            clients.delete(clientId);
            console.log(`[СЕТЬ] Соединение с даймё ID: ${clientId} закрыто.`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`[СЕРВЕР] Слушаю порт ${PORT}`);
});
