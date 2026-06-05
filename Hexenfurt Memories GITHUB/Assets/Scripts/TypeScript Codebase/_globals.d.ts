// Ambient declarations for every global.* surface used across the Hexenfurt
// codebase. Declared once here so each TS file gets typed completions without
// redeclaring or importing.

export {};

/** A spawned surface anchor, as written by `WorldQueryManager`. */
declare global {
    interface HexenfurtSurfaceAnchor {
        surfaceType: "wall" | "ground" | "ceiling";
        position: vec3;
        normal?: vec3;
        yaw?: number;
        anchorObject?: SceneObject;
    }

    interface HexenfurtExitDoor {
        position: vec3;
        normal: vec3;
    }

    interface HexenfurtUtils {
        stateChangeArrayWithException(arr: { enabled: boolean }[], exceptionIndex: number, exceptionState: boolean): void;
        stateChangeArray(arr: { enabled: boolean }[], state: boolean): void;
        removeAllChildren(sceneObject: SceneObject | null | undefined): void;
        stateChangeArrayClassProperty(arr: any[], propName: string, state: boolean): void;
        rng(min: number, max: number): number;
        rngFloat(min: number, max: number, decimals: number): number;
        lerp(start: number, end: number, amt: number): number;
        arrayContains<T>(arr: T[], item: T): boolean;
        delay(delaySec: number, cb: () => void): void;
        delay(id: string, delaySec: number, cb: () => void): void;
        invalidateDelay(id: string): void;
        animatePosition(sceneObject: SceneObject, isLocal: boolean, newPosition: vec3, duration: number, callback?: () => void): void;
        animateRotation(sceneObject: SceneObject, isLocal: boolean, newRotation: quat | vec3, duration: number, callback?: () => void): void;
        animateScale(sceneObject: SceneObject, isLocal: boolean, newScale: vec3, duration: number, callback?: () => void): void;
    }

    interface HexenfurtSoundManager {
        setMasterVolume(volume: number): void;
        getMasterVolume(): number;
        setBackgroundVolume(id: number, volume: number): void;
        playSpatialSound(sceneObject: SceneObject, soundId: string, volume?: number, times?: number): SceneObject | null;
        playSound(soundId: string, volume?: number): void;
        stopSpatialSound(object: SceneObject, soundId: string): void;
        stopSpatialSoundById(soundId: string): void;
        stopAllSpatialSounds(): void;
    }

    interface HexenfurtInventory {
        items: { [key: string]: boolean };
        notes: string[];
        isInspecting: boolean;
        addItem(itemId: string, itemSceneObject: SceneObject): void;
        addNote(noteText: string, itemSceneObject: SceneObject): void;
        addLore(loreId: string, itemSceneObject: SceneObject, itemCenterSceneObject: SceneObject): void;
        has(itemId: string): boolean;
        reset(): void;
    }

    interface HexenfurtHintSystem {
        showHint(hintId: string): void;
        clearQueue(): void;
        isBusy(): boolean;
        currentHintId(): string | null;
    }

    interface HexenfurtPersistentStorage {
        getStat(name: string): number | null;
        setStat(name: string, value: number): void;
        increaseStat(name: string, amount?: number): number | null;
        updateFastestEscapeIfBetter(seconds: number): number;
        getAllStats(): { [key: string]: number };
        hasPlayedFirstGame(): boolean;
        markFirstGamePlayed(): void;
        registerLoreIds(list: string[]): void;
        normalizeLoreId(id: string | null | undefined): string;
        addLoreSeen(loreId: string): boolean;
        hasSeenLore(loreId: string): boolean;
        getSeenLoreList(): string[];
        checkLoreItemsNotSeen(): string[];
        resetAllLore(): void;
        resetStats(): void;
        registerArchiveObjectIds(list: string[]): void;
        addArchiveObjectSeen(objectId: string): boolean;
        hasSeenArchiveObject(objectId: string): boolean;
        getSeenArchiveObjectList(): string[];
        getMasterVolume(): number;
        setMasterVolume(volume: number): void;
        getGlovesEnabled(): boolean;
        setGlovesEnabled(enabled: boolean): void;
        getUnlockAllProgressionSpawns(): boolean;
        setUnlockAllProgressionSpawns(enabled: boolean): void;
        getLastSpawnIds(category: string): string[];
        setLastSpawnIds(category: string, ids: string[]): void;
        getGroundVariantLastRun(): string;
        setGroundVariantLastRun(variant: string): void;
        wipeLocalProgress(): void;
    }

    interface HexenfurtKVStore {
        getInt(k: string): number;
        putInt(k: string, v: number): void;
        getFloat(k: string): number;
        putFloat(k: string, v: number): void;
        getString(k: string): string;
        putString(k: string, v: string): void;
    }

    namespace global {
        let utils: HexenfurtUtils;
        let soundManager: HexenfurtSoundManager;
        let inventory: HexenfurtInventory;
        let hintSystem: HexenfurtHintSystem;
        let persistentStorage: HexenfurtPersistentStorage;
        let surfaceAnchors: HexenfurtSurfaceAnchor[];
        let tweenManager: {
            startTween(obj: SceneObject, id: string, onDone?: () => void): void;
            resetObject(obj: SceneObject, id: string): void;
        };
        let uiLayer: LayerSet;
        let newlyAcquiredLore: string | null;
        let groundHeight: number;
        /** Setup view root; owned by `ViewController`, read by `WorldQueryManager` for pinch detection. */
        let hexenfurtSetupViewRoot: SceneObject | null;

        let startTimer: () => void;
        let endTimer: () => number;
        let peekTimer: () => number;
        let resetTimer: () => void;

        let removedAnchor: () => void;
        let doorOpened: (door: SceneObject) => void;
        /** Fired once the escape door slam animation finishes (EscapeDoor → ViewController). */
        let escapeDoorSlammed: (() => void) | undefined;
        let inventoryHint: () => void;
        let showCompendium: () => void;
        let hideCompendium: () => void;
    }
}
