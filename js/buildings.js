
const CDN = 'https://raw.githubusercontent.com/Mndr-Edition/Sprites/main/';
export const BUILDINGS_CONFIG = {


    forge: {
        id: 'forge',
        name: 'КУЗНИЦА СЁГУНАТА',
        icon: `${CDN}forge.png`,
        baseCost: 500,
        costMultiplier: 1.5,
        desc: 'Открывает артефакты. На Ранге 5 открывает Осадные орудия (Пушка, Мангонель).'
    },
    goldmine: {
        id: 'goldmine',
        name: 'ЗОЛОТАЯ ШАХТА',
        icon: `${CDN}goldmine.png`,
        baseCost: 300,
        costMultiplier: 1.6,
        desc: 'Генерирует пассивный доход в золото. Каждое улучшение увеличивает добычу.'
    },
    lumbercamp: {
        id: 'lumbercamp',
        name: 'ЛАГЕРЬ ЛЕСОРУБОВ',
        icon: `${CDN}lumbercamp.png`,
        baseCost: 400,
        costMultiplier: 1.5,
        desc: 'Снижает стоимость постройки и улучшения всех остальных зданий на 5% за уровень.'
    },
    harbour: {
        id: 'harbour',
        name: 'МОРСКОЙ ПОРТ',
        icon: `${CDN}harbour.png`,
        baseCost: 2000,
        costMultiplier: 1.7,
        desc: 'Ускоряет обновление системного рынка, ускоряет выкуп твоих лотов и снижает цены на товары.'
    },
    ricefield: {
        id: 'ricefield',
        name: 'РИСОВОЕ ПОЛЕ',
        icon: `${CDN}ricefield.png`,
        baseCost: 800,
        costMultiplier: 1.4,
        desc: 'Увеличивает базовый прирост населения империи.'
    },
    // --- НОВЫЕ КАЗАРМЫ / ДОДЗЁ ---
    archer_dojo: {
        id: 'archer_dojo',
        name: 'ДОДЗЁ ЛУЧНИКОВ',
        icon: `${CDN}archer_dojo.png`,
        baseCost: 700,
        costMultiplier: 1.5,
        desc: 'Открывает Лучников. На Ранге 5 открывает Аркебузиров (Matchlock).'
    },
    jujutsu_dojo: {
        id: 'jujutsu_dojo',
        name: 'ШКОЛА ДЗЮДЗЮЦУ',
        icon: `${CDN}jujutsu_dojo.png`,
        baseCost: 2500,
        costMultiplier: 1.8,
        desc: 'Открывает доступ к найму великих Героев (Elite).'
    },
    temple: {
        id: 'temple',
        name: 'МОНАСТЫРЬ СОХЕЕВ',
        icon: `${CDN}temple.png`,
        baseCost: 1400,
        costMultiplier: 1.5,
        desc: 'Открывает найм Воинствующих монахов (Сохэев).'
    },
    sword_dojo: {
        id: 'sword_dojo',
        name: 'ШКОЛА КЕНДЗЮЦУ',
        icon: `${CDN}sword_dojo.png`,
        baseCost: 500,
        costMultiplier: 1.4,
        desc: 'Открывает найм пехоты ближнего боя (Катаны и Копья).'
    },
    stable: {
        id: 'stable',
        name: 'ВОЕННЫЕ КОНЮШНИ',
        icon: `${CDN}stable.png`,
        baseCost: 800,
        costMultiplier: 1.6,
        desc: 'Открывает доступ к формированию отрядов Кавалерии.'
    },
    ninjutsu_dojo: {
        id: 'ninjutsu_dojo',
        name: 'СКРЫТОЕ ДОДЗЁ НИНДЗЯ',
        icon: `${CDN}ninjutsu_dojo.png`,
        baseCost: 1000,
        costMultiplier: 1.7,
        desc: 'Позволяет тренировать Синоби для тайных операций.'
    }
};
