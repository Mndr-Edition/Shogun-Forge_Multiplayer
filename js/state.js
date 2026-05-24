// === js/state.js ===
import { BUILDINGS_CONFIG } from './buildings.js';
import { db } from './database.js';
import { forge } from './forge.js';
import { marketLogic } from './market.js';
import { combatLogic } from './combat.js';
import { leaderboardService } from './leaderboard.js';
import { barracksLogic } from './barracks.js';
import { UNITS_CONFIG } from './units.js';

const formatSengokuDate = (totalDays) => {
    let year = 1467;
    let days = totalDays;

    while (true) {
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        const daysInYear = isLeap ? 366 : 365;

        if (days < daysInYear) break;
        days -= daysInYear;
        year++;
    }

    const monthLengths = [
        31, ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 29 : 28, 
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ];

    let month = 0;
    while (days >= monthLengths[month]) {
        days -= monthLengths[month];
        month++;
    }

    const d = String(days + 1).padStart(2, '0');
    const m = String(month + 1).padStart(2, '0');
    return `${d}.${m}.${year}`;
};

const generateInitialUnitMap = (defaultValue) => {
    return Object.keys(UNITS_CONFIG.types).reduce((acc, type) => {
        acc[type] = defaultValue;
        return acc;
    }, {});
};

const formatGold = (num) => {
    const n = parseFloat(num);
    if (isNaN(n) || n <= 0) return '0';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.floor(n).toString();
};

const DEFAULT_STATE = {
    gold: 200, 
    clickPower: 1,
    inventory: [],
    market: { systemSlots: [], playerSlots: [] },
    army: generateInitialUnitMap(0),
    reserve: generateInitialUnitMap(0),
    unitTech: generateInitialUnitMap(1),
    stage: 1,
    taxRate: 50,
    population: 100,
    daysPassed: 0, 
    buildings: {
        harbour: false, 
        harbourLevel: 0,
        forge: false,
        forgeLevel: 0,
        goldmine: false,
        goldmineLevel: 0,
        lumbercamp: false,
        lumbercampLevel: 0,
        ricefield: false,
        ricefieldLevel: 0
    },
};

