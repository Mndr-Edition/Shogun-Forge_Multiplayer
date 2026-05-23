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
    data: null,

    init() {
        this.data = db.load(DEFAULT_STATE);
        
        if (typeof this.data.taxRate !== 'number' || isNaN(this.data.taxRate)) this.data.taxRate = 50;
        if (typeof this.data.population !== 'number' || isNaN(this.data.population)) this.data.population = 100;
        if (typeof this.data.gold !== 'number' || isNaN(this.data.gold)) this.data.gold = 200;
        
        if (!this.data.buildings) this.data.buildings = {};
        Object.keys(BUILDINGS_CONFIG).forEach(bId => {
            if (this.data.buildings[bId] === undefined) this.data.buildings[bId] = (bId === 'forge');
            if (this.data.buildings[`${bId}Level`] === undefined) this.data.buildings[`${bId}Level`] = (bId === 'forge' ? 1 : 0);
        });
        
        if (!this.data.army || Object.keys(this.data.army).length < Object.keys(UNITS_CONFIG.types).length) {
            this.data.army = generateInitialUnitMap(0);
        }
        if (!this.data.reserve || Object.keys(this.data.reserve).length < Object.keys(UNITS_CONFIG.types).length) {
            this.data.reserve = generateInitialUnitMap(0);
        }
        if (!this.data.unitTech || Object.keys(this.data.unitTech).length < Object.keys(UNITS_CONFIG.types).length) {
            this.data.unitTech = generateInitialUnitMap(1);
        }

        if (!this.data.market || !this.data.market.systemSlots || this.data.market.systemSlots.length !== 6 || this.data.market.systemSlots[0].cooldown === undefined) {
            this.data.market = {
                systemSlots: Array(6).fill(null).map(() => ({ item: forge.rollWeapon(), cooldown: 0 })),
                playerSlots: this.data.market?.playerSlots || []
            };
        }

        if (typeof barracksLogic.init === 'function') {
            barracksLogic.init();
        }
        this.updateUI();
    },

    addGold(amount) {
        this.data.gold += amount;
        this.updateUI();
        db.save(this.data);
    },

    getUnitCost(type) {
        const cfg = UNITS_CONFIG.types[type];
        if (!cfg) return 0;
        const currentCount = (this.data.reserve?.[type] || 0) + (this.data.army?.[type] || 0);
        return Math.floor(cfg.baseCost * Math.pow(cfg.multiplier, currentCount));
    },

        buyUnit(type) {
        // Проверка технологического лока по зданиям
        const lockStatus = this.checkUnitUnlock(type);
        if (!lockStatus.unlocked) return alert(`Найма нет! ${lockStatus.reason}`);

        const cost = this.getUnitCost(type);
        if (this.data.gold < cost) return alert("Недостаточно золота для найма!");

        this.data.gold -= cost;
        this.data.reserve[type] = (this.data.reserve[type] || 0) + 1;
        
        this.updateUI();
        db.save(this.data);
    },

    upgradeUnitTech(type) {
        const currentLevel = this.data.unitTech[type] || 1;
        if (UNITS_CONFIG.maxTechLevel && currentLevel >= UNITS_CONFIG.maxTechLevel) {
            return alert("Достигнут максимальный уровень технологии!");
        }

        // Вычисляем, какое здание контролирует этот тип юнита для проверки лимита ранга (+5 за лвл)
        const cfg = UNITS_CONFIG.types[type];
        let buildingId = 'sword_dojo'; // Дефолт
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

        this.data.gold -= cost;
        this.data.unitTech[type] = currentLevel + 1;

        this.updateUI();
        db.save(this.data);
    },

    
    toggleUnitToArmy(type, isDeploy) {
        const totalActive = Object.values(this.data.army).reduce((sum, count) => sum + count, 0);
        const inReserve = this.data.reserve[type] || 0;
        const inArmy = this.data.army[type] || 0;

        if (isDeploy) {
            if (totalActive >= 10) return alert("Лимит активного отряда!");
            if (inReserve <= 0) return alert("В резерве нет свободных юнитов!");

            this.data.reserve[type]--;
            this.data.army[type] = inArmy + 1;
        } else {
            if (inArmy <= 0) return;

            this.data.army[type]--;
            this.data.reserve[type] = inReserve + 1;
        }

        this.updateUI();
        db.save(this.data);
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
        
        if (isOwned && currentLvl >= 10) return alert("Достигнут максимальный 10 ранг постройки!");
        
        const cost = this.getBuildingCost(id);
        if (this.data.gold < cost) return alert("Недостаточно золота для строительства/улучшения!");

        this.data.gold -= cost;
        
        if (!isOwned) {
            this.data.buildings[id] = true;
            this.data.buildings[`${id}Level`] = 1;
        } else {
            this.data.buildings[`${id}Level`] = currentLvl + 1;
        }

        this.updateUI();
        db.save(this.data);
    },

    clearActiveArmy() {
        Object.keys(this.data.army).forEach(type => {
            this.data.army[type] = 0;
        });
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

        processTick() {
        this.data.daysPassed = (this.data.daysPassed || 0) + 1;
        
        // Кап популяции
        const maxPop = this.getMaxPopulation();
        this.data.population = Math.min(maxPop, this.data.population + this.calculatePopulationGrowth());
        
        this.data.gold += this.calculateIncome();

        if (this.data.market?.playerSlots && this.data.market.playerSlots.length > 3) {
            this.data.market.playerSlots.forEach(slot => {
                const minPrice = Math.floor(slot.item.basePrice * 0.10);
                if (slot.price > minPrice) {
                    slot.price = Math.max(minPrice, Math.floor(slot.price * 0.998));
                }
            });
        }

        marketLogic.tick(this.data);
        this.updateUI();
        db.save(this.data);
    },

    craft() {
        const techLevel = this.data.buildings?.forgeLevel || 1;
        const cost = forge.getCost(techLevel);
        if (this.data.gold < cost) return alert("Недостаточно золота для крафта!");

        this.data.gold -= cost;
        const weapon = forge.rollWeapon(techLevel);
        this.data.inventory.push(weapon);
        
        this.updateUI();
        db.save(this.data);
    },
    
        // Метод внутри объекта state {}
    checkUnitUnlock(type) {
        const cfg = UNITS_CONFIG.types[type];
        if (!cfg) return { unlocked: false, reason: "Неизвестный юнит" };

        const tags = cfg.tags;
        const b = this.data.buildings;

        // 1. Осада (Пушка, Мангонель) -> Требует Кузницу 5+ уровня
        if (tags.includes('siege')) {
            if (!b.forge || (b.forgeLevel < 5)) {
                return { unlocked: false, reason: "Требуется КУЗНИЦА СЁГУНАТА 5 уровня!" };
            }
        }
        // 2. Герои -> Требует Школу Дзюдзюцу
        if (tags.includes('elite') && !tags.includes('cavalry')) { // Исключаем конницу с тегом elite
            if (!b.jujutsu_dojo) return { unlocked: false, reason: "Требуется ШКОЛА ДЗЮДЗЮЦУ!" };
        }
        // 3. Монахи -> Монастырь
        if (tags.includes('monk')) {
            if (!b.temple) return { unlocked: false, reason: "Требуется МОНАСТЫРЬ СОХЕЕВ!" };
        }
        // 4. Ниндзя -> Додзё Ниндзя
        if (tags.includes('ninja')) {
            if (!b.ninjutsu_dojo) return { unlocked: false, reason: "Требуется СКРЫТОЕ ДОДЗЁ НИНДЗЯ!" };
        }
        // 5. Кавалерия -> Конюшни
        if (tags.includes('cavalry')) {
            if (!b.stable) return { unlocked: false, reason: "Требуются ВОЕННЫЕ КОНЮШНИ!" };
        }
        // 6. Огнестрел (Аркебузиры) -> Требует Додзё Лучников 5+ уровня
        if (tags.includes('matchclock')) {
            if (!b.archer_dojo || (b.archer_dojoLevel < 5)) {
                return { unlocked: false, reason: "Требуется ДОДЗЁ ЛУЧНИКОВ 5 уровня!" };
            }
        }
        // 7. Лучники -> Додзё Лучников
        if (tags.includes('bow')) {
            if (!b.archer_dojo) return { unlocked: false, reason: "Требуется ДОДЗЁ ЛУЧНИКОВ!" };
        }
        // 8. Базовые мечники / копейщики (Асигару/Самураи с катанами и копьями)
        if (tags.includes('katana') || tags.includes('spear')) {
            if (!b.sword_dojo) return { unlocked: false, reason: "Требуется ШКОЛА КЕНДЗЮЦУ!" };
        }

        return { unlocked: true };
    },

        sellItemToMarket(id) {
        const itemIdx = this.data.inventory.findIndex(i => i.id === id);
        if (itemIdx === -1) return;

        const item = this.data.inventory[itemIdx];
        const dynamicSalePrice = this.calculateCurrentPrice(item);
        
        // Модификация времени порта
        const baseTime = Math.floor(Math.random() * 240) + 30; 
        const timeToBuy = Math.floor(baseTime * this.getHarbourTimeMultiplier()); 

        const marketSlot = {
            item: { ...item, equipped: false },
            price: dynamicSalePrice, 
            timeLeft: timeToBuy
        };

        this.data.inventory.splice(itemIdx, 1);
        this.data.market.playerSlots.push(marketSlot);

        this.updateUI();
        db.save(this.data);
    },

        buySystemItem(index) {
        const slot = this.data.market.systemSlots[index];
        if (!slot || !slot.item) return;

        // Модификация цены покупки портом
        const rawPrice = Math.floor(slot.item.basePrice * 1.5);
        const currentSystemPrice = Math.floor(rawPrice * this.getHarbourPriceMultiplier());
        
        if (this.data.gold < currentSystemPrice) return alert("Недостаточно золота!");

        this.data.gold -= currentSystemPrice;
        this.data.inventory.push({ 
            ...slot.item, 
            id: `art_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` 
        });
        
        slot.item = null;
        
        // Модификация кулдауна обновления слота портом
        const baseCooldown = Math.floor(Math.random() * 90) + 30;
        slot.cooldown = Math.floor(baseCooldown * this.getHarbourTimeMultiplier());

        this.updateUI();
        db.save(this.data);
    },

    generateEnemyArmy(stage) {
        const enemyArmy = [];
        const pool = Object.keys(UNITS_CONFIG.types);
        const filteredPool = stage < 5 
            ? pool.filter(id => !UNITS_CONFIG.types[id].tags.includes('elite') && !UNITS_CONFIG.types[id].tags.includes('siege'))
            : pool;

        const maxEnemyCards = Math.min(10, 2 + Math.floor(stage * 0.6));
        let remainingSlots = maxEnemyCards;

        while (remainingSlots > 0) {
            const randomType = filteredPool[Math.floor(Math.random() * filteredPool.length)];
            const count = Math.min(remainingSlots, Math.ceil(Math.random() * 2));
            const existing = enemyArmy.find(u => u.type === randomType);
            if (existing) {
                existing.count += count;
            } else {
                enemyArmy.push({ type: randomType, count });
            }
            remainingSlots -= count;
        }
        return enemyArmy;
    },

            startCampaign() {
        const totalUnits = Object.values(this.data.army).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) return alert("Твоя армия пуста! Добавь воинов в отряд из резерва.");

        const btn = document.getElementById('start-campaign-btn');
        if (btn) btn.disabled = true;

        // Архитектурный фикс: Принудительно убираем мета-данные дуэли при входе в кампанию
        const duelMeta = document.getElementById('duel-enemy-meta');
        if (duelMeta) duelMeta.style.display = 'none';

        const statusEl = document.getElementById('battle-status');
        if (statusEl) statusEl.textContent = "Полки заняли позиции...";

        const playerArmy = Object.entries(this.data.army).map(([type, count]) => ({
            type, count
        })).filter(u => u.count > 0);

        const currentStage = this.data.stage || 1;
        const enemyArmy = this.generateEnemyArmy(currentStage);

        console.log("Плеер Армия:", playerArmy, "Враг Армия:", enemyArmy);

        combatLogic.start(
            playerArmy, 
            enemyArmy,
            'campaign',
            () => {
                const reward = currentStage * 250;
                this.addGold(reward); 
                this.data.stage++;
                db.save(this.data);
                if (statusEl) statusEl.textContent = `Победа! Награда: ${reward}💰`;
                if (btn) btn.disabled = false;
                this.updateUI();
            },
            () => {
                if (statusEl) statusEl.textContent = "Поражение! Отряд уничтожен.";
                this.clearActiveArmy();
                if (btn) btn.disabled = false;
                this.updateUI();
                db.save(this.data);
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

        // 1. Налоговый дебафф: при 100% налогах мультипликатор равен 0 (рост заблокирован)
        // При налогах > 70% начинается жесткое удушение рождаемости
        const taxMultiplier = Math.max(0, 1 - (tax / 100));

        // 2. Логистический коэффициент дефицита ресурсов (от 1.0 до 0.0)
        // Чем ближе популяция к капу рисового поля, тем ближе этот коэффициент к нулю
        const spaceFactor = (maxPop - currentPop) / maxPop;

        // 3. Динамическая базовая скорость. Берем корень, чтобы сбить экспоненту.
        // Вместо "процента от миллионов" получаем плавную кривую.
        const baseGrowthRate = Math.sqrt(currentPop) * 2;

        // 4. Бонус от рисовых полей дает фиксированный стабильный приток на старте эпохи
        const riceBonus = riceLvl * 15;

        // Итоговый расчет с затуханием
        const finalGrowth = Math.floor((baseGrowthRate + riceBonus) * spaceFactor * taxMultiplier);

        // Гарантируем хотя бы минимальный прирост в +1 человека, если налоги не 100%
        return finalGrowth <= 0 && tax < 100 ? 1 : finalGrowth;
    },

        updateUI() {
        const income = this.calculateIncome();
        const goldElements = document.querySelectorAll('#gold-count');
        
        goldElements.forEach(el => {
            const displayValue = formatGold(this.data.gold);
            if (income === 0) {
                el.innerHTML = `${displayValue}`;
            } else {
                const displayIncome = income < 1 ? income.toFixed(3) : formatGold(income);
                el.innerHTML = `${displayValue} <span style="font-size: 0.85rem; color: #00ff77; margin-left: 5px;">+${displayIncome}/с</span>`;
            }
        });

        // ДИНАМИЧЕСКИЙ ВЫВОД СИЛЫ КЛИКА В ЦЕНТРЕ
        const clickPowerEl = document.getElementById('click-power-val');
        if (clickPowerEl) {
            const forgeLvl = this.data.buildings?.forge ? (this.data.buildings.forgeLevel || 1) : 0;
            clickPowerEl.textContent = formatGold(1 + (forgeLvl * 5));
        }

        const dateEl = document.getElementById('game-date');
        if (dateEl) {
            dateEl.textContent = formatSengokuDate(this.data.daysPassed || 0);
            dateEl.style.display = 'block';
            dateEl.style.width = '100%';
            dateEl.style.textAlign = 'right';
        }

        const maxPop = this.getMaxPopulation();
        const isMaxed = this.data.population >= maxPop;

        const popEl = document.getElementById('pop-count');
        if (popEl) {
            const baseValue = formatGold(this.data.population);
            popEl.innerHTML = isMaxed 
                ? `${baseValue} <span style="font-size: 0.7rem; color: #ff3333; vertical-align: super; font-weight: bold; margin-left: 2px;">MAX</span>`
                : baseValue;
        }
        
        const popGrowthEl = document.getElementById('pop-growth');
        if (popGrowthEl) {
            if (isMaxed) {
                popGrowthEl.textContent = `+0/день`;
                popGrowthEl.style.color = '#666';
            } else {
                const currentGrowth = this.calculatePopulationGrowth();
                popGrowthEl.textContent = `+${formatGold(currentGrowth)}/день`;
                popGrowthEl.style.color = ''; 
            }
        }
        
        const taxVal = document.getElementById('tax-val');
        if (taxVal) taxVal.textContent = this.data.taxRate;
        
        const taxSlider = document.getElementById('tax-slider');
        if (taxSlider) taxSlider.value = this.data.taxRate;

        const forgeCostEl = document.getElementById('forge-cost');
        if (forgeCostEl) {
            forgeCostEl.textContent = forge.getCost(this.data.buildings?.forgeLevel || 1);
        }

        const combatStageEl = document.getElementById('combat-stage');
        if (combatStageEl) {
            combatStageEl.textContent = `Этап ${this.data.stage || 1}`;
        }
        
        const totalUnits = Object.values(this.data.army).reduce((sum, count) => sum + count, 0);
        const limitCounterEl = document.getElementById('army-limit-counter');
        if (limitCounterEl) {
            limitCounterEl.textContent = totalUnits;
        }

        barracksLogic.render();
        this.renderInventory();
        this.renderMarket();
        this.checkBuildingAccess();
        
        if (leaderboardService && typeof leaderboardService.updateLocalPlayerGold === 'function') {
            leaderboardService.updateLocalPlayerGold();
        }
    },
    
        // === Вставь это внутрь объекта state в js/state.js ===
    syncWithServer(serverData) {
        if (!serverData) return;
        
        // Жесткая синхронизация критических данных авторитарного сервера
        this.data.gold = serverData.gold;
        this.data.population = serverData.population;
        this.data.daysPassed = serverData.daysPassed;
        this.data.stage = serverData.stage;
        this.data.inventory = serverData.inventory || [];
        
        if (serverData.buildings) this.data.buildings = serverData.buildings;
        if (serverData.army) this.data.army = serverData.army;
        if (serverData.reserve) this.data.reserve = serverData.reserve;
        if (serverData.unitTech) this.data.unitTech = serverData.unitTech;
        if (serverData.market) this.data.market = serverData.market;
        
        // Прокидываем ID и имя, выданные сервером при регистрации сессии
        if (serverData.id) this.data.id = serverData.id;
        if (serverData.name) this.data.name = serverData.name;

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
            
            card.querySelector('.sell-btn').addEventListener('click', () => this.sellItemToMarket(item.id));
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
                card.querySelector('.buy-btn').addEventListener('click', () => this.buySystemItem(index));
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
