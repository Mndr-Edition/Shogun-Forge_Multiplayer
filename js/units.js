// === js/units.js ===

// Матрица модификаторов: [Атакующий Тег] -> { [Тег Цели]: Множитель }
const ICON_CDN = 'https://raw.githubusercontent.com/Mndr-Edition/Sprites/main/';

export const DAMAGE_MUTATORS = {
    ninja: {
        elite: 1.75 // Ниндзя срезают героев и элиту
    },
    spear: {
        cavalry: 2.0 // Копейщики контрят коней
    },
    matchclock: {
        samurai: 1.5,
        elite: 1.4 // Огнестрел пробивает тяжелую броню
    },
    bow: {
        infantry: 1.25,
        cavalry: 0.6 // Лучники эффективны по пехоте, но слабы против коней
    },
    siege: {
        infantry: 1.5,
        cavalry: 0.5 // Осада бьет по площадям пехоты, по коням мажет
    }
};

const RAW_UNITS = {
    ashigaru_bow: { name: "Асигару-лучник", icon: "ashigaru_bow.png", tags: ["ashigaru", "bow"], hp: 100, dmg: 25, cd: 100 },
    ashigaru_katana: { name: "Асигару с катаной", icon: "ashigaru_katana.png", tags: ["ashigaru", "katana"], hp: 120, dmg: 30, cd: 80 },
    ashigaru_matchlock: { name: "Асигару с аркебузой", icon: "ashigaru_matchlock.png", tags: ["ashigaru", "matchclock"], hp: 110, dmg: 45, cd: 150 },
    ashigaru_spear: { name: "Асигару с копьем", icon: "ashigaru_spear.png", tags: ["ashigaru", "spear"], hp: 140, dmg: 22, cd: 70 },
    
    samurai: { name: "Самурай с катаной", icon: "samurai.png", tags: ["samurai", "katana"], hp: 220, dmg: 45, cd: 70 },
    samurai_bow: { name: "Самурай-лучник", icon: "samurai_bow.png", tags: ["samurai", "bow"], hp: 180, dmg: 38, cd: 90 },
    samurai_matchlock: { name: "Самурай с ручницей", icon: "samurai_matchlock.png", tags: ["samurai", "matchclock"], hp: 200, dmg: 55, cd: 140 },
    nodachi_samurai: { name: "Самурай с нодати", icon: "nodachi_samurai.png", tags: ["samurai", "katana", "elite"], hp: 250, dmg: 65, cd: 95 },
    date_spear: { name: "Копейщик клана Датэ", icon: "date_spear.png", tags: ["samurai", "spear"], hp: 240, dmg: 40, cd: 75 },
    
    ninja: { name: "Ниндзя", icon: "ninja.png", tags: ["ninja", "katana"], hp: 130, dmg: 50, cd: 50 },
    ninja_elite: { name: "Элитный ниндзя", icon: "ninja_elite.png", tags: ["ninja", "katana", "elite"], hp: 180, dmg: 75, cd: 45 },
    
    monk_healer: { name: "Сохей-целитель", icon: "monk_healer.png", tags: ["monk"], hp: 150, dmg: 15, cd: 80 },
    monk_matchlock: { name: "Сохей с аркебузой", icon: "monk_matchlock.png", tags: ["monk", "matchclock"], hp: 160, dmg: 50, cd: 140 },
    monk_naginata: { name: "Сохей с нагинатой", icon: "monk_naginata.png", tags: ["monk", "spear"], hp: 210, dmg: 42, cd: 75 },
    monk_spear: { name: "Сохей с копьем", icon: "monk_spear.png", tags: ["monk", "spear"], hp: 200, dmg: 38, cd: 70 },
    
    fire_cavalry: { name: "Огненная кавалерия", icon: "fire_cavalry.png", tags: ["cavalry", "spear", "elite"], hp: 320, dmg: 55, cd: 85 },
    heavy_cavalry: { name: "Тяжелая кавалерия", icon: "heavy_cavalry.png", tags: ["cavalry", "spear"], hp: 350, dmg: 48, cd: 90 },
    light_cavalry: { name: "Легкая кавалерия", icon: "light_cavalry.png", tags: ["cavalry", "spear"], hp: 260, dmg: 35, cd: 60 },
    
    hero_bow: { name: "Герой-лучник", icon: "hero_bow.png", tags: ["elite", "bow"], hp: 400, dmg: 80, cd: 80 },
    hero_katana: { name: "Герой с катаной", icon: "hero_katana.png", tags: ["elite", "katana"], hp: 500, dmg: 110, cd: 60 },
    hero_spear: { name: "Герой с копьем", icon: "hero_spear.png", tags: ["elite", "spear"], hp: 480, dmg: 95, cd: 65 },
    hero_tetsubo: { name: "Герой с тэцубо", icon: "elite", tags: ["elite", "melee"], hp: 600, dmg: 130, cd: 110 },
    
    benkei_blades: { name: "Бэнкей (Мастер клинков)", icon: "benkei_blades.png", tags: ["elite", "katana"], hp: 550, dmg: 100, cd: 70 },
    tokitakas_tanegashima: { name: "Танегасима Токитаки", icon: "tokitakas_tanegashima.png", tags: ["elite", "matchclock"], hp: 420, dmg: 140, cd: 160 },
    
    naginata_samurai: { name: "Самурай с нагинатой", icon: "naginata_samurai.png", tags: ["samurai", "spear"], hp: 230, dmg: 38, cd: 75 },
    bomb: { name: "Бомбардир", icon: "bomb.png", tags: ["matchclock"], hp: 90, dmg: 90, cd: 180 },
    
    cannon: { name: "Пушка", icon: "cannon.png", tags: ["siege"], hp: 400, dmg: 250, cd: 250 },
    mangonel: { name: "Мангонель", icon: "mangonel.png", tags: ["siege"], hp: 300, dmg: 180, cd: 220 }
};

