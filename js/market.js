import { forge } from './forge.js';

export const marketLogic = {
    tick(data) {
        if (!data.market) return false;
        let stateChanged = false;
        
        if (data.market.playerSlots && data.market.playerSlots.length > 0) {
            for (let i = data.market.playerSlots.length - 1; i >= 0; i--) {
                const slot = data.market.playerSlots[i];
                slot.timeLeft--;

                if (slot.timeLeft <= 0) {
                    data.gold += slot.price;
                    data.market.playerSlots.splice(i, 1);
                    stateChanged = true;
                } else {
                    stateChanged = true; 
                }
            }
        }

        if (data.market.systemSlots && data.market.systemSlots.length > 0) {
            data.market.systemSlots.forEach(slot => {
                if (!slot.item && slot.cooldown > 0) {
                    slot.cooldown--;
                    stateChanged = true;
                    
                    if (slot.cooldown <= 0) {
                        slot.item = forge.rollWeapon();
                    }
                }
            });
        }

        return stateChanged;
    }
};
