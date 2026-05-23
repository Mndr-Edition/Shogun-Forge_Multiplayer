import { state } from './state.js';
import { UNITS_CONFIG } from './units.js';

export const barracksLogic = {
    currentSearchQuery: "",
    selectedTag: null,
    isInitialized: false,

    init() {
        const screen = document.getElementById('screen-barracks');
        const container = document.getElementById('barracks-ui-container');
        if (!screen || !container) return;

        if (!document.getElementById('barracks-controls')) {
            const controls = document.createElement('div');
            controls.id = 'barracks-controls';
            controls.style = "background: #1a1a1a; padding: 12px; border-radius: 6px; margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px;";
            controls.innerHTML = `
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="barracks-search" placeholder="🔍 Поиск по названием или тегу..." style="flex: 1; background: #252525; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; font-size: 0.9rem;">
                </div>
                <div id="barracks-tags" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            `;
            container.parentNode.insertBefore(controls, container);
        }

        this.renderTags();
        
        const searchInput = document.getElementById('barracks-search');
        if (searchInput) {
            searchInput.value = this.currentSearchQuery;
            searchInput.oninput = (e) => {
                this.currentSearchQuery = e.target.value.toLowerCase().trim();
                state.updateUI(); // Вызываем централизованно через стейт
            };
        }

        this.isInitialized = true;
    },

    renderTags() {
        const tagContainer = document.getElementById('barracks-tags');
        if (!tagContainer) return;

        const allTags = [
            "infantry", "siege", "elite", "samurai", "ashigaru", 
            "cavalry", "spear", "katana", "bow", "ninja", 
            "monk", "matchclock", "ranged", "melee"
        ];

        tagContainer.innerHTML = allTags.map(tag => {
            const isSelected = this.selectedTag === tag;
            return `
                <span class="tag-pill" data-tag="${tag}" style="background: ${isSelected ? '#443a00' : '#333'}; color: ${isSelected ? '#fff' : '#aaa'}; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; user-select: none; border: 1px solid ${isSelected ? '#ffd700' : 'transparent'};">
                    #${tag}
                </span>
            `;
        }).join('');

        tagContainer.querySelectorAll('.tag-pill').forEach(pill => {
            pill.onclick = () => {
                const tag = pill.getAttribute('data-tag');
                this.selectedTag = this.selectedTag === tag ? null : tag;
                this.renderTags();
                state.updateUI();
            };
        });
    },

        render() {
        // Мягкий выход, если метод вызван до инициализации DOM-структуры стейтом
        if (!this.isInitialized) return;

        const container = document.getElementById('barracks-ui-container');
        if (!container) return;

        container.innerHTML = '';

        const searchWords = this.currentSearchQuery.split(/\s+/).filter(Boolean);

        Object.keys(UNITS_CONFIG.types).forEach(type => {
            const cfg = UNITS_CONFIG.types[type];
            
            // 1. Фильтр по зданиям (Фог оф вар для карточек)
            const lockStatus = state.checkUnitUnlock(type);
            if (!lockStatus.unlocked) return; // Скрываем карточку, если здание не построено / не прокачано

            // 2. Фильтр по поисковой строке
            const matchesSearch = searchWords.every(word => {
                const nameWords = cfg.name.toLowerCase().split(/\s+/);
                const matchesName = nameWords.some(w => w.startsWith(word));
                const matchesTags = cfg.tags.some(t => t.toLowerCase().startsWith(word));
                return matchesName || matchesTags;
            });
            
            // 3. Фильтр по выбранному тегу-табу
            const matchesTag = !this.selectedTag || cfg.tags.includes(this.selectedTag);

            if (!matchesSearch || !matchesTag) return;

            const techLevel = state.data.unitTech?.[type] || 1;
            const totalHired = state.data.reserve?.[type] || 0;
            const activeCount = state.data.army[type] || 0;

            const currentHp = cfg.baseHp + (techLevel - 1) * cfg.upgrade.hpStep;
            const currentDmg = cfg.baseDmg + (techLevel - 1) * cfg.upgrade.dmgStep;
            const hireCost = state.getUnitCost(type);
            const upgradeCost = techLevel * 1500;
            const isMaxTech = techLevel >= UNITS_CONFIG.maxTechLevel;

            const card = document.createElement('div');
            card.className = 'unit-barracks-card';
            card.style = "background: #222; border: 1px solid #333; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px; color: #fff;";

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${cfg.icon}" style="width: 40px; height: 40px; background: #111; border: 1px solid #444; border-radius: 4px; object-fit: cover;">
                        <div>
                            <strong style="font-size: 1rem; block-size: auto;">${cfg.name}</strong>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;">
                                ${cfg.tags.map(t => `<span style="font-size: 0.65rem; background: #2d2d2d; color: #00ff77; padding: 1px 4px; border-radius: 2px;">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 0.85rem; color: #aaa;">
                        <div>Резерв: <span style="color: #fff; font-weight: bold;">${totalHired}</span></div>
                        <div>Отряд: <span style="color: #00ff77; font-weight: bold;">${activeCount}</span></div>
                    </div>
                </div>

                <div style="background: #151515; padding: 6px 12px; border-radius: 4px; display: flex; justify-content: space-between; font-size: 0.85rem; border-left: 3px solid #ffd700;">
                    <div>❤️ HP: <span style="color: #ff4d4d; font-weight: bold;">${currentHp}</span></div>
                    <div>⚔️ DMG: <span style="color: #ffcc00; font-weight: bold;">${currentDmg}</span></div>
                    <div>⏱️ CD: <span style="color: #33ccff;">${cfg.cooldown}</span></div>
                    <div style="color: #ffd700;">Ранг: ${techLevel}/${UNITS_CONFIG.maxTechLevel}</div>
                </div>

                <div style="display: grid; grid-template-columns: 1.2fr 1.2fr 0.8fr; gap: 6px;">
                    <button class="btn success hire-trigger" style="padding: 6px; font-size: 0.8rem; cursor: pointer;">
                        Нанять <br> <span style="font-size: 0.75rem; color: #ffd700;">${hireCost}💰</span>
                    </button>
                    <button class="btn primary upgrade-trigger" ${isMaxTech ? 'disabled' : ''} style="padding: 6px; font-size: 0.8rem; cursor: ${isMaxTech ? 'not-allowed' : 'pointer'}; background: ${isMaxTech ? '#444' : ''};">
                        ${isMaxTech ? 'МАКС РАНГ' : `Апгрейд <br> <span style="font-size: 0.75rem; color: #ffd700;">${upgradeCost}💰</span>`}
                    </button>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn deploy-trigger" style="flex: 1; font-size: 1rem; background: #333; color: #fff; border: 1px solid #444; cursor: pointer;" title="В отряд">+</button>
                        <button class="btn withdraw-trigger" style="flex: 1; font-size: 1rem; background: #333; color: #fff; border: 1px solid #444; cursor: pointer;" title="В резерв">-</button>
                    </div>
                </div>
            `;

            card.querySelector('.hire-trigger').onclick = () => state.buyUnit(type);
            if (!isMaxTech) {
                card.querySelector('.upgrade-trigger').onclick = () => state.upgradeUnitTech(type);
            }
            card.querySelector('.deploy-trigger').onclick = () => state.toggleUnitToArmy(type, true);
            card.querySelector('.withdraw-trigger').onclick = () => state.toggleUnitToArmy(type, false);

            container.appendChild(card);
        });
    }
};
