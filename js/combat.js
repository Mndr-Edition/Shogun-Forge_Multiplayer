// === js/combat.js ===
import { UNITS_CONFIG, getDamageModifier } from './units.js';

const imageCache = {};
function getUnitImage(src) {
    if (imageCache[src]) return imageCache[src];
    const img = new Image();
    img.src = src;
    imageCache[src] = img;
    return img;
}

const CDN = 'https://raw.githubusercontent.com/Mndr-Edition/Sprites/main/';

const environmentSprites = {
    tile_dirt: new Image(),
    tile_water: new Image(),
    tile_winter: new Image()
};

environmentSprites.tile_dirt.src = `${CDN}%20tile_dirt.png`;
environmentSprites.tile_water.src = `${CDN}%20tile_water.png`;
environmentSprites.tile_winter.src = `${CDN}%20tile_winter.png`;


export const combatLogic = {
    canvas: null,
    ctx: null,
    entities: [],
    loopId: null,
    mode: null, 
    currentBiome: 'dirt',
    lastTime: 0,
    timeAccumulator: 0,
    SIMULATION_TICK_MS: 45, 
    isActive: false,
    
        initCanvas(mode) {
        const isDuel = (mode === 'duel');
        const canvasId = isDuel ? 'leaderboard-battle-canvas' : 'battle-canvas';
        const containerId = isDuel ? 'leaderboard-duel-container' : 'battle-container';

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        
        const container = document.getElementById(containerId);
        const targetWidth = this.canvas.clientWidth || (container ? container.clientWidth : 0) || 600;
        const targetHeight = this.canvas.clientHeight || (container ? container.clientHeight : 0) || 350;

        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;

        this.canvas.style.width = `${targetWidth}px`;
        this.canvas.style.height = `${targetHeight}px`;
    },


    stop() {
        this.isActive = false; // <-- Сбрасываем флаг
        if (this.loopId) {
            cancelAnimationFrame(this.loopId);
            this.loopId = null;
        }
        this.entities = [];
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

        start(playerArmy, enemyArmy, mode, onWin, onLose) {
        this.stop();
        this.isActive = true;
        this.mode = mode; // Сначала фиксируем режим

        // Динамически открываем нужный контейнер в зависимости от режима
        const containerId = (mode === 'duel') ? 'leaderboard-duel-container' : 'battle-container';
        const container = document.getElementById(containerId);
        if (container) container.style.display = 'block';

        // Передаем mode внутрь initCanvas, чтобы он выбрал правильный canvas
        this.initCanvas(mode); 
        if (!this.canvas || !this.ctx) {
            return console.error("Критическая ошибка: Canvas или Context 2D не инициализированы!");
        }

        this.canvas.style.display = 'block';
        
        const stage = (window.state && window.state.data) ? (window.state.data.stage || 1) : 1;
        
        // Переключение базовой подложки: либо грязь, либо зима
        if (stage % 2 === 1) {
            this.currentBiome = 'dirt';
        } else {
            this.currentBiome = 'winter';
        }

        this.buildDynamicGrid(playerArmy, 'player');
        this.buildDynamicGrid(enemyArmy, 'enemy');

        if (this.entities.length === 0) {
            console.error("Попытка начать бой с пустой матрицей сущностей!");
            onLose();
            return;
        }
        
        this.lastTime = performance.now();
        this.timeAccumulator = 0;
        this.loopId = true; 

        const tick = (now) => {
            if (!this.loopId) return;

            const dt = now - this.lastTime;
            this.lastTime = now;

            this.timeAccumulator += dt;
            while (this.timeAccumulator >= this.SIMULATION_TICK_MS) {
                this.updateSimulation(onWin, onLose);
                if (!this.loopId) return; 
                this.timeAccumulator -= this.SIMULATION_TICK_MS;
            }

            this.entities.forEach(unit => {
                unit.offsetX *= 0.85;
                unit.offsetY *= 0.85;
                if (unit.bloodAlpha > 0) unit.bloodAlpha -= 0.04;
                if (unit.healAlpha > 0) unit.healAlpha -= 0.04;
                unit.x = unit.baseX + unit.offsetX;
                unit.y = unit.baseY + unit.offsetY;
            });

            this.render();
            if (this.loopId) this.loopId = requestAnimationFrame(tick);
        };
        this.loopId = requestAnimationFrame(tick);
    },


        buildDynamicGrid(armyData, side) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const gap = 4; 
        const w = 32; 
        const h = 32;

        const currentStage = (window.state && window.state.data) ? (window.state.data.stage || 1) : 1;

        const flatArmy = [];
        armyData.forEach(g => {
            if (g && g.count && g.type) {
                for (let i = 0; i < g.count; i++) {
                    if (UNITS_CONFIG.types[g.type]) flatArmy.push(g.type);
                }
            }
        });

        const maxInRow = 5;
        // Фиксируем высоту сетки по максимальному ряду (до 5 юнитов), чтобы не было вертикального сдвига шеренг
        const gridRowsCount = Math.min(maxInRow, flatArmy.length || maxInRow);
        const fixedStartY = cy - ((gridRowsCount * h + (gridRowsCount - 1) * gap) / 2);

        flatArmy.forEach((type, i) => {
            const row = Math.floor(i / maxInRow); 
            const col = i % maxInRow;             
            
            // Абсолютное позиционирование в структуре 5х2
            let x = (side === 'player') 
                ? (cx - 50 - w) - row * (w + gap)
                : (cx + 50) + row * (w + gap);

            const y = fixedStartY + col * (h + gap);

            const cfg = UNITS_CONFIG.types[type];
            let finalHp = cfg.baseHp;
            let finalDmg = cfg.baseDmg;

            const hpStep = cfg.upgrade?.hpStep ? cfg.upgrade.hpStep : Math.ceil(cfg.baseHp * 0.1);
            const dmgStep = cfg.upgrade?.dmgStep ? cfg.upgrade.dmgStep : Math.ceil(cfg.baseDmg * 0.1);

            if (side === 'player') {
                const techLvl = (window.state && window.state.data && window.state.data.unitTech) ? (window.state.data.unitTech[type] || 1) : 1;
                finalHp += (techLvl - 1) * hpStep;
                finalDmg += (techLvl - 1) * dmgStep;
            } else if (side === 'enemy') {
                if (this.mode === 'campaign') {
                    // Прокачка бота в кампании: уровень технологий равен текущему этапу игры
                    finalHp += (currentStage - 1) * hpStep;
                    finalDmg += (currentStage - 1) * dmgStep;
                } else if (this.mode === 'duel') {
                    const maxStage = Math.min(currentStage || 1, UNITS_CONFIG.maxTechLevel || 35);
                    const mockTechLvl = Math.max(1, Math.floor(Math.random() * maxStage) + 1);
                    finalHp += (mockTechLvl - 1) * hpStep;
                    finalDmg += (mockTechLvl - 1) * dmgStep;
                }
            }

            if (isNaN(finalHp) || finalHp <= 0) finalHp = cfg.baseHp || 100;
            if (isNaN(finalDmg) || finalDmg <= 0) finalDmg = cfg.baseDmg || 10;

            this.entities.push({
                id: `${this.mode}_${side}_${type}_${Math.random()}`,
                side: side,
                type: type,
                baseX: x,
                baseY: y,
                x: x,
                y: y,
                hp: finalHp,
                maxHp: finalHp,
                dmg: finalDmg,
                icon: cfg.icon,
                cooldown: Math.floor(Math.random() * cfg.cooldown),
                maxCooldown: cfg.cooldown,
                offsetX: 0,
                offsetY: 0,
                bloodAlpha: 0,
                healAlpha: 0
            });
        });
    },


    updateSimulation(onWin, onLose) {
        const playersAlive = this.entities.some(e => e.side === 'player' && e.hp > 0);
        const enemiesAlive = this.entities.some(e => e.side === 'enemy' && e.hp > 0);

        if (!playersAlive) { this.stop(); onLose(); return; }
        if (!enemiesAlive) { this.stop(); onWin(); return; }

        this.entities.forEach(unit => {
            if (unit.cooldown <= 0) {
                if (unit.type === 'monk_healer') {
                    // ЛОГИКА ИСЦЕЛЕНИЯ: Цель — союзник с минимальным относительным здоровьем
                    const allies = this.entities.filter(e => e.side === unit.side && e.hp > 0);
                    if (allies.length > 0) {
                        const target = allies.reduce((min, current) => 
                            (current.hp / current.maxHp < min.hp / min.maxHp) ? current : min, allies[0]
                        );

                        const dx = target.baseX - unit.baseX;
                        const dy = target.baseY - unit.baseY;
                        const dist = Math.hypot(dx, dy) || 1;

                        unit.offsetX = (dx / dist) * 12;
                        unit.offsetY = (dy / dist) * 12;

                        // Накатываем хил (величина хила равна базовому dmg монаха)
                        target.hp = Math.min(target.maxHp, target.hp + unit.dmg);
                        target.healAlpha = 1.0;
                    }
                } else {
                    // ЛОГИКА АТАККИ
                    const targets = this.entities.filter(e => e.side !== unit.side && e.hp > 0);
                    if (targets.length > 0) {
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        
                        const dx = target.baseX - unit.baseX;
                        const dy = target.baseY - unit.baseY;
                        const dist = Math.hypot(dx, dy) || 1;

                        unit.offsetX = (dx / dist) * 18;
                        unit.offsetY = (dy / dist) * 18;

                        target.offsetX = (dx / dist) * 5;
                        target.offsetY = (dy / dist) * 5;
                        target.bloodAlpha = 1.0;

                        const mod = getDamageModifier(unit.type, target.type);
                        target.hp -= Math.floor(unit.dmg * mod);
                    }
                }
                unit.cooldown = unit.maxCooldown;
            } else {
                unit.cooldown--;
            }
        });

        this.entities = this.entities.filter(e => e.hp > 0);
    },

    render() {
        if (!this.ctx || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Статичный фоллбек цвета фона
        this.ctx.fillStyle = this.currentBiome === 'winter' ? '#f2f5f8' : '#557a2b'; 
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const tileSize = 64;
        const activeTile = environmentSprites[`tile_${this.currentBiome}`];

        // Рендерим базовую сетку земли или снега
        if (activeTile && activeTile.complete && activeTile.naturalWidth > 0) {
            for (let x = 0; x < this.canvas.width; x += tileSize) {
                for (let y = 0; y < this.canvas.height; y += tileSize) {
                    this.ctx.drawImage(activeTile, x, y, tileSize, tileSize);
                }
            }
        }

        // РЕКА: Если этап кратен 3, пускаем вертикальную реку строго по центру холста
        const stage = (window.state && window.state.data) ? (window.state.data.stage || 1) : 1;
        if (stage % 3 === 0) {
            const waterTile = environmentSprites.tile_water;
            if (waterTile && waterTile.complete && waterTile.naturalWidth > 0) {
                const centerX = Math.floor(this.canvas.width / 2) - 32;
                for (let y = 0; y < this.canvas.height; y += tileSize) {
                    this.ctx.drawImage(waterTile, centerX, y, tileSize, tileSize);
                }
            }
        }

        const w = 32;
        const h = 32;

        this.entities.forEach(unit => {
            this.ctx.save();
            
            const img = getUnitImage(unit.icon);
            if (img && img.complete && img.naturalWidth > 0) {
                this.ctx.drawImage(img, unit.x, unit.y, w, h);
            } else {
                this.ctx.fillStyle = unit.side === 'player' ? '#00ff77' : '#ff3333';
                this.ctx.fillRect(unit.x, unit.y, w, h);
            }

            this.ctx.strokeStyle = unit.side === 'player' ? '#00ff77' : '#ff4d4d';
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(unit.x, unit.y, w, h);

            // Слой дамага (Красный всплеск)
            if (unit.bloodAlpha > 0) {
                this.ctx.fillStyle = `rgba(220, 0, 0, ${unit.bloodAlpha * 0.5})`;
                this.ctx.fillRect(unit.x, unit.y, w, h);
            }

            // Слой хила (Зеленый всплеск)
            if (unit.healAlpha > 0) {
                this.ctx.fillStyle = `rgba(0, 255, 119, ${unit.healAlpha * 0.5})`;
                this.ctx.fillRect(unit.x, unit.y, w, h);
            }

            const barY = unit.y + h - 3;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(unit.x + 2, barY, w - 4, 2);
            
            this.ctx.fillStyle = unit.side === 'player' ? '#00ff77' : '#ff3333';
            const hpRatio = Math.max(0, unit.hp / unit.maxHp);
            this.ctx.fillRect(unit.x + 2, barY, (w - 4) * hpRatio, 2);

            this.ctx.restore();
        });
    }
};
window.combatUI = {
    startDuelVisuals(payload) {
        combatLogic.start(
            payload.playerArmy, 
            payload.enemyArmy, 
            payload.mode, 
            // Callback победы:
            () => {
                alert(`Победа над ${payload.opponentName}!`);
                window.socketService.send('CLIENT_RESOLVE_CAMPAIGN', { 
                    win: true, 
                    stage: window.state.data.stage,
                    mode: payload.mode // <--- Сюда
                });
            },
            // Callback поражения:
            () => {
                alert("Поражение!");
                window.socketService.send('CLIENT_RESOLVE_CAMPAIGN', { 
                    win: false, 
                    stage: window.state.data.stage,
                    mode: payload.mode // <--- И сюда
                });
            }
        );
    }
};