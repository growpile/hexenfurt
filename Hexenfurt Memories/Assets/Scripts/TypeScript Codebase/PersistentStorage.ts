// Player progress storage: stats, the archive-seen set, and first-game flags.
// Exposed as global.persistentStorage.

type StatType = "int" | "float";

const STATS_SCHEMA: { [key: string]: StatType } = {
    vasesBroken: "int",
    bookstacksToppled: "int",
    doorsOpened: "int",
    puzzlesSolved: "int",
    fastestEscape: "float",
    notesCollected: "int",
    keysFound: "int",
    roundPlayed: "int",
    safesCracked: "int",
};

// Lore-ID aliases. Some hanging-lore prefabs still use "witch_note_*" ids while
// storage and debug-unlock use "note_*"; callers normalize through
// global.persistentStorage.normalizeLoreId.
const LORE_ID_ALIASES: { [legacy: string]: string } = {
    witch_note_1: "note_1",
    witch_note_2: "note_2",
};

const PS_PREFIX = "er_";
const KEY_LORE_SEEN = PS_PREFIX + "lore_seen_v1";
const KEY_ARCHIVE_OBJECTS_SEEN = PS_PREFIX + "archive_objects_seen_v1";
const KEY_STATS_PREFIX = PS_PREFIX + "stat_";
const KEY_FIRST_GAME_PLAYED = PS_PREFIX + "first_game_played";
const KEY_SETTINGS_MASTER_VOLUME = PS_PREFIX + "settings_master_volume_v1";
const KEY_SETTINGS_MASTER_VOLUME_SET = PS_PREFIX + "settings_master_volume_set_v1";
const KEY_SETTINGS_GLOVES_ENABLED = PS_PREFIX + "settings_gloves_enabled_v1";
const KEY_UNLOCK_ALL_PROGRESSION_SPAWNS = PS_PREFIX + "unlock_all_progression_spawns_v1";
// Per-category list of object ids spawned on the previous run, used by
// ProceduralRoom to bias the next run toward fresh objects/decos.
const KEY_LAST_SPAWN_PREFIX = PS_PREFIX + "last_spawn_";
// Which ground "variant" (table vs vase) spawned last run, so ProceduralRoom
// can alternate them session to session.
const KEY_LAST_SPAWN_GROUND_VARIANT = PS_PREFIX + "last_spawn_groundVariant_v1";

function makeVolatileStore(): HexenfurtKVStore {
    const mem: { [k: string]: any } = {};
    return {
        getInt: (k) => (mem[k] | 0) || 0,
        putInt: (k, v) => { mem[k] = v | 0; },
        getFloat: (k) => (typeof mem[k] === "number" ? mem[k] : 0.0),
        putFloat: (k, v) => { mem[k] = +v || 0.0; },
        getString: (k) => mem[k] || "",
        putString: (k, v) => { mem[k] = String(v); },
    };
}

