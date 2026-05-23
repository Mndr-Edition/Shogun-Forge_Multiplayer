const STORAGE_KEY = 'forge_game_state_v1';

export const db = {
    save(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    load(defaultState) {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : defaultState;
    }
};
