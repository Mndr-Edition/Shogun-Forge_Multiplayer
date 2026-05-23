// === js/forge.js ===
export const RARITY_CONFIG = {
    common:    { weight: 60, mult: 1.0, color: '#888' },
    rare:      { weight: 25, mult: 2.5, color: '#1eff00' }, 
    epic:      { weight: 10, mult: 5.0, color: '#00c6ff' },
    legendary: { weight: 4,  mult: 10.0, color: '#ff55ff' },
    mythic:    { weight: 1,  mult: 20.0, color: '#ffaa00' }
};

export const GEAR_TYPES = [
    { name: 'Шлем',   baseValue: 5 },
    { name: 'Доспех', baseValue: 12 },
    { name: 'Катана', baseValue: 8 },
    { name: 'Яри',    baseValue: 10 },
    { name: 'Четки',  baseValue: 20 }
];

export const PREFIXES = ['Ржавый', 'Простой', 'Добротный', 'Мастерский', 'Императорский'];

export const forge = {
    getCost(techLevel = 1) {
        return Math.max(100, 350 - (techLevel - 1) * 25);
    },

    rollWeapon(techLevel = 1) {
        const selectedRarity = this._rollRarity(techLevel);
        const rConfig = RARITY_CONFIG[selectedRarity];
        const type = GEAR_TYPES[Math.floor(Math.random() * GEAR_TYPES.length)];
        const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
        
        return {
            id: `gear_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            name: `${prefix} ${type.name}`,
            rarity: selectedRarity,
            basePrice: Math.floor((type.baseValue * rConfig.mult) * 15),
            color: rConfig.color
        };
    },

    _rollRarity(techLevel) {
        const keys = Object.keys(RARITY_CONFIG);
        const bonus = (techLevel - 1) * 3;
        
        let total = 0;
        const currentWeights = {};
        
        keys.forEach(key => {
            let w = RARITY_CONFIG[key].weight;
            if (key === 'common') {
                w = Math.max(10, w - bonus);
            } else {
                w += bonus / (keys.length - 1);
            }
            currentWeights[key] = w;
            total += w;
        });

        let roll = Math.random() * total;
        for (const key of keys) {
            if (roll < currentWeights[key]) return key;
            roll -= currentWeights[key];
        }
        return 'common';
    }
};