@component
export class PersistentStorage extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Lore</span>")
    @input
    @hint("Master list of lore IDs known to this lens (used by `checkLoreItemsNotSeen`).")
    public loreIds: string[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Debug / Testing</span>")
    @input
    @hint("At lens start, mark every registered lore ID as seen (Lore Gallery + compendium).")
    public debugUnlockAllLore: boolean = false;

    @input
    @hint("At lens start, mark every archive catalog object ID as seen (Archive Gallery).")
    public debugUnlockAllArchive: boolean = false;

    @input
    @hint("At lens start, randomly mark ~half of registered lore IDs as seen (rest locked).")
    public debugRandomUnlockLore: boolean = false;

    @input
    @hint("At lens start, randomly mark ~half of registered archive object IDs as seen (rest locked).")
    public debugRandomUnlockArchive: boolean = false;

    @input
    @hint("At lens start, apply ~50/50 random seen/locked split to both lore and archive (same as enabling both random flags).")
    public debugRandomUnlockBoth: boolean = false;

    @input
    @hint("When on, Clock, Code Safe, and other progression-gated room objects can spawn immediately (ignores first-game / round gates).")
    public unlockAllProgressionSpawns: boolean = false;
    @ui.group_end

    private store!: HexenfurtKVStore;
    private loreSeenSet: { [id: string]: boolean } = {};
    private loreMaster: string[] = [];
    private archiveObjectSeenSet: { [id: string]: boolean } = {};
    private archiveObjectMaster: string[] = [];

    private normalizeId(id: string | null | undefined): string {
        return (id || "").trim();
    }

    /** Canonical lore-ID normalization (trim + alias). Shared by every system
     *  via `global.persistentStorage.normalizeLoreId`. */
    public normalizeLoreId(id: string | null | undefined): string {
        const normalized = this.normalizeId(id);
        if (!normalized) return "";
        return LORE_ID_ALIASES[normalized] || normalized;
    }

    onAwake(): void {
        const sys = (global as any).persistentStorageSystem;
        this.store = sys && sys.store ? sys.store : makeVolatileStore();
        if (!sys || !sys.store) {
            print("WARNING: PersistentStorageSystem.store not available. Using volatile fallback.");
        }

        this.loreMaster = Array.isArray(this.loreIds)
            ? this.loreIds.map((id) => this.normalizeLoreId(id)).filter((id) => !!id)
            : [];
        this.loreSeenSet = this.loadLoreSeenSet();
        this.archiveObjectSeenSet = this.loadArchiveObjectSeenSet();

        const api: HexenfurtPersistentStorage = {
            getStat: (n) => this.getStat(n),
            setStat: (n, v) => this.setStat(n, v),
            increaseStat: (n, amt) => this.increaseStat(n, amt),
            updateFastestEscapeIfBetter: (s) => this.updateFastestEscapeIfBetter(s),
            getAllStats: () => this.getAllStats(),
            hasPlayedFirstGame: () => this.hasPlayedFirstGame(),
            markFirstGamePlayed: () => this.markFirstGamePlayed(),
            registerLoreIds: (list) => this.registerLoreIds(list),
            normalizeLoreId: (id) => this.normalizeLoreId(id),
            addLoreSeen: (loreId) => this.addLoreSeen(loreId),
            hasSeenLore: (loreId) => this.hasSeenLore(loreId),
            getSeenLoreList: () => this.getSeenLoreList(),
            checkLoreItemsNotSeen: () => this.checkLoreItemsNotSeen(),
            resetAllLore: () => this.resetAllLore(),
            resetStats: () => this.resetStats(),
            registerArchiveObjectIds: (list) => this.registerArchiveObjectIds(list),
            addArchiveObjectSeen: (objectId) => this.addArchiveObjectSeen(objectId),
            hasSeenArchiveObject: (objectId) => this.hasSeenArchiveObject(objectId),
            getSeenArchiveObjectList: () => this.getSeenArchiveObjectList(),
            getMasterVolume: () => this.getMasterVolume(),
            setMasterVolume: (v) => this.setMasterVolume(v),
            getGlovesEnabled: () => this.getGlovesEnabled(),
            setGlovesEnabled: (v) => this.setGlovesEnabled(v),
            getUnlockAllProgressionSpawns: () => this.getUnlockAllProgressionSpawns(),
            setUnlockAllProgressionSpawns: (v) => this.setUnlockAllProgressionSpawns(v),
            getLastSpawnIds: (category) => this.getLastSpawnIds(category),
            setLastSpawnIds: (category, ids) => this.setLastSpawnIds(category, ids),
            getGroundVariantLastRun: () => this.getGroundVariantLastRun(),
            setGroundVariantLastRun: (v) => this.setGroundVariantLastRun(v),
            wipeLocalProgress: () => this.wipeLocalProgress(),
        };
        global.persistentStorage = api;

        this.setUnlockAllProgressionSpawns(this.unlockAllProgressionSpawns);

        this.createEvent("OnStartEvent").bind(() => {
            const defer = this.createEvent("DelayedCallbackEvent");
            defer.bind(() => this.applyDebugUnlocks());
            defer.reset(0.2);
        });
    }

    private applyDebugUnlocks(): void {
        const randomLore = this.debugRandomUnlockBoth || this.debugRandomUnlockLore;
        const randomArchive = this.debugRandomUnlockBoth || this.debugRandomUnlockArchive;

        if (this.debugUnlockAllLore) {
            for (let i = 0; i < this.loreMaster.length; i++) {
                this.addLoreSeen(this.loreMaster[i]);
            }
            print("[PersistentStorage] Debug: unlocked all lore (" + this.loreMaster.length + " ids).");
        } else if (randomLore) {
            const counts = this.applyRandomLoreUnlocks();
            print(
                "[PersistentStorage] Debug: random lore unlock " +
                    counts.seen +
                    "/" +
                    counts.total +
                    " seen (~50/50)."
            );
        }

        if (this.debugUnlockAllArchive) {
            for (let i = 0; i < this.archiveObjectMaster.length; i++) {
                this.addArchiveObjectSeen(this.archiveObjectMaster[i]);
            }
            print(
                "[PersistentStorage] Debug: unlocked all archive objects (" +
                    this.archiveObjectMaster.length +
                    " ids)."
            );
        } else if (randomArchive) {
            const counts = this.applyRandomArchiveUnlocks();
            print(
                "[PersistentStorage] Debug: random archive unlock " +
                    counts.seen +
                    "/" +
                    counts.total +
                    " seen (~50/50)."
            );
        }
    }

    /** Fisher–Yates shuffle (in-place copy). */
    private shuffleIds(ids: string[]): string[] {
        const copy = ids.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    /**
     * Resets seen state for master lore IDs, then marks ~50% as seen (rounded).
     * @returns seen and total counts after apply.
     */
    private applyRandomLoreUnlocks(): { seen: number; total: number } {
        const ids = this.loreMaster;
        if (!ids.length) {
            return { seen: 0, total: 0 };
        }

        for (let i = 0; i < ids.length; i++) {
            delete this.loreSeenSet[ids[i]];
        }

        const shuffled = this.shuffleIds(ids);
        const unlockCount = Math.round(shuffled.length * 0.5);
        for (let i = 0; i < unlockCount; i++) {
            this.loreSeenSet[shuffled[i]] = true;
        }
        this.saveLoreSeenSet();
        return { seen: unlockCount, total: shuffled.length };
    }

    /**
     * Resets seen state for master archive IDs, then marks ~50% as seen (rounded).
     * @returns seen and total counts after apply.
     */
    private applyRandomArchiveUnlocks(): { seen: number; total: number } {
        const ids = this.archiveObjectMaster;
        if (!ids.length) {
            return { seen: 0, total: 0 };
        }

        for (let i = 0; i < ids.length; i++) {
            delete this.archiveObjectSeenSet[ids[i]];
        }

        const shuffled = this.shuffleIds(ids);
        const unlockCount = Math.round(shuffled.length * 0.5);
        for (let i = 0; i < unlockCount; i++) {
            this.archiveObjectSeenSet[shuffled[i]] = true;
        }
        this.saveArchiveObjectSeenSet();
        return { seen: unlockCount, total: shuffled.length };
    }

    private mergeIdLists(existing: string[], incoming: string[], normalizer?: (id: string | null | undefined) => string): string[] {
        const norm = normalizer || ((id: string | null | undefined) => this.normalizeId(id));
        const set: { [id: string]: boolean } = {};
        for (let i = 0; i < existing.length; i++) {
            const id = norm(existing[i]);
            if (id) set[id] = true;
        }
        for (let i = 0; i < incoming.length; i++) {
            const id = norm(incoming[i]);
            if (id) set[id] = true;
        }
        return Object.keys(set);
    }

    private getStatKey(name: string): string { return KEY_STATS_PREFIX + name; }
    private getStatType(name: string): StatType | undefined { return STATS_SCHEMA[name]; }

    private loadLoreSeenSet(): { [id: string]: boolean } {
        const raw = this.store.getString(KEY_LORE_SEEN);
        if (!raw) return {};
        try {
            const arr: string[] = JSON.parse(raw);
            const out: { [id: string]: boolean } = {};
            for (let i = 0; i < arr.length; i++) out[arr[i]] = true;
            return out;
        } catch (e) {
            print("PersistentStorage: Failed to parse lore seen JSON, resetting.");
            return {};
        }
    }

    private saveLoreSeenSet(): void {
        const list = Object.keys(this.loreSeenSet);
        this.store.putString(KEY_LORE_SEEN, JSON.stringify(list));
    }

    private loadArchiveObjectSeenSet(): { [id: string]: boolean } {
        const raw = this.store.getString(KEY_ARCHIVE_OBJECTS_SEEN);
        if (!raw) return {};
        try {
            const arr: string[] = JSON.parse(raw);
            const out: { [id: string]: boolean } = {};
            for (let i = 0; i < arr.length; i++) out[arr[i]] = true;
            // Legacy id from escape-door spawn; archive catalog uses "door".
            if (out["escapeDoor"] && !out["door"]) out["door"] = true;
            delete out["escapeDoor"];
            return out;
        } catch (e) {
            print("PersistentStorage: Failed to parse archive objects seen JSON, resetting.");
            return {};
        }
    }

    private saveArchiveObjectSeenSet(): void {
        const list = Object.keys(this.archiveObjectSeenSet);
        this.store.putString(KEY_ARCHIVE_OBJECTS_SEEN, JSON.stringify(list));
    }

    public getStat(name: string): number | null {
        const t = this.getStatType(name);
        if (!t) { print("Unknown stat: " + name); return null; }
        const key = this.getStatKey(name);
        return t === "int" ? this.store.getInt(key) : this.store.getFloat(key);
    }

    public setStat(name: string, value: number): void {
        const t = this.getStatType(name);
        if (!t) { print("Unknown stat: " + name); return; }
        const key = this.getStatKey(name);
        if (t === "int") this.store.putInt(key, Math.floor(+value || 0));
        else this.store.putFloat(key, +value || 0.0);
    }

    public increaseStat(name: string, amount?: number): number | null {
        const t = this.getStatType(name);
        if (!t) { print("Unknown stat: " + name); return null; }
        let delta = (amount === undefined) ? 1 : +amount;
        if (isNaN(delta)) delta = 0;

        const key = this.getStatKey(name);
        let cur = t === "int" ? this.store.getInt(key) : this.store.getFloat(key);
        if (typeof cur !== "number") cur = 0;

        let next = cur + delta;
        if (t === "int") next = Math.floor(next);

        if (t === "int") this.store.putInt(key, next);
        else this.store.putFloat(key, next);
        return next;
    }

    public updateFastestEscapeIfBetter(seconds: number): number {
        const key = this.getStatKey("fastestEscape");
        const cur = this.store.getFloat(key);
        if (cur <= 0 || (seconds > 0 && seconds < cur)) {
            this.store.putFloat(key, seconds);
            return seconds;
        }
        return cur;
    }

    public getAllStats(): { [key: string]: number } {
        const out: { [key: string]: number } = {};
        for (const k in STATS_SCHEMA) {
            out[k] = this.getStat(k) ?? 0;
        }
        return out;
    }

    public hasPlayedFirstGame(): boolean {
        return this.store.getInt(KEY_FIRST_GAME_PLAYED) === 1;
    }

    public markFirstGamePlayed(): void {
        this.store.putInt(KEY_FIRST_GAME_PLAYED, 1);
    }

    public registerLoreIds(list: string[]): void {
        if (Array.isArray(list) && list.length) {
            this.loreMaster = this.mergeIdLists(this.loreMaster, list, (id) => this.normalizeLoreId(id));
        }
    }

    public addLoreSeen(loreId: string): boolean {
        const id = this.normalizeLoreId(loreId);
        if (!id) return false;
        if (!this.loreSeenSet[id]) {
            this.loreSeenSet[id] = true;
            this.saveLoreSeenSet();
            return true;
        }
        return false;
    }

    public hasSeenLore(loreId: string): boolean {
        const id = this.normalizeLoreId(loreId);
        return !!this.loreSeenSet[id];
    }

    public getSeenLoreList(): string[] {
        return Object.keys(this.loreSeenSet);
    }

    public checkLoreItemsNotSeen(): string[] {
        const notSeen: string[] = [];
        for (let i = 0; i < this.loreMaster.length; i++) {
            const id = this.loreMaster[i];
            if (!this.loreSeenSet[id]) notSeen.push(id);
        }
        return notSeen;
    }

    public resetAllLore(): void {
        this.loreSeenSet = {};
        this.saveLoreSeenSet();
    }

    public resetStats(): void {
        for (const k in STATS_SCHEMA) {
            this.setStat(k, 0);
        }
    }

    public registerArchiveObjectIds(list: string[]): void {
        if (Array.isArray(list) && list.length) {
            this.archiveObjectMaster = this.mergeIdLists(this.archiveObjectMaster, list);
        }
    }

    public addArchiveObjectSeen(objectId: string): boolean {
        const id = this.normalizeId(objectId);
        if (!id) return false;
        if (!this.archiveObjectSeenSet[id]) {
            this.archiveObjectSeenSet[id] = true;
            this.saveArchiveObjectSeenSet();
            return true;
        }
        return false;
    }

    public hasSeenArchiveObject(objectId: string): boolean {
        const id = this.normalizeId(objectId);
        return !!this.archiveObjectSeenSet[id];
    }

    public getSeenArchiveObjectList(): string[] {
        return Object.keys(this.archiveObjectSeenSet);
    }

    public getMasterVolume(): number {
        if (this.store.getInt(KEY_SETTINGS_MASTER_VOLUME_SET) !== 1) {
            return 1;
        }
        return Math.min(1, Math.max(0, this.store.getFloat(KEY_SETTINGS_MASTER_VOLUME)));
    }

    public setMasterVolume(volume: number): void {
        this.store.putInt(KEY_SETTINGS_MASTER_VOLUME_SET, 1);
        this.store.putFloat(KEY_SETTINGS_MASTER_VOLUME, Math.min(1, Math.max(0, +volume || 0)));
    }

    public getGlovesEnabled(): boolean {
        const raw = this.store.getString(KEY_SETTINGS_GLOVES_ENABLED);
        if (raw === "") {
            return true;
        }
        return this.store.getInt(KEY_SETTINGS_GLOVES_ENABLED) !== 0;
    }

    public setGlovesEnabled(enabled: boolean): void {
        this.store.putInt(KEY_SETTINGS_GLOVES_ENABLED, enabled ? 1 : 0);
    }

    /** Bypass ProceduralRoom first-game / round gates (Clock, Code Safe, etc.). */
    public getUnlockAllProgressionSpawns(): boolean {
        return this.store.getInt(KEY_UNLOCK_ALL_PROGRESSION_SPAWNS) !== 0;
    }

    public setUnlockAllProgressionSpawns(enabled: boolean): void {
        this.store.putInt(KEY_UNLOCK_ALL_PROGRESSION_SPAWNS, enabled ? 1 : 0);
    }

    /** Ids of room objects / decos spawned on the previous run (per category),
     *  so ProceduralRoom can prefer different ones this run. Returns [] if none. */
    public getLastSpawnIds(category: string): string[] {
        const cat = this.normalizeId(category);
        if (!cat) return [];
        const raw = this.store.getString(KEY_LAST_SPAWN_PREFIX + cat);
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            return arr.filter((x: unknown) => typeof x === "string" && !!x);
        } catch (e) {
            return [];
        }
    }

    public setLastSpawnIds(category: string, ids: string[]): void {
        const cat = this.normalizeId(category);
        if (!cat) return;
        const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && !!x) : [];
        this.store.putString(KEY_LAST_SPAWN_PREFIX + cat, JSON.stringify(list));
    }

    /** Which ground room-object family ("table" | "vase") spawned last run, so
     *  ProceduralRoom can alternate them each session. "" if neither yet. */
    public getGroundVariantLastRun(): string {
        return this.store.getString(KEY_LAST_SPAWN_GROUND_VARIANT) || "";
    }

    public setGroundVariantLastRun(variant: string): void {
        this.store.putString(KEY_LAST_SPAWN_GROUND_VARIANT, this.normalizeId(variant));
    }

    /** Clears stats, lore/archive progress, and first-game flag. Keeps settings prefs. */
    public wipeLocalProgress(): void {
        this.resetStats();
        this.resetAllLore();
        this.archiveObjectSeenSet = {};
        this.saveArchiveObjectSeenSet();
        this.store.putInt(KEY_FIRST_GAME_PLAYED, 0);
        print("[PersistentStorage] Local game progress wiped.");
    }
}