// Конвейер нормализации данных
export const UNITS_CONFIG = {
    maxTechLevel: 35,
    types: Object.entries(RAW_UNITS).reduce((acc, [id, data]) => {
        const tags = new Set(data.tags);
        
        // Автоматическое распределение Melee / Ranged
        if (tags.has("bow") || tags.has("matchclock") || tags.has("siege")) {
            tags.add("ranged");
        } else {
            tags.add("melee");
        }

        // Автоматическая разметка пехоты (все, кроме осады)
        if (!tags.has("siege")) {
            tags.add("infantry");
        }

        // Выдергиваем чистое имя файла, игнорируя старые префиксы папок
        const fileName = data.icon.split('/').pop();
        const fullUrl = `${ICON_CDN}${fileName}`;

        acc[id] = {
            name: data.name,
            icon: fullUrl, 
            baseCost: Math.floor(data.hp * 0.4 + data.dmg * 1.2),
            multiplier: 1.2,
            baseHp: data.hp,
            baseDmg: data.dmg,
            cooldown: data.cd,
            tags: Array.from(tags),
            upgrade: {
                hpStep: Math.ceil(data.hp * 0.1),
                dmgStep: Math.ceil(data.dmg * 0.1)
            }
        };
        return acc;
    }, {})
};

/**
 * Расчет кастомного мутатора урона между атакующим и целью.
 */
export function getDamageModifier(attackerId, targetId) {
    const attackerTags = UNITS_CONFIG.types[attackerId]?.tags || [];
    const targetTags = UNITS_CONFIG.types[targetId]?.tags || [];
    let maxModifier = 1.0;

    for (const aTag of attackerTags) {
        if (DAMAGE_MUTATORS[aTag]) {
            for (const tTag of targetTags) {
                if (DAMAGE_MUTATORS[aTag][tTag]) {
                    maxModifier = Math.max(maxModifier, DAMAGE_MUTATORS[aTag][tTag]);
                }
            }
        }
    }
    return maxModifier;
}