export const state = {
    data: { ...DEFAULT_STATE },

    init() {
        const saved = db.load(); 
        if (saved) { this.data = { ...DEFAULT_STATE, ...saved }; }
        
        if (window.socketService?.ws?.readyState === WebSocket.OPEN) {
            window.socketService.authenticate();
        } else {
            console.log("[СТЭЙТ] Сокет еще закрыт, ждем onopen...");
        }
        this.updateUI();
    },

addGold(amount) {
    window.socketService.send('CLIENT_ADD_GOLD', { amount });
},

    getUnitCost(type) {
        const cfg = UNITS_CONFIG.types[type];
        if (!cfg) return 0;
        const currentCount = (this.data.reserve?.[type] || 0) + (this.data.army?.[type] || 0);
        return Math.floor(cfg.baseCost * Math.pow(cfg.multiplier, currentCount));
    },

    buyUnit(type) {
        const lockStatus = this.checkUnitUnlock(type);
        if (!lockStatus.unlocked) return alert(`Найма нет! ${lockStatus.reason}`);

        const cost = this.getUnitCost(type);
        if (this.data.gold < cost) return alert("Недостаточно золота для найма!");

        window.socketService.send('CLIENT_BUY_UNIT', { 
            type: type, 
            cost: cost 
        });
    },

    upgradeUnitTech(type) {
        const currentLevel = this.data.unitTech[type] || 1;
        if (UNITS_CONFIG.maxTechLevel && currentLevel >= UNITS_CONFIG.maxTechLevel) {
            return alert("Достигнут максимальный уровень технологии!");
        }

        const cfg = UNITS_CONFIG.types[type];
        let buildingId = 'sword_dojo';
        if (cfg.tags.includes('siege')) buildingId = 'forge';
        else if (cfg.tags.includes('elite') && !cfg.tags.includes('cavalry')) buildingId = 'jujutsu_dojo';
        else if (cfg.tags.includes('monk')) buildingId = 'temple';
        else if (cfg.tags.includes('ninja')) buildingId = 'ninjutsu_dojo';
        else if (cfg.tags.includes('cavalry')) buildingId = 'stable';
        else if (cfg.tags.includes('bow') || cfg.tags.includes('matchclock')) buildingId = 'archer_dojo';

        const buildingLvl = this.data.buildings[`${buildingId}Level`] || 0;
        const maxAllowedLevel = buildingLvl * 5;

        if (currentLevel >= maxAllowedLevel) {
            return alert(`Лимит технологий! Улучши здание [${BUILDINGS_CONFIG[buildingId].name}] чтобы поднять ранг выше ${maxAllowedLevel}.`);
        }

        const cost = currentLevel * 1500;
        if (this.data.gold < cost) return alert("Недостаточно золота для технологического апгрейда!");

        window.socketService.send('CLIENT_UPGRADE_TECH', { 
            type: type, 
            cost: cost 
        });
    },

    toggleUnitToArmy(type, isDeploy) {
        const totalActive = Object.values(this.data.army).reduce((sum, count) => sum + count, 0);
        const inReserve = this.data.reserve[type] || 0;
        const inArmy = this.data.army[type] || 0;

        if (isDeploy) {
            if (totalActive >= 10) return alert("Лимит активного отряда!");
            if (inReserve <= 0) return alert("В резерве нет свободных юнитов!");
        } else {
            if (inArmy <= 0) return;
        }

        window.socketService.send('CLIENT_TOGGLE_UNIT', { 
            type: type, 
            isDeploy: isDeploy 
        });
    },

    getBuildingDiscount() {
        const campLvl = this.data.buildings?.lumbercampLevel || 0;
        const discount = campLvl * 0.05; 
        return Math.max(0.5, 1.0 - discount);
    },

    getBuildingCost(id) {
        const cfg = BUILDINGS_CONFIG[id];
        const isOwned = this.data.buildings[id];
        const currentLvl = this.data.buildings[`${id}Level`] || 0;
        
        const targetLvl = isOwned ? currentLvl : 1;
        const rawCost = Math.floor(cfg.baseCost * Math.pow(cfg.costMultiplier, targetLvl - 1));
        
        if (id === 'lumbercamp') return rawCost;
        return Math.floor(rawCost * this.getBuildingDiscount());
    },
    
    getHarbourTimeMultiplier() {
        const harbourLvl = this.data.buildings?.harbourLevel || 0;
        return Math.pow(0.92, harbourLvl); 
    },

    getHarbourPriceMultiplier() {
        const harbourLvl = this.data.buildings?.harbourLevel || 0;
        return Math.max(0.70, 1.0 - (harbourLvl * 0.03));
    },

    upgradeBuilding(id) {
        const isOwned = this.data.buildings[id];
        const currentLvl = this.data.buildings[`${id}Level`] || 0;
        if (isOwned && currentLvl >= 10) return alert("Максимальный уровень!");
        
        const cost = this.getBuildingCost(id);
        if (this.data.gold < cost) return alert("Недостаточно золота!");

        window.socketService.send('CLIENT_BUY_BUILDING', { buildingId: id, cost: cost });
    },

    clearActiveArmy() {
        window.socketService.send('CLIENT_CLEAR_ARMY', {});
    },

    getItemInflationMultiplier(itemType) {
        if (!this.data.market || !this.data.market.playerSlots) return 1.0;
        const sameTypeCount = this.data.market.playerSlots.filter(slot => slot.item && slot.item.type === itemType).length;
        const discount = sameTypeCount * 0.05;
        return Math.max(0.10, 1.0 - discount);
    },

    calculateCurrentPrice(item) {
        const multiplier = this.getItemInflationMultiplier(item.type);
        return Math.floor(item.basePrice * multiplier);
    },
    
    getMaxPopulation() {
        const riceLvl = this.data.buildings?.ricefieldLevel || 0;
        return 1000000 + (riceLvl * 1400000);
    },

    Craft() {
    const techLevel = this.data.buildings?.forgeLevel || 1;
    const cost = forge.getCost(techLevel);
    
    if (this.data.gold < cost) return alert("Недостаточно золота для крафта!");

    // ИСПРАВЛЕНО: Генерируем предмет через кузницу на клиенте
    const generatedItem = forge.rollWeapon(techLevel);

    // Передаем готовый объект на сервер
    window.socketService.send('CLIENT_CRAFT_WEAPON', { 
        techLevel: techLevel,
        item: generatedItem 
    });
},


    checkUnitUnlock(type) {
        const cfg = UNITS_CONFIG.types[type];
        if (!cfg) return { unlocked: false, reason: "Неизвестный юнит" };

        const tags = cfg.tags;
        const b = this.data.buildings;

        if (tags.includes('siege')) {
            if (!b.forge || (b.forgeLevel < 5)) {
                return { unlocked: false, reason: "Требуется КУЗНИЦА СЁГУНАТА 5 уровня!" };
            }
        }
        if (tags.includes('elite') && !tags.includes('cavalry')) {
            if (!b.jujutsu_dojo) return { unlocked: false, reason: "Требуется ШКОЛА ДЗЮДЗЮЦУ!" };
        }
        if (tags.includes('monk')) {
            if (!b.temple) return { unlocked: false, reason: "Требуется МОНАСТЫРЬ СОХЕЕВ!" };
        }
        if (tags.includes('ninja')) {
            if (!b.ninjutsu_dojo) return { unlocked: false, reason: "Требуется СКРЫТОЕ ДОДЗЁ НИНДЗЯ!" };
        }
        if (tags.includes('cavalry')) {
            if (!b.stable) return { unlocked: false, reason: "Требуются ВОЕННЫЕ КОНЮШНИ!" };
        }
        if (tags.includes('matchclock')) {
            if (!b.archer_dojo || (b.archer_dojoLevel < 5)) {
                return { unlocked: false, reason: "Требуется ДОДЗЁ ЛУЧНИКОВ 5 уровня!" };
            }
        }
        if (tags.includes('bow')) {
            if (!b.archer_dojo) return { unlocked: false, reason: "Требуется ДОДЗЁ ЛУЧНИКОВ!" };
        }
        if (tags.includes('katana') || tags.includes('spear')) {
            if (!b.sword_dojo) return { unlocked: false, reason: "Требуется ШКОЛА КЕНДЗЮЦУ!" };
        }

        return { unlocked: true };
    },

        SellItemToMarket(id) {
        if (window.socketService && window.socketService.ws && window.socketService.ws.readyState === WebSocket.OPEN) {
            window.socketService.send('CLIENT_SELL_ITEM', { id: id });
        } else {
            console.error("[STATE] Ошибка продажи: Сокет закрыт или отсутствует.");
            alert("Ошибка: Соединение с сервером прервано. Обнови страницу.");
        }
    },

    BuySystemItem(index) {
        const slot = this.data.market.systemSlots[index];
        if (!slot || !slot.item) return;
        
        const price = Math.floor(slot.item.basePrice * 1.5 * this.getHarbourPriceMultiplier());
        if (this.data.gold < price) return alert("Недостаточно золота!");

        window.socketService.send('CLIENT_BUY_SYSTEM_ITEM', { index });
    },

    StartBattle(stage) {
        window.socketService.send('CLIENT_START_BATTLE', { stage });
    },

            StartCampaign() {
        const totalUnits = Object.values(this.data.army).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) return alert("Твоя армия пуста!");

        const currentStage = this.data.stage || 1;
        const container = document.getElementById('battle-container');
        const battleZone = document.querySelector('.battle-zone');
        
        if (battleZone && container) {
            battleZone.appendChild(container);
            container.style.display = 'block';
        }

        const meta = document.getElementById('duel-enemy-meta');
        if (meta) meta.style.display = 'none';

        // ГЕНЕРАЦИЯ АРМИИ БОТА: Жёсткий лимит 10 юнитов, рандомный пик
        const availableTypes = Object.keys(UNITS_CONFIG.types);
        const enemyArmyMap = {};
        
        for (let i = 0; i < 10; i++) {
            const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            enemyArmyMap[randomType] = (enemyArmyMap[randomType] || 0) + 1;
        }

        const enemyArmy = Object.entries(enemyArmyMap).map(([type, count]) => ({ type, count }));

        const playerArmy = Object.entries(this.data.army)
            .map(([type, count]) => ({ type, count }))
            .filter(u => u.count > 0);

        combatLogic.start(
            playerArmy,
            enemyArmy,
            'campaign',
            () => { 
                window.socketService.send('CLIENT_RESOLVE_CAMPAIGN', { win: true, stage: currentStage, mode: 'campaign' });
            },
            () => { 
                window.socketService.send('CLIENT_RESOLVE_CAMPAIGN', { win: false, stage: currentStage, mode: 'campaign' });
                this.clearActiveArmy();
                this.updateUI();
            }
        );
    },

    async startDuel() {
        const totalUnits = Object.values(this.data.army).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) return alert("У тебя нет армии!");

        const btn = document.getElementById('start-duel-btn');
        if (btn) btn.disabled = true;

        const duelMeta = document.getElementById('duel-enemy-meta');
        if (duelMeta) duelMeta.style.display = 'flex';
        
        const statusEl = document.getElementById('battle-status');
        document.getElementById('enemy-name').textContent = "Поиск...";
        statusEl.textContent = "Запрос к серверу...";

        try {
            const opponent = await leaderboardService.fetchOpponent();
            document.getElementById('enemy-name').textContent = opponent.name;
            statusEl.textContent = "Соперник найден! Дуэль начинается...";

            const playerArmy = Object.entries(this.data.army).map(([type, count]) => ({
                type, count
            })).filter(u => u.count > 0);

            const enemyArmy = Object.entries(opponent.army || {}).map(([type, count]) => ({
                type, count
            })).filter(u => u.count > 0);

            if (enemyArmy.length === 0) {
                enemyArmy.push({ type: Object.keys(UNITS_CONFIG.types)[0], count: 5 });
            }

            combatLogic.start(
                playerArmy,
                enemyArmy,
                'duel',
                () => {
                    const reward = 500;
                    this.addGold(reward);
                    statusEl.textContent = `Победа! Рейтинг и ${reward}💰`;
                    if (btn) btn.disabled = false;
                    leaderboardService.render();
                },
                () => {
                    statusEl.textContent = "Поражение! Отряд уничтожен.";
                    this.clearActiveArmy();
                    if (btn) btn.disabled = false;
                    this.updateUI();
                    db.save(this.data);
                    leaderboardService.render();
                }
            );
        } catch (err) {
            console.error(err);
            statusEl.textContent = "Ошибка сети.";
            if (btn) btn.disabled = false;
        }
    },

    calculateIncome() {
        const popIncome = this.data.population * 0.001 * (this.data.taxRate / 100);
        const mineLvl = this.data.buildings?.goldmineLevel || 0;
        const mineIncome = mineLvl * 5; 
        return popIncome + mineIncome;
    },

    calculatePopulationGrowth() {
        const tax = this.data.taxRate;
        const riceLvl = this.data.buildings?.ricefieldLevel || 0;
        const maxPop = this.getMaxPopulation();
        const currentPop = this.data.population;

        if (currentPop >= maxPop) return 0;

        const taxMultiplier = Math.max(0, 1 - (tax / 100));
        const spaceFactor = (maxPop - currentPop) / maxPop;
        const baseGrowthRate = Math.sqrt(currentPop) * 2;
        const riceBonus = riceLvl * 15;

        const finalGrowth = Math.floor((baseGrowthRate + riceBonus) * spaceFactor * taxMultiplier);
        return finalGrowth <= 0 && tax < 100 ? 1 : finalGrowth;
    },

    updateUI() {
        const income = this.calculateIncome();
        document.querySelectorAll('#gold-count').forEach(el => {
            const displayValue = formatGold(this.data.gold);
            el.innerHTML = income === 0 
                ? `${displayValue}` 
                : `${displayValue} <span style="font-size: 0.85rem; color: #00ff77; margin-left: 5px;">+${income < 1 ? income.toFixed(3) : formatGold(income)}/с</span>`;
        });

        const clickPowerEl = document.getElementById('click-power-val');
if (clickPowerEl) {
    const forgeLvl = this.data.buildings?.forgeLevel || 0; // ИСПРАВЛЕНО: Теперь 0, а не 1
    clickPowerEl.textContent = formatGold(1 + (forgeLvl * 5));
}

        const dateEl = document.getElementById('game-date');
        if (dateEl) {
            dateEl.textContent = formatSengokuDate(this.data.daysPassed || 0);
        }

        const maxPop = this.getMaxPopulation();
        const isMaxed = this.data.population >= maxPop;
        const popEl = document.getElementById('pop-count');
        if (popEl) {
            popEl.innerHTML = isMaxed ? `${formatGold(this.data.population)} <span style="color: #ff3333; font-size: 0.7rem;">MAX</span>` : formatGold(this.data.population);
        }
        
        const popGrowthEl = document.getElementById('pop-growth');
        if (popGrowthEl) {
            popGrowthEl.textContent = isMaxed ? `+0/день` : `+${formatGold(this.calculatePopulationGrowth())}/день`;
            popGrowthEl.style.color = isMaxed ? '#666' : '';
        }
        
        const taxVal = document.getElementById('tax-val');
        if (taxVal) taxVal.textContent = this.data.taxRate;
        const taxSlider = document.getElementById('tax-slider');
        if (taxSlider) taxSlider.value = this.data.taxRate;

        const forgeCostEl = document.getElementById('forge-cost');
        if (forgeCostEl) {
    const flvl = this.data.buildings && this.data.buildings.forgeLevel ? this.data.buildings.forgeLevel : 1;
    forgeCostEl.textContent = forge.getCost(flvl);
}


        const combatStageEl = document.getElementById('combat-stage');
        if (combatStageEl) combatStageEl.textContent = `Этап ${this.data.stage || 1}`;
        
        const limitCounterEl = document.getElementById('army-limit-counter');
        if (limitCounterEl) limitCounterEl.textContent = Object.values(this.data.army || {}).reduce((sum, count) => sum + count, 0);

        if (typeof barracksLogic !== 'undefined') barracksLogic.render();
        this.renderInventory();
        this.renderMarket();
if (typeof barracksLogic !== 'undefined') {
    barracksLogic.data = this.data; 
    barracksLogic.render();
}
        this.checkBuildingAccess();
        
        if (window.leaderboardService?.updateLocalPlayerGold) {
            leaderboardService.updateLocalPlayerGold();
        }
    },
    
    syncWithServer(serverData) {
        if (!serverData) return;
        this.data = { ...this.data, ...serverData };
        if (typeof db !== 'undefined' && db.save) {
            db.save(this.data);
        }
        this.updateUI();
    },
    
    checkBuildingAccess() {
        const container = document.getElementById('buildings-container');
        if (!container) return;

        container.innerHTML = ''; 

        Object.keys(BUILDINGS_CONFIG).forEach(id => {
            const cfg = BUILDINGS_CONFIG[id];
            const isOwned = this.data.buildings[id];
            const lvl = this.data.buildings[`${id}Level`] || 0;
            const cost = this.getBuildingCost(id);

            const card = document.createElement('div');
            card.className = 'tech-card';
            
            let actionBtnHtml = '';
            if (!isOwned) {
                actionBtnHtml = `<button class="btn success b-action-btn" data-id="${id}">ПОСТРОИТЬ (${cost} 💰)</button>`;
            } else if (lvl >= 10) {
                actionBtnHtml = `<button class="btn secondary" disabled>МАКС. РАНГ (10/10)</button>`;
            } else {
                actionBtnHtml = `<button class="btn primary b-action-btn" data-id="${id}">УЛУЧШИТЬ ДО ЛВЛ ${lvl + 1} (${cost} 💰)</button>`;
            }

            card.innerHTML = `
                <div class="card-body">
                    <div class="card-icon-frame">
                        <img src="${cfg.icon}" alt="${cfg.name}" onerror="this.src='gold.png'">
                    </div>
                    <div class="card-info">
                        <div class="card-title">${cfg.name} <span class="lvl-badge">LVL ${lvl}</span></div>
                        <div class="card-desc">${cfg.desc}</div>
                    </div>
                </div>
                <div class="card-actions">
                    ${actionBtnHtml}
                </div>
            `;

            const btn = card.querySelector('.b-action-btn');
            if (btn) {
                btn.addEventListener('click', () => this.upgradeBuilding(id));
            }

            container.appendChild(card);
        });

        const isForgeOpened = this.data.buildings.forge;
        const locked = document.getElementById('forge-locked');
        const content = document.getElementById('forge-content');
        const forgeLvlEl = document.getElementById('forge-level-val');

        if (locked && content) {
            locked.style.display = isForgeOpened ? 'none' : 'block';
            content.style.display = isForgeOpened ? 'block' : 'none';
        }
        if (forgeLvlEl) {
            forgeLvlEl.textContent = this.data.buildings.forgeLevel || 1;
        }
    },

    renderInventory() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (this.data.inventory.length === 0) {
            grid.innerHTML = '<div style="color: #555; padding: 10px;">Склад пуст.</div>';
            return;
        }

        this.data.inventory.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';
            card.setAttribute('data-rarity', item.rarity);
            
            card.innerHTML = `
                <div class="item-name">${item.name}</div>
                <div class="item-stat">Цена: ${item.basePrice}💰</div>
                <button class="sell-btn btn danger" style="margin-top:10px;">Продать</button>
            `;
            
            card.querySelector('.sell-btn').addEventListener('click', () => this.SellItemToMarket(item.id));
            grid.appendChild(card);
        });
    },

    renderMarket() {
        const sysGrid = document.getElementById('market-system-grid');
        const playerGrid = document.getElementById('market-player-grid');
        if (!sysGrid || !playerGrid) return;

        sysGrid.innerHTML = '';
        playerGrid.innerHTML = '';

        this.data.market.systemSlots.forEach((slot, index) => {
            const card = document.createElement('div');
            card.className = 'item-card';

            if (slot.item) {
                const rawPrice = Math.floor(slot.item.basePrice * 1.5);
                const price = Math.floor(rawPrice * this.getHarbourPriceMultiplier());
                card.setAttribute('data-rarity', slot.item.rarity || 'common');
                card.innerHTML = `
                    <div class="item-name">${slot.item.name}</div>
                    <div class="item-stat">Цена: ${price}💰</div>
                    <button class="buy-btn btn success" style="margin-top:5px; padding:5px; font-size:0.85rem;">Купить</button>
                `;
                card.querySelector('.buy-btn').addEventListener('click', () => this.BuySystemItem(index));
            } else {
                card.setAttribute('data-rarity', 'empty');
                card.innerHTML = `
                    <div class="item-stat" style="padding: 15px; text-align:center; color:#555">
                        Поставка через: <br><b style="color: #ffd700">${slot.cooldown}с</b>
                    </div>
                `;
            }
            sysGrid.appendChild(card);
        });

        if (this.data.market.playerSlots.length === 0) {
            playerGrid.innerHTML = '<div style="color: #555; padding: 10px; width: 100%; text-align: center;">Твои лоты пусты.</div>';
        } else {
            this.data.market.playerSlots.forEach(slot => {
                const card = document.createElement('div');
                card.className = 'item-card';
                card.setAttribute('data-rarity', slot.item.rarity || 'common');
                
                card.innerHTML = `
                    <div class="item-name">${slot.item.name}</div>
                    <div class="item-stat">Цена: ${slot.price}💰</div>
                    <div class="item-stat" style="color: #ffd700">Выкуп через: ${slot.timeLeft}с</div>
                `;
                playerGrid.appendChild(card);
            });
        }
    }
};

window.state = state;
