// Procedural room spawner. Owns the room/pickup/decoration/lore prefab catalogs,
// the escape-door spawn helper, and the full spawn pipeline: filtering anchors,
// building the chained puzzle path (A to D), placing decorations and lore, and
// driving the loading screen. GameFlow calls setupProceduralGame() after setup.

@typedef
export class RoomObjectDef {
    @input
    @label("Identifier")
    id: string = "";

    @input
    objectPrefab!: ObjectPrefab;

    @input
    @label("Object Type")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Ground", "ground"),
            new ComboBoxItem("Wall", "wall"),
            new ComboBoxItem("Ceiling", "ceiling"),
        ])
    )
    objectType: string = "ground";

    @input
    @label("Locked Item")
    lockedItem: boolean = false;

    @input
    @label("Can Animate Scale")
    canAnimateScale: boolean = false;

    @input
    @label("Can Be Final")
    canBeFinal: boolean = false;
}

@typedef
export class PickupObjectDef {
    @input
    @label("Identifier")
    id: string = "";

    @input
    objectPrefab!: ObjectPrefab;

    @input
    @label("Object Type")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Key", "key"),
            new ComboBoxItem("Note", "note"),
        ])
    )
    objectType: string = "key";
}

@typedef
export class DecoObjectDef {
    @input
    @label("Identifier")
    id: string = "";

    @input
    objectPrefab!: ObjectPrefab;

    @input("int", "2")
    @label("Max Count")
    maxCount: number = 2;

    @input
    @label("Excluded Objects")
    excludedObjects: string[] = [];
}

@typedef
export class LoreObjectDef {
    @input
    @label("Identifier")
    id: string = "";

    @input
    objectPrefab!: ObjectPrefab;

    @input("int", "0")
    @label("Orientation")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Horizontal", 0),
            new ComboBoxItem("Vertical", 1),
        ])
    )
    orientation: number = 0;
}

interface ItemSpot {
    objectType: "deco" | "item" | "lore" | "both";
    orientation: number;
    lockedSlot: boolean;
    origin: SceneObject;
}

interface RoomObjectScript {
    itemSpots?: ItemSpot[];
    init?: () => unknown;
}

interface PickupSlotScript {
    isNote?: boolean;
    itemId?: string;
    noteTextComponent?: Text;
}

interface GramophoneHint {
    configure(entryCombination: string, solutionCombination: string): void;
}

type Clue = { type: "item"; itemId: string } | { type: "note"; text: string } | { type: "none" };

/** A note clue whose physical spawn was deferred so the gramophone hint can
 * present it instead (locked B/C slots only). Falls back to a normal note
 * pickup in finalizeSpawn if no gramophone consumes it. */
type DeferredNote = { text: string; spot: ItemSpot };

interface SpawnRecord {
    so: SceneObject;
    sc: RoomObjectScript | null;
    prefab: RoomObjectDef;
    spots: ItemSpot[];
    freeSpots: { spot: ItemSpot; hostId: string | null }[];
    usedSpot?: ItemSpot | null;
}

interface GameFlowFinalize {
    enableInteractors(state: boolean): void;
    beginGameplay(): void;
    poiRoot: SceneObject;
    worldQueryManager: ScriptComponent;
}

interface ViewControllerProgress {
    updateLoadProgress(progress: number): void;
    onProceduralSpawnComplete(onGameplayReady: () => void): void;
    loadingTipText: Text;
    loadingTips: string[];
}

@component
export class ProceduralRoom extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Wiring</span>")
    @input
    public gameFlow!: ScriptComponent;

    @input
    @hint("ViewController owns loading tips UI; this script only drives progress + tips during spawn.")
    public viewController!: ScriptComponent;

    @input
    @hint("Delay (s) between consecutive spawn steps during loading. 0 = instant.")
    public loadTime: number = 0;

    @input
    @hint("When enabled, prints detailed A→B→C→D spawn diagnostics to the Logger (filter: ProceduralRoom:Spawn).")
    public debugSpawnPipeline: boolean = false;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Escape Door</span>")
    @input
    public escapeDoor!: ObjectPrefab;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Room POIs</span>")
    @input
    @label("Room Object Prefabs")
    public roomObjects: RoomObjectDef[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Pickup Objects</span>")
    @input
    @label("Pickup Objects")
    public pickupObjects: PickupObjectDef[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Deco Objects</span>")
    @input
    @label("Deco Object Prefabs")
    public decoObjects: DecoObjectDef[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Lore Objects</span>")
    @input
    @label("Lore Object Prefabs")
    public loreObjects: LoreObjectDef[] = [];
    @ui.group_end

    // Pooled pop-in scale animation: one shared UpdateEvent drives every active
    // pop-in instead of allocating a fresh UpdateEvent per spawned object.
    private popInAnims: { tr: Transform; start: number; duration: number }[] = [];
    private popInEvent!: SceneEvent;

    // Single reusable pump event for the spawn queue (replaces a per-step
    // global.utils.delay() allocation that leaked one DelayedCallbackEvent each step).
    private spawnPumpEvent!: DelayedCallbackEvent;
    private spawnPump: (() => void) | null = null;

    onAwake(): void {
        this.popInEvent = this.createEvent("UpdateEvent");
        this.popInEvent.enabled = false;
        this.popInEvent.bind(() => this.tickPopIns());

        this.spawnPumpEvent = this.createEvent("DelayedCallbackEvent");
        this.spawnPumpEvent.bind(() => {
            const fn = this.spawnPump;
            if (fn) fn();
        });

        // Register lore IDs with persistent storage so the unseen-first picker works.
        this.createEvent("OnStartEvent").bind(() => {
            if (!global.persistentStorage) return;
            const ids: string[] = [];
            for (let i = 0; i < this.loreObjects.length; i++) ids.push(this.loreObjects[i].id);
            global.persistentStorage.registerLoreIds(ids);
        });
    }

    private startPopIn(sceneObject: SceneObject): void {
        if (!sceneObject || !sceneObject.getTransform) return;
        if (global.soundManager) global.soundManager.playSound("synth", 1);
        const tr = sceneObject.getTransform();
        tr.setWorldScale(vec3.zero());
        this.popInAnims.push({ tr, start: getTime(), duration: 0.25 });
        this.popInEvent.enabled = true;
    }

    private tickPopIns(): void {
        const now = getTime();
        for (let i = this.popInAnims.length - 1; i >= 0; i--) {
            const a = this.popInAnims[i];
            const k = (now - a.start) / a.duration;
            if (k < 0) continue;
            if (k >= 1.0) {
                a.tr.setWorldScale(new vec3(1, 1, 1));
                this.popInAnims.splice(i, 1);
                continue;
            }
            const c1 = 1.70158, c3 = c1 + 1.0, p = k - 1.0;
            const s = 1.0 + c3 * p * p * p + c1 * p * p;
            a.tr.setWorldScale(new vec3(s, s, s));
        }
        if (this.popInAnims.length === 0) this.popInEvent.enabled = false;
    }

    private markArchiveObjectSeen(objectId: string): void {
        if (!objectId || !global.persistentStorage) return;
        global.persistentStorage.addArchiveObjectSeen(objectId);
    }

    public setupProceduralGame(): void {
        const flow = this.gameFlow as unknown as GameFlowFinalize;
        const wqm = flow.worldQueryManager as any;

        flow.enableInteractors(false);
        if (!global.deviceInfoSystem.isEditor()) {
            wqm.stopRecording();
        }
        wqm.anchorVisualsRoot.enabled = false;

        // Spawn the escape door first. `exitDoor` is nullable; bail clearly if the
        // door surface was never captured rather than dereferencing null below.
        if (!wqm.exitDoor) { print("ProceduralRoom: no exit door captured; aborting spawn."); return; }
        this.createEscapeDoor(wqm.exitDoor);

        const anchors: HexenfurtSurfaceAnchor[] = global.surfaceAnchors;
        if (!anchors || !anchors.length) { print("No anchors found"); return; }

        // Tier 1: filter prefab catalog by first-game / rounds gating.
        const filteredRoomObjects = (this.roomObjects || []).filter((obj) => this.allowRoomObject(obj));
        const groundPrefabs  = filteredRoomObjects.filter((o) => o.objectType === "ground");
        const wallPrefabs    = filteredRoomObjects.filter((o) => o.objectType === "wall");
        const ceilingPrefabs = filteredRoomObjects.filter((o) => o.objectType === "ceiling");

        // Variety bias: prefer objects/decos NOT spawned last run. We order each
        // prefab list so "fresh" ids (absent from the previous run) come first,
        // shuffled within their tier, with "recent" ids shuffled after. All spawn
        // stages walk these lists in order, so the freshest prefabs win ties.
        const psVar = global.persistentStorage;
        const toIdSet = (ids: string[] | null | undefined): { [id: string]: boolean } => {
            const s: { [id: string]: boolean } = {};
            if (ids) for (let i = 0; i < ids.length; i++) if (ids[i]) s[ids[i]] = true;
            return s;
        };
        const lastRunRoomIds: string[] = psVar && psVar.getLastSpawnIds ? psVar.getLastSpawnIds("room") : [];
        const lastRunDecoIds: string[] = psVar && psVar.getLastSpawnIds ? psVar.getLastSpawnIds("deco") : [];
        const lastRoomSet = toIdSet(lastRunRoomIds);
        const lastDecoSet = toIdSet(lastRunDecoIds);
        const orderByVariety = (list: RoomObjectDef[], recentSet: { [id: string]: boolean }): void => {
            const fresh: RoomObjectDef[] = [];
            const recent: RoomObjectDef[] = [];
            for (let i = 0; i < list.length; i++) (recentSet[list[i].id] ? recent : fresh).push(list[i]);
            this.shuffle(fresh);
            this.shuffle(recent);
            list.length = 0;
            for (let i = 0; i < fresh.length; i++) list.push(fresh[i]);
            for (let i = 0; i < recent.length; i++) list.push(recent[i]);
        };
        orderByVariety(groundPrefabs, lastRoomSet);
        orderByVariety(wallPrefabs, lastRoomSet);
        orderByVariety(ceilingPrefabs, lastRoomSet);

        // Ground "variant" turn: alternate the first unlocked ground placement
        // between `table` and the vase family each session, so `table` (which
        // otherwise loses to four vase ids) shows up regularly. Vase decorations
        // are unaffected; only room objects participate.
        const VASE_ROOM_IDS: { [id: string]: boolean } = { vase1: true, vase2: true, vase3: true, vase4: true };
        const isVaseRoomId = (id: string): boolean => !!VASE_ROOM_IDS[id];
        const isTableRoomId = (id: string): boolean => id === "table";
        const lastGroundVariant = psVar && psVar.getGroundVariantLastRun ? psVar.getGroundVariantLastRun() : "";
        const preferGroundVariant: "table" | "vase" = lastGroundVariant === "table" ? "vase" : "table";
        let groundVariantTurnConsumed = false;

        // Tier 2: anchors by type.
        const wallAnchors    = anchors.filter((a) => a.surfaceType === "wall");
        const groundAnchors  = anchors.filter((a) => a.surfaceType === "ground");
        const ceilingAnchors = anchors.filter((a) => a.surfaceType === "ceiling");
        this.shuffle(wallAnchors);
        this.shuffle(groundAnchors);
        this.shuffle(ceilingAnchors);

        // Tier 3: prefab/used tracking and helpers.
        const usedIds: { [k: string]: boolean } = {};
        const prune = (list: RoomObjectDef[]): void => {
            for (let i = list.length - 1; i >= 0; i--) {
                if (usedIds[list[i].id]) list.splice(i, 1);
            }
        };
        const markUsed = (prefab: RoomObjectDef | null): void => {
            if (!prefab) return;
            usedIds[prefab.id] = true;
            prune(groundPrefabs);
            prune(wallPrefabs);
            prune(ceilingPrefabs);
        };

        const spawnRunId = "" + Math.floor(Math.random() * 100000);
        const dbg = (msg: string): void => {
            if (this.debugSpawnPipeline) print("[ProceduralRoom:Spawn] [" + spawnRunId + "] " + msg);
        };
        const formatClue = (clue: Clue): string => {
            if (clue.type === "item") return "item:" + clue.itemId;
            if (clue.type === "note") return "note:\"" + clue.text + "\"";
            return "none";
        };
        const idsFromList = (list: RoomObjectDef[], onlyLocked?: boolean): string => {
            const parts: string[] = [];
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                if (onlyLocked === true && !p.lockedItem) continue;
                if (onlyLocked === false && p.lockedItem) continue;
                parts.push(p.id + (p.lockedItem ? "*" : ""));
            }
            return parts.length ? parts.join(",") : "(empty)";
        };

        const buildRotationForAnchor = (anchor: HexenfurtSurfaceAnchor): quat => {
            if (!anchor || !anchor.surfaceType) return quat.quatIdentity();
            if (anchor.surfaceType === "ground") {
                const yaw = anchor.yaw ?? 0.0;
                const dir = new vec3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
                return quat.lookAt(dir, vec3.up());
            }
            if (anchor.surfaceType === "ceiling") {
                const yawC = anchor.yaw ?? 0.0;
                const dirC = new vec3(Math.sin(yawC), 0, Math.cos(yawC)).normalize();
                return quat.lookAt(dirC, vec3.down());
            }
            const n = anchor.normal ? anchor.normal.normalize() : vec3.forward();
            const up = Math.abs(n.dot(vec3.up())) > 0.99 ? vec3.right() : vec3.up();
            const f = n.cross(up).normalize();
            return quat.lookAt(f, n);
        };

        // When `commit` is false the prefab is instantiated for inspection only
        // (e.g. spawnAccepting probing whether a candidate's spots fit the clue):
        // it is NOT marked archive-seen and NOT animated, so rejected candidates
        // don't pollute the seen list. Call finalizeSpawnedPrefab() once kept.
        const spawnPrefabAtAnchor = (prefab: RoomObjectDef) => (anchor: HexenfurtSurfaceAnchor, commit: boolean = true): SceneObject => {
            const so = prefab.objectPrefab.instantiate(flow.poiRoot);
            so.getTransform().setWorldPosition(anchor.position);
            so.getTransform().setWorldRotation(buildRotationForAnchor(anchor));
            if (commit) finalizeSpawnedPrefab(prefab, so);
            return so;
        };
        const finalizeSpawnedPrefab = (prefab: RoomObjectDef, so: SceneObject): void => {
            if (prefab && prefab.canAnimateScale) this.startPopIn(so);
            if (prefab.id) this.markArchiveObjectSeen(prefab.id);
        };

        // Pickup helpers
        const findPickupById = (id: string): PickupObjectDef | null => {
            for (let i = 0; i < this.pickupObjects.length; i++) {
                if (this.pickupObjects[i].id === id) return this.pickupObjects[i];
            }
            return null;
        };
        const getNotePrefab = (): PickupObjectDef | null => {
            for (let i = 0; i < this.pickupObjects.length; i++) {
                if (this.pickupObjects[i].objectType === "note") return this.pickupObjects[i];
            }
            return null;
        };
        const getKeyPrefab = (id: string): PickupObjectDef | null => {
            const byId = findPickupById(id);
            if (byId) return byId;
            for (let i = 0; i < this.pickupObjects.length; i++) {
                if (this.pickupObjects[i].objectType === "key") return this.pickupObjects[i];
            }
            return null;
        };

        const normalizeClue = (retVal: unknown): Clue => {
            if (typeof retVal === "string") {
                const asPickup = findPickupById(retVal);
                if (asPickup) return { type: "item", itemId: retVal };
                return { type: "note", text: retVal };
            }
            if (retVal && typeof retVal === "object") {
                const o = retVal as { itemId?: string; id?: string };
                const iid = o.itemId || o.id;
                if (iid) return { type: "item", itemId: iid };
            }
            return { type: "none" };
        };
        const callInitGetClue = (sc: RoomObjectScript | null): Clue => {
            if (sc && typeof sc.init === "function") return normalizeClue(sc.init());
            return { type: "none" };
        };
        const itemsOnlyHorizontal = (spot: ItemSpot): boolean => !!spot && spot.orientation === 0;
        const isItemHolder = (spot: ItemSpot): boolean => !!spot && spot.objectType !== "deco" && spot.objectType !== "lore";

        const pushFreeSpots = (spots: ItemSpot[], exclude: ItemSpot | null, bucket: { spot: ItemSpot; hostId: string | null }[], hostId: string | null): void => {
            for (let i = 0; i < spots.length; i++) {
                const s = spots[i];
                if (!s.lockedSlot && s !== exclude) bucket.push({ spot: s, hostId });
            }
        };
        const removeSpotFromFreeList = (spot: ItemSpot, bucket: { spot: ItemSpot; hostId: string | null }[]): void => {
            for (let i = 0; i < bucket.length; i++) {
                if (bucket[i].spot === spot) { bucket.splice(i, 1); return; }
            }
        };

        const spawnPickupInSpot = (prefabData: PickupObjectDef | null, spot: ItemSpot, asNote: boolean, payload: string): SceneObject | null => {
            if (!prefabData || !spot) return null;
            const so = prefabData.objectPrefab.instantiate(spot.origin);
            so.getTransform().setLocalPosition(vec3.zero());
            so.getTransform().setLocalScale(new vec3(1, 1, 1));
            const sc = so.getComponent("Component.ScriptComponent") as PickupSlotScript | null;
            if (sc) {
                if (asNote) {
                    if (typeof sc.isNote !== "undefined") sc.isNote = true;
                    if (sc.noteTextComponent && typeof sc.noteTextComponent.text !== "undefined") {
                        sc.noteTextComponent.text = (payload || "").toString();
                    }
                } else {
                    if (typeof sc.isNote !== "undefined") sc.isNote = false;
                    if (typeof sc.itemId !== "undefined") sc.itemId = payload;
                }
            }
            return so;
        };

        // First note clue's physical pickup is held back so the gramophone hint
        // (if it spawns) can present that combination instead. Consumed by the
        // gramophone deco, or spawned as a normal note pickup in finalizeSpawn.
        let deferredEntryNote: DeferredNote | null = null;

        // Ids actually spawned this run (room objects come from usedIds); decos are
        // tracked here. Persisted at finalize so next run can prefer fresh ones.
        const spawnedDecoIds: { [id: string]: boolean } = {};

        const describeSpotSummary = (spots: ItemSpot[]): string => {
            let lockedH = 0, lockedHHoriz = 0, unlockedH = 0;
            for (let i = 0; i < spots.length; i++) {
                const sp = spots[i];
                if (!isItemHolder(sp)) continue;
                if (sp.lockedSlot) {
                    lockedH++;
                    if (itemsOnlyHorizontal(sp)) lockedHHoriz++;
                } else if (itemsOnlyHorizontal(sp)) {
                    unlockedH++;
                }
            }
            return "spots total=" + spots.length + " lockedItemHolders=" + lockedH + " lockedHoriz=" + lockedHHoriz + " unlockedHoriz=" + unlockedH;
        };
        const diagnoseLockedClueReject = (clue: Clue, spots: ItemSpot[]): string => {
            if (clue.type === "none") return "clue is none (init missing?)";
            let lockedH = 0, lockedHHoriz = 0;
            for (let i = 0; i < spots.length; i++) {
                const sp = spots[i];
                if (!sp.lockedSlot || !isItemHolder(sp)) continue;
                lockedH++;
                if (itemsOnlyHorizontal(sp)) lockedHHoriz++;
            }
            if (!lockedH) return "no locked item-holder slots on prefab";
            if (clue.type === "item") {
                if (!lockedHHoriz) return "item clue needs horizontal locked slot";
                const ip = findPickupById(clue.itemId) || getKeyPrefab(clue.itemId);
                if (!ip) return "no pickup prefab for itemId=" + clue.itemId;
                return "item placement failed (unexpected)";
            }
            if (!getNotePrefab()) return "note pickup prefab missing";
            return "note placement failed (unexpected)";
        };
        const logProgressionAndCatalog = (): void => {
            const ps = global.persistentStorage;
            const unlockAll = ps?.getUnlockAllProgressionSpawns?.() ?? false;
            const played = typeof ps?.hasPlayedFirstGame === "function" ? ps.hasPlayedFirstGame() : "?";
            const rounds = typeof ps?.getStat === "function" ? ps.getStat("roundPlayed") : "?";
            dbg("progression unlockAll=" + unlockAll + " hasPlayedFirstGame=" + played + " roundPlayed=" + rounds);
            const all = this.roomObjects || [];
            const gated: string[] = [];
            const blocked: string[] = [];
            for (let i = 0; i < all.length; i++) {
                const o = all[i];
                if (this.allowRoomObject(o)) gated.push(o.id);
                else blocked.push(o.id);
            }
            dbg("catalog allowed=[" + gated.join(",") + "] blocked=[" + (blocked.length ? blocked.join(",") : "none") + "]");
            dbg("anchors wall=" + wallAnchors.length + " ground=" + groundAnchors.length + " ceiling=" + ceilingAnchors.length);
            dbg("pool wall locked=[" + idsFromList(wallPrefabs, true) + "] unlocked=[" + idsFromList(wallPrefabs, false) + "]");
            dbg("pool ground locked=[" + idsFromList(groundPrefabs, true) + "] unlocked=[" + idsFromList(groundPrefabs, false) + "]");
            dbg("pool ceiling=[" + idsFromList(ceilingPrefabs) + "]");
            dbg("deferredEntryNote at start=" + (deferredEntryNote ? "yes" : "no") + " notePickup=" + (getNotePrefab() ? "yes" : "MISSING"));
            dbg("ground variant: last=" + (lastGroundVariant || "none") + " prefer=" + preferGroundVariant);
        };
        if (this.debugSpawnPipeline) {
            print("[ProceduralRoom:Spawn] [" + spawnRunId + "] ========== spawn run start ==========");
            logProgressionAndCatalog();
        }

        const placeClueIntoLockedSpot = (clue: Clue, spots: ItemSpot[]): ItemSpot | null => {
            for (let i = 0; i < spots.length; i++) {
                const sp = spots[i];
                if (!sp.lockedSlot || !isItemHolder(sp)) continue;
                if (clue.type === "item") {
                    if (!itemsOnlyHorizontal(sp)) continue;
                    const ip = findPickupById(clue.itemId) || getKeyPrefab(clue.itemId);
                    if (!ip) continue;
                    spawnPickupInSpot(ip, sp, false, clue.itemId);
                    return sp;
                }
                if (clue.type === "note") {
                    // Contents of a locked container are mandatory physical items
                    // (the opener of the previous link). They are ALWAYS spawned —
                    // never deferred — or the container opens to nothing and the
                    // chain breaks. Only the unlocked starter clue (D) may be
                    // voiced by the gramophone instead; see stage D.
                    const np = getNotePrefab();
                    if (!np) continue;
                    spawnPickupInSpot(np, sp, true, clue.text);
                    return sp;
                }
            }
            return null;
        };
        const placeClueIntoUnlockedSpot = (clue: Clue, spots: ItemSpot[]): ItemSpot | null => {
            for (let i = 0; i < spots.length; i++) {
                const sp = spots[i];
                if (sp.lockedSlot || !isItemHolder(sp)) continue;
                if (clue.type === "item") {
                    if (!itemsOnlyHorizontal(sp)) continue;
                    const ip = findPickupById(clue.itemId) || getKeyPrefab(clue.itemId);
                    if (!ip) continue;
                    spawnPickupInSpot(ip, sp, false, clue.itemId);
                    return sp;
                }
                if (clue.type === "note") {
                    const np = getNotePrefab();
                    if (!np) continue;
                    spawnPickupInSpot(np, sp, true, clue.text);
                    return sp;
                }
            }
            return null;
        };

        // Chance that, when the unlocked starter clue (clueC in D) is a NOTE, the
        // gramophone voices it instead of a physical note being placed. Never
        // applies to item/key starters (you can't "play" a key).
        const GRAMOPHONE_STARTER_REPLACE_CHANCE = 0.5;
        const hasGramophoneDeco = (this.decoObjects || []).some((d) => d.id === "gramophone");

        const spawnAccepting = (surface: "wall" | "ground", incomingClue: Clue, mustBeLockedPrefab: boolean, placeIntoLocked: boolean, stageLabel: string): SpawnRecord | null => {
            const list = surface === "wall" ? wallPrefabs : groundPrefabs;
            const anchorsList = surface === "wall" ? wallAnchors : groundAnchors;
            if (!anchorsList.length) {
                dbg(stageLabel + " spawnAccepting(" + surface + "): FAIL no anchors left");
                return null;
            }
            // Iterate in the list's variety-biased order (no re-shuffle) so fresh
            // prefabs are preferred for puzzle links too.
            const idxs: number[] = [];
            for (let i = 0; i < list.length; i++) if (!usedIds[list[i].id]) idxs.push(i);
            dbg(stageLabel + " spawnAccepting(" + surface + ") clue=" + formatClue(incomingClue) + " candidates=" + idxs.length + " anchorIdx=0/" + anchorsList.length + " order=" + idxs.map((i) => list[i].id).join(">"));
            for (let k = 0; k < idxs.length; k++) {
                const prefab = list[idxs[k]];
                if (typeof mustBeLockedPrefab === "boolean" && prefab.lockedItem !== mustBeLockedPrefab) {
                    dbg(stageLabel + "   skip " + prefab.id + " (lockedItem mismatch)");
                    continue;
                }
                const anchor = anchorsList[0];
                // Probe only: don't mark seen / animate until acceptance is confirmed.
                const so = spawnPrefabAtAnchor(prefab)(anchor, false);
                const sc = so.getComponent("Component.ScriptComponent") as RoomObjectScript | null;
                const spots: ItemSpot[] = sc ? (sc.itemSpots || []) : [];
                if (!sc) dbg(stageLabel + "   reject " + prefab.id + ": no RoomObject ScriptComponent");
                const usedSpot = placeIntoLocked ? placeClueIntoLockedSpot(incomingClue, spots) : placeClueIntoUnlockedSpot(incomingClue, spots);
                if (usedSpot) {
                    finalizeSpawnedPrefab(prefab, so);
                    markUsed(prefab);
                    anchorsList.splice(0, 1);
                    const freeSpots: { spot: ItemSpot; hostId: string | null }[] = [];
                    pushFreeSpots(spots, placeIntoLocked ? null : usedSpot, freeSpots, prefab.id);
                    dbg(stageLabel + "   ACCEPT " + prefab.id + " on " + surface + " " + describeSpotSummary(spots));
                    return { so, sc, prefab, spots, freeSpots, usedSpot };
                }
                const why = sc ? diagnoseLockedClueReject(incomingClue, spots) : "no script";
                dbg(stageLabel + "   reject " + prefab.id + ": " + why + " | " + describeSpotSummary(spots));
                so.destroy();
            }
            dbg(stageLabel + " spawnAccepting(" + surface + "): FAIL exhausted candidates for clue=" + formatClue(incomingClue));
            return null;
        };
        const spawnPlain = (surface: "wall" | "ground", mustBeLocked: boolean, stageLabel: string): SpawnRecord | null => {
            const list = surface === "wall" ? wallPrefabs : groundPrefabs;
            const anchorsList = surface === "wall" ? wallAnchors : groundAnchors;
            if (!anchorsList.length) {
                dbg(stageLabel + " spawnPlain(" + surface + ",locked=" + mustBeLocked + "): FAIL no anchors");
                return null;
            }
            let idxs: number[] = [];
            for (let i = 0; i < list.length; i++) if (!usedIds[list[i].id]) idxs.push(i);

            // Ground variant turn: for the first unlocked ground placement of the
            // run, float the preferred family (table or vase) to the front so it
            // wins over the otherwise-dominant four vases (or vice versa).
            const applyVariantTurn = surface === "ground" && mustBeLocked === false && !groundVariantTurnConsumed;
            if (applyVariantTurn) {
                const matchesPreferred = (id: string): boolean =>
                    preferGroundVariant === "table" ? isTableRoomId(id) : isVaseRoomId(id);
                const preferred: number[] = [];
                const other: number[] = [];
                for (let i = 0; i < idxs.length; i++) (matchesPreferred(list[idxs[i]].id) ? preferred : other).push(idxs[i]);
                if (preferred.length) {
                    idxs = preferred.concat(other);
                    dbg(stageLabel + " variant turn: prefer=" + preferGroundVariant + " front=[" + preferred.map((i) => list[i].id).join(",") + "]");
                }
            }

            dbg(stageLabel + " spawnPlain(" + surface + ",locked=" + mustBeLocked + ") candidates=" + idxs.length + " order=" + idxs.map((i) => list[i].id + (list[i].lockedItem ? "*" : "")).join(">"));
            for (let k = 0; k < idxs.length; k++) {
                const prefab = list[idxs[k]];
                if (typeof mustBeLocked === "boolean" && prefab.lockedItem !== mustBeLocked) {
                    dbg(stageLabel + "   skip " + prefab.id + " (need locked=" + mustBeLocked + ")");
                    continue;
                }
                const anchor = anchorsList[0];
                const so = spawnPrefabAtAnchor(prefab)(anchor);
                const sc = so.getComponent("Component.ScriptComponent") as RoomObjectScript | null;
                const spots: ItemSpot[] = sc ? (sc.itemSpots || []) : [];
                markUsed(prefab);
                anchorsList.splice(0, 1);
                if (applyVariantTurn && (isTableRoomId(prefab.id) || isVaseRoomId(prefab.id))) {
                    groundVariantTurnConsumed = true;
                    dbg(stageLabel + "   variant turn consumed by " + prefab.id);
                }
                const freeSpots: { spot: ItemSpot; hostId: string | null }[] = [];
                pushFreeSpots(spots, null, freeSpots, prefab.id);
                dbg(stageLabel + "   SPAWN " + prefab.id + " on " + surface + " " + describeSpotSummary(spots));
                return { so, sc, prefab, spots, freeSpots };
            }
            dbg(stageLabel + " spawnPlain(" + surface + "): FAIL no matching prefab");
            return null;
        };

        // Top off the room: fill EVERY remaining wall/ground anchor with a plain
        // prefab so no anchor is ever left empty when a puzzle stage (A/B/C/D)
        // can't claim it. Prefers unlocked prefabs; falls back to leftover locked
        // ones only if a surface still has anchors but no unlocked prefab left.
        const fillRemainingAnchors = (): void => {
            const fillSurface = (surface: "wall" | "ground"): void => {
                const anchorsList = surface === "wall" ? wallAnchors : groundAnchors;
                let guard = 0;
                while (anchorsList.length && guard++ < 64) {
                    const rec = spawnPlain(surface, false, "FILL") || spawnPlain(surface, true, "FILL");
                    if (!rec) break;
                    pushFreeSpots(rec.spots, null, freeItemSpots, rec.prefab.id);
                }
            };
            dbg("--- stage FILL --- anchors wall=" + wallAnchors.length + " ground=" + groundAnchors.length);
            fillSurface("wall");
            fillSurface("ground");
            dbg("FILL done anchors left wall=" + wallAnchors.length + " ground=" + groundAnchors.length);
        };

        // Progressive load + tips
        const freeItemSpots: { spot: ItemSpot; hostId: string | null }[] = [];
        const vc = this.viewController as unknown as ViewControllerProgress;
        const remainingTips = (vc.loadingTips || []).slice();
        this.shuffle(remainingTips);

        const tipCooldown = 2.0;
        let lastTipTime = -1;
        const setPhaseTip = (): void => {
            if (!remainingTips.length) return;
            const now = getTime();
            if (lastTipTime >= 0 && (now - lastTipTime) < tipCooldown) return;
            const tip = remainingTips.pop();
            lastTipTime = now;
            if (vc.loadingTipText && tip !== undefined) vc.loadingTipText.text = tip;
        };
        const setProgress = (x: number): void => {
            (this.viewController as unknown as ViewControllerProgress).updateLoadProgress(x);
        };

        // Pipeline state
        let ceilPrefab: RoomObjectDef | null = null;
        let ceilAnchor: HexenfurtSurfaceAnchor | null = null;
        let aSurface: "wall" | "ground" | null = null;
        let aPrefab: RoomObjectDef | null = null;
        let aSO: SceneObject | null = null;
        let aSC: RoomObjectScript | null = null;
        let aSpots: ItemSpot[] = [];
        let aUsed: ItemSpot | null = null;
        let clueA: Clue = { type: "none" };
        let recB: SpawnRecord | null = null;
        let clueB: Clue = { type: "none" };
        let cSurface: "wall" | "ground" | null = null;
        let recC: SpawnRecord | null = null;
        let clueC: Clue = { type: "none" };
        let dSurface: "wall" | "ground" | null = null;
        let recD: SpawnRecord | null = null;

        const hasUnspawnedLocked = (list: RoomObjectDef[]): boolean => {
            for (let i = 0; i < list.length; i++) if (!usedIds[list[i].id] && list[i].lockedItem) return true;
            return false;
        };
        const hasUnspawnedUnlocked = (list: RoomObjectDef[]): boolean => {
            for (let i = 0; i < list.length; i++) if (!usedIds[list[i].id] && !list[i].lockedItem) return true;
            return false;
        };

        const randomNoteText = (): string => {
            if (Math.random() < 0.5) {
                const len = 4 + Math.floor(Math.random() * 3);
                let s = "";
                for (let i = 0; i < len; i++) s += "" + Math.floor(Math.random() * 10);
                return s;
            }
            const hour = 1 + Math.floor(Math.random() * 11);
            const mm = (Math.random() < 0.5) ? "00" : "30";
            return hour + ":" + mm;
        };

        const findGramophoneHint = (so: SceneObject): GramophoneHint | null => {
            const scripts = so.getComponents("Component.ScriptComponent") as unknown[];
            for (let i = 0; i < scripts.length; i++) {
                const s = scripts[i] as { configure?: unknown };
                if (s && typeof s.configure === "function") return s as GramophoneHint;
            }
            return null;
        };

        const spawnDecoInSpot = (deco: DecoObjectDef, spot: ItemSpot): SceneObject => {
            const so = deco.objectPrefab.instantiate(spot.origin);
            so.getTransform().setLocalPosition(vec3.zero());
            const sc = so.getComponent("Component.ScriptComponent") as PickupSlotScript | null;
            if (deco.id === "noteDecoration" && sc && sc.noteTextComponent && typeof sc.noteTextComponent.text !== "undefined") {
                sc.noteTextComponent.text = randomNoteText();
            }
            if (deco.id === "gramophone") {
                const hint = findGramophoneHint(so);
                if (hint) {
                    if (deferredEntryNote) {
                        // Voice the starter code: no entry note, audio digit sequence only.
                        const code = deferredEntryNote.text;
                        dbg("gramophone voices starter code \"" + code + "\"");
                        hint.configure("", code);
                        deferredEntryNote = null;
                    } else {
                        // No starter to voice: music ambience only, no digit sequence.
                        dbg("gramophone music only (no starter code deferred)");
                        hint.configure("", "");
                    }
                }
            }
            if (deco.id) {
                this.markArchiveObjectSeen(deco.id);
                spawnedDecoIds[deco.id] = true;
            }
            return so;
        };
        const spawnLoreInSpot = (lore: LoreObjectDef, spot: ItemSpot): SceneObject => {
            const so = lore.objectPrefab.instantiate(spot.origin);
            so.getTransform().setLocalPosition(vec3.zero());
            so.getTransform().setLocalScale(new vec3(1, 1, 1));
            return so;
        };

        // Spawn queue
        const delaySeconds = (this.loadTime && this.loadTime > 0) ? this.loadTime : 0;
        const spawnQueue: (() => void)[] = [];
        let completedSpawns = 0;
        let totalSpawns = 0;

        const recalcTotals = (): void => { totalSpawns = completedSpawns + spawnQueue.length; };
        const updateProgress = (): void => {
            recalcTotals();
            const denom = totalSpawns > 0 ? totalSpawns : 1;
            setProgress(completedSpawns / denom);
        };
        const enqueueSpawn = (fn: () => void): void => {
            spawnQueue.push(fn);
            recalcTotals();
        };

        const queueDecorationsAndLore = (): void => {
            const decos = this.decoObjects || [];
            const usedCountById: { [id: string]: number } = {};
            const canUseDeco = (deco: DecoObjectDef): boolean => {
                const max = (typeof deco.maxCount === "number") ? deco.maxCount : 2;
                if (max <= 0) return false;
                const used = usedCountById[deco.id] || 0;
                return used < max;
            };
            const markDecoUsed = (deco: DecoObjectDef): void => {
                usedCountById[deco.id] = (usedCountById[deco.id] || 0) + 1;
            };

            this.shuffle(freeItemSpots);
            for (let i = 0; i < freeItemSpots.length; i++) {
                const entry = freeItemSpots[i];
                const sp = entry.spot;
                if (sp.objectType === "lore") continue;
                const isDecoTarget = sp.objectType === "deco" || sp.objectType === "both";
                const isItemTarget = sp.objectType === "item" || sp.objectType === "both";
                const hostId = entry.hostId || null;

                const pool: DecoObjectDef[] = [];
                for (let d = 0; d < decos.length; d++) {
                    const deco = decos[d];
                    if (!canUseDeco(deco)) continue;
                    if (deco.excludedObjects && hostId && deco.excludedObjects.indexOf(hostId) !== -1) continue;
                    if (deco.id === "noteDecoration") {
                        if (!sp.lockedSlot && (isItemTarget || isDecoTarget)) pool.push(deco);
                    } else {
                        if (isDecoTarget) pool.push(deco);
                    }
                }

                if (!pool.length) continue;
                // Variety bias: prefer decos not spawned last run; fall back to the
                // full pool if every candidate was used last run.
                const freshPool = pool.filter((d) => !lastDecoSet[d.id]);
                const pickPool = freshPool.length ? freshPool : pool;
                this.shuffle(pickPool);
                const chosen = pickPool[0];
                markDecoUsed(chosen);
                ((decoChoice: DecoObjectDef, spotRef: ItemSpot) => {
                    enqueueSpawn(() => { spawnDecoInSpot(decoChoice, spotRef); });
                })(chosen, sp);
            }

            const loreList = this.loreObjects || [];
            const loreById: { [id: string]: LoreObjectDef } = {};
            const allLoreIds: string[] = [];
            for (let li0 = 0; li0 < loreList.length; li0++) {
                loreById[loreList[li0].id] = loreList[li0];
                allLoreIds.push(loreList[li0].id);
            }
            const loreWrappers = freeItemSpots.filter((e) => !e.spot.lockedSlot && e.spot.objectType === "lore");
            this.shuffle(loreWrappers);

            const unseenIds: string[] = [];
            if (global.persistentStorage && typeof global.persistentStorage.checkLoreItemsNotSeen === "function") {
                const rawUnseen = global.persistentStorage.checkLoreItemsNotSeen() || [];
                for (let ui = 0; ui < rawUnseen.length; ui++) {
                    if (loreById[rawUnseen[ui]]) unseenIds.push(rawUnseen[ui]);
                }
            }
            const diff = (a: string[], b: string[]): string[] => {
                const setB: { [id: string]: boolean } = {};
                for (let i1 = 0; i1 < b.length; i1++) setB[b[i1]] = true;
                const out: string[] = [];
                for (let j = 0; j < a.length; j++) if (!setB[a[j]]) out.push(a[j]);
                return out;
            };
            this.shuffle(unseenIds);
            const remainingIds = diff(allLoreIds, unseenIds);
            this.shuffle(remainingIds);
            const candidateIds = unseenIds.concat(remainingIds);

            let spawnedLoreCount = 0;
            const usedLoreIds: { [id: string]: boolean } = {};

            const tryReserveLoreById = (id: string): boolean => {
                if (spawnedLoreCount >= 3) return false;
                if (usedLoreIds[id]) return false;
                const loreItem = loreById[id];
                if (!loreItem) return false;
                for (let si = 0; si < loreWrappers.length; si++) {
                    const w = loreWrappers[si];
                    if (!w) continue;
                    if (w.spot.orientation !== loreItem.orientation) continue;
                    const chosenSpot = w.spot;
                    loreWrappers.splice(si, 1);
                    usedLoreIds[id] = true;
                    spawnedLoreCount++;
                    ((loreChoice: LoreObjectDef, spotRef: ItemSpot) => {
                        enqueueSpawn(() => { spawnLoreInSpot(loreChoice, spotRef); });
                    })(loreItem, chosenSpot);
                    return true;
                }
                return false;
            };

            for (let ci = 0; ci < candidateIds.length && spawnedLoreCount < 3; ci++) {
                tryReserveLoreById(candidateIds[ci]);
            }
        };

        const logSpawnSummary = (chainOk: boolean, placedFirstClue: ItemSpot | null): void => {
            if (!this.debugSpawnPipeline) return;
            dbg("========== spawn summary ==========");
            dbg("ceiling: " + (ceilPrefab ? ceilPrefab.id : "none"));
            dbg("A: " + (aPrefab ? aPrefab.id + "@" + aSurface : "MISSING") + " clueA=" + formatClue(clueA) + " goldKeyInA=" + (aUsed ? "yes" : "NO"));
            dbg("B: " + (recB ? recB.prefab.id : "MISSING") + " clueB=" + formatClue(clueB));
            dbg("C: " + (recC ? recC.prefab.id + "@" + cSurface : "MISSING") + " clueC=" + formatClue(clueC));
            dbg("D: " + (recD ? recD.prefab.id + "@" + dSurface : "MISSING") + " clueCPlacedInD=" + (placedFirstClue ? "yes" : "NO"));
            dbg("anchors left wall=" + wallAnchors.length + " ground=" + groundAnchors.length);
            dbg("remaining wall locked=[" + idsFromList(wallPrefabs, true) + "] ground locked=[" + idsFromList(groundPrefabs, true) + "]");
            dbg("chainOk=" + chainOk + " solvabilityFallback=" + (!chainOk ? "YES" : "no"));
            dbg("deferredEntryNote at end=" + (deferredEntryNote ? "\"" + deferredEntryNote.text + "\"" : "consumed/none"));
            print("[ProceduralRoom:Spawn] [" + spawnRunId + "] ========== spawn run end ==========");
        };

        const finalizeSpawn = (): void => {
            // No gramophone consumed the deferred entry note: spawn it as a normal pickup.
            if (deferredEntryNote) {
                const np = getNotePrefab();
                if (np) spawnPickupInSpot(np, deferredEntryNote.spot, true, deferredEntryNote.text);
                else dbg("finalize: deferred note but no note pickup prefab");
                deferredEntryNote = null;
            }
            // Record what we spawned so next run can prefer different objects/decos.
            if (global.persistentStorage && typeof global.persistentStorage.setLastSpawnIds === "function") {
                dbg("loaded previous last-run room=[" + (lastRunRoomIds.length ? lastRunRoomIds.join(",") : "none") + "] deco=[" + (lastRunDecoIds.length ? lastRunDecoIds.join(",") : "none") + "]");
                global.persistentStorage.setLastSpawnIds("room", Object.keys(usedIds));
                global.persistentStorage.setLastSpawnIds("deco", Object.keys(spawnedDecoIds));
                dbg("persisted last-run room=[" + Object.keys(usedIds).join(",") + "] deco=[" + Object.keys(spawnedDecoIds).join(",") + "]");
            }
            // Record which ground family spawned this run so the next session can
            // alternate. Leave the previous value untouched if neither appeared.
            if (typeof global.persistentStorage?.setGroundVariantLastRun === "function") {
                let groundVariant = "";
                if (usedIds["table"]) groundVariant = "table";
                else if (usedIds["vase1"] || usedIds["vase2"] || usedIds["vase3"] || usedIds["vase4"]) groundVariant = "vase";
                if (groundVariant) {
                    global.persistentStorage.setGroundVariantLastRun(groundVariant);
                    dbg("persisted ground variant=" + groundVariant + " (turnConsumed=" + groundVariantTurnConsumed + ")");
                } else {
                    dbg("ground variant unchanged (no table/vase spawned), keep last=" + (lastGroundVariant || "none"));
                }
            }
            setProgress(1.0);
            (this.viewController as unknown as ViewControllerProgress).onProceduralSpawnComplete(() => {
                flow.beginGameplay();
            });
        };

        const runNextSpawn = (): void => {
            if (!spawnQueue.length) { finalizeSpawn(); return; }
            setPhaseTip();
            const fn = spawnQueue.shift();
            if (fn) fn();
            completedSpawns++;
            updateProgress();

            if (!spawnQueue.length) { finalizeSpawn(); return; }
            this.spawnPump = runNextSpawn;
            this.spawnPumpEvent.reset(delaySeconds);
        };

        // Stage 0: ceiling
        enqueueSpawn(() => {
            dbg("--- stage CEILING ---");
            if (ceilingPrefabs.length && ceilingAnchors.length) {
                ceilPrefab = ceilingPrefabs[0];
                ceilAnchor = ceilingAnchors[0];
                spawnPrefabAtAnchor(ceilPrefab)(ceilAnchor);
                markUsed(ceilPrefab);
                ceilingAnchors.splice(0, 1);
                dbg("ceiling OK: " + ceilPrefab.id);
            } else {
                dbg("ceiling SKIP prefabs=" + ceilingPrefabs.length + " anchors=" + ceilingAnchors.length);
            }
        });

        // Stage A: locked prefab on wall or ground holding the gold key
        enqueueSpawn(() => {
            dbg("--- stage A ---");
            const canStartWall   = wallAnchors.length   > 0 && hasUnspawnedLocked(wallPrefabs);
            const canStartGround = groundAnchors.length > 0 && hasUnspawnedLocked(groundPrefabs);
            if (!canStartWall && !canStartGround) {
                print("No locked surface available for A");
                dbg("A FAIL: no locked surface (wallAnchors=" + wallAnchors.length + " groundAnchors=" + groundAnchors.length + ")");
                return;
            }

            if (canStartWall && canStartGround) {
                aSurface = (Math.random() < 0.5) ? "wall" : "ground";
            } else {
                aSurface = canStartWall ? "wall" : "ground";
            }
            const aList    = aSurface === "wall" ? wallPrefabs   : groundPrefabs;
            const aAnchors = aSurface === "wall" ? wallAnchors   : groundAnchors;
            dbg("A surface=" + aSurface + " (canWall=" + canStartWall + " canGround=" + canStartGround + ") lockedOrder=" + idsFromList(aList, true));

            aPrefab = null;
            for (let iA = 0; iA < aList.length; iA++) {
                if (!usedIds[aList[iA].id] && aList[iA].lockedItem) { aPrefab = aList[iA]; break; }
            }
            if (!aPrefab) {
                print("No locked prefab on " + aSurface + " for A");
                dbg("A FAIL: no locked prefab in list");
                return;
            }

            aSO = spawnPrefabAtAnchor(aPrefab)(aAnchors[0]);
            aSC = aSO.getComponent("Component.ScriptComponent") as RoomObjectScript | null;
            markUsed(aPrefab);
            aAnchors.splice(0, 1);
            aSpots = aSC ? (aSC.itemSpots || []) : [];
            aUsed = null;
            for (let sa = 0; sa < aSpots.length; sa++) {
                const spA = aSpots[sa];
                if (spA.lockedSlot && itemsOnlyHorizontal(spA)) {
                    const goldKey = getKeyPrefab("goldKey");
                    if (goldKey) {
                        spawnPickupInSpot(goldKey, spA, false, "goldKey");
                        aUsed = spA;
                    } else {
                        dbg("A WARN: goldKey pickup prefab missing");
                    }
                    break;
                }
            }
            pushFreeSpots(aSpots, aUsed, freeItemSpots, aPrefab.id);
            clueA = callInitGetClue(aSC);
            dbg("A OK: " + aPrefab.id + " clueA=" + formatClue(clueA) + " goldKey=" + (aUsed ? "yes" : "NO") + " " + describeSpotSummary(aSpots));
            dbg("remaining after A wallAnchors=" + wallAnchors.length + " groundAnchors=" + groundAnchors.length);
        });

        // Stage B: another locked prefab that accepts clueA
        enqueueSpawn(() => {
            dbg("--- stage B --- (incoming clueA=" + formatClue(clueA) + " deferredNote=" + (deferredEntryNote ? "yes" : "no") + ")");
            const preferred: "wall" | "ground" = (aSurface === "wall") ? "ground" : "wall";
            const other: "wall" | "ground" = preferred === "wall" ? "ground" : "wall";
            dbg("B try preferred=" + preferred + " then other=" + other);

            recB = spawnAccepting(preferred, clueA, true, true, "B");
            if (!recB) recB = spawnAccepting(other, clueA, true, true, "B");
            if (!recB) {
                print("Could not spawn B that accepts clueA");
                dbg("B FAIL: no accepting locked prefab for clueA=" + formatClue(clueA));
                dbg("B remaining locked wall=[" + idsFromList(wallPrefabs, true) + "] ground=[" + idsFromList(groundPrefabs, true) + "]");
                return;
            }

            pushFreeSpots(recB.spots, null, freeItemSpots, recB.prefab.id);
            clueB = callInitGetClue(recB.sc);
            if (clueB.type === "none") {
                clueB = { type: "note", text: "" + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) };
                dbg("B WARN: init returned none; random clueB=" + formatClue(clueB));
            }
            dbg("B OK: " + recB.prefab.id + " clueB=" + formatClue(clueB));
        });

        // Stage C: locked prefab that accepts clueB
        enqueueSpawn(() => {
            dbg("--- stage C --- (incoming clueB=" + formatClue(clueB) + " deferredNote=" + (deferredEntryNote ? "yes" : "no") + ")");
            cSurface = (wallAnchors.length && groundAnchors.length)
                ? (Math.random() < 0.5 ? "wall" : "ground")
                : (wallAnchors.length ? "wall" : (groundAnchors.length ? "ground" : null));
            if (!cSurface) {
                print("No anchors for C");
                dbg("C FAIL: no anchors (wall=" + wallAnchors.length + " ground=" + groundAnchors.length + ")");
                return;
            }

            const otherC: "wall" | "ground" = cSurface === "wall" ? "ground" : "wall";
            dbg("C try first=" + cSurface + " then other=" + otherC);
            recC = spawnAccepting(cSurface, clueB, true, true, "C") || spawnAccepting(otherC, clueB, true, true, "C");
            if (!recC) {
                print("Could not spawn C that accepts clueB");
                dbg("C FAIL: no accepting locked prefab for clueB=" + formatClue(clueB));
                dbg("C remaining locked wall=[" + idsFromList(wallPrefabs, true) + "] ground=[" + idsFromList(groundPrefabs, true) + "]");
                return;
            }

            pushFreeSpots(recC.spots, null, freeItemSpots, recC.prefab.id);
            clueC = callInitGetClue(recC.sc);
            if (clueC.type === "none") {
                clueC = { type: "note", text: "" + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) };
                dbg("C WARN: init returned none; random clueC=" + formatClue(clueC));
            }
            dbg("C OK: " + recC.prefab.id + " clueC=" + formatClue(clueC));
        });

        // Stage D: unlocked prefab, hide clueC inside it
        enqueueSpawn(() => {
            dbg("--- stage D --- (clueC=" + formatClue(clueC) + ")");
            const dCanWall   = wallAnchors.length   > 0 && hasUnspawnedUnlocked(wallPrefabs);
            const dCanGround = groundAnchors.length > 0 && hasUnspawnedUnlocked(groundPrefabs);
            dbg("D dCanWall=" + dCanWall + " dCanGround=" + dCanGround + " anchors wall=" + wallAnchors.length + " ground=" + groundAnchors.length);

            if (dCanWall && dCanGround)      dSurface = (Math.random() < 0.5) ? "wall" : "ground";
            else if (dCanWall)               dSurface = "wall";
            else if (dCanGround)             dSurface = "ground";
            else                             dSurface = wallAnchors.length ? "wall" : (groundAnchors.length ? "ground" : null);
            if (!dSurface) {
                print("No anchors for D");
                dbg("D FAIL: no surface");
                return;
            }

            const otherD: "wall" | "ground" = dSurface === "wall" ? "ground" : "wall";
            dbg("D try surface=" + dSurface + " then other=" + otherD + " unlocked wall=[" + idsFromList(wallPrefabs, false) + "] ground=[" + idsFromList(groundPrefabs, false) + "]");
            recD = spawnPlain(dSurface, false, "D") || spawnPlain(otherD, false, "D");
            if (!recD) dbg("D FAIL: spawnPlain could not place unlocked prefab");
            else dbg("D OK: " + recD.prefab.id);
            if (recD) pushFreeSpots(recD.spots, null, freeItemSpots, recD.prefab.id);

            // Fill any anchors the chain didn't claim so the room is always full.
            fillRemainingAnchors();

            const eligibleWrappers = freeItemSpots.filter((e) => !e.spot.lockedSlot && e.spot.objectType !== "deco" && e.spot.objectType !== "lore");
            this.shuffle(eligibleWrappers);

            let placedFirstClue: ItemSpot | null = null;

            // Optional gramophone starter: when the starter clue is a NOTE, there's
            // a chance the gramophone voices the code instead of placing a physical
            // note. We reserve an unlocked spot so the chain still "has" its starter
            // (chainOk stays true); if no gramophone consumes it, finalizeSpawn drops
            // the real note at that reserved spot. Never applies to item/key starters.
            const wantGramophoneStarter =
                hasGramophoneDeco &&
                clueC && clueC.type === "note" &&
                deferredEntryNote === null &&
                Math.random() < GRAMOPHONE_STARTER_REPLACE_CHANCE &&
                eligibleWrappers.length > 0;

            if (wantGramophoneStarter && clueC.type === "note") {
                const reserved = eligibleWrappers[0].spot;
                deferredEntryNote = { text: clueC.text, spot: reserved };
                placedFirstClue = reserved;
                dbg("D: starter note \"" + clueC.text + "\" deferred for gramophone (reserved spot; physical fallback in finalize)");
            } else if (clueC && clueC.type === "item") {
                for (let ei = 0; ei < eligibleWrappers.length; ei++) {
                    if (!itemsOnlyHorizontal(eligibleWrappers[ei].spot)) continue;
                    placedFirstClue = placeClueIntoUnlockedSpot(clueC, [eligibleWrappers[ei].spot]);
                    if (placedFirstClue) break;
                }
            } else if (clueC && clueC.type !== "none") {
                const spotsArr = eligibleWrappers.map((e) => e.spot);
                placedFirstClue = placeClueIntoUnlockedSpot(clueC, spotsArr);
            }
            if (placedFirstClue) removeSpotFromFreeList(placedFirstClue, freeItemSpots);

            if (recD && recD.sc) callInitGetClue(recD.sc);

            // Solvability guard: the win condition (escape door) needs the gold key,
            // which normally lives in A's locked slot and is reached by solving the
            // A->B->C->D clue chain. If any link broke (A failed, B/C missing, or the
            // entry clue couldn't be hidden in unlocked D), the gold key would be
            // unreachable. Place a directly grabbable gold key so the room is never
            // finalized in an unsolvable state.
            const chainOk = !!aUsed && !!recB && !!recC && !!placedFirstClue;
            logSpawnSummary(chainOk, placedFirstClue);
            if (!chainOk) {
                dbg("solvability: chain broken — triggering goldKey fallback");
                this.ensureGoldKeyReachable(
                    freeItemSpots,
                    isItemHolder,
                    itemsOnlyHorizontal,
                    (id: string) => getKeyPrefab(id),
                    spawnPickupInSpot,
                    removeSpotFromFreeList
                );
            }

            queueDecorationsAndLore();
        });

        updateProgress();
        runNextSpawn();
    }

    /** Fallback used when the clue chain degrades: drop a directly grabbable
     *  gold key into the best available unlocked spot so the player can always
     *  reach the escape door. Tries a horizontal item-holder first, then any
     *  unlocked item-holder, then any unlocked spot. */
    private ensureGoldKeyReachable(
        freeItemSpots: { spot: ItemSpot; hostId: string | null }[],
        isItemHolder: (spot: ItemSpot) => boolean,
        itemsOnlyHorizontal: (spot: ItemSpot) => boolean,
        getKeyPrefab: (id: string) => PickupObjectDef | null,
        spawnPickupInSpot: (prefabData: PickupObjectDef | null, spot: ItemSpot, asNote: boolean, payload: string) => SceneObject | null,
        removeSpotFromFreeList: (spot: ItemSpot, bucket: { spot: ItemSpot; hostId: string | null }[]) => void
    ): void {
        const goldKey = getKeyPrefab("goldKey");
        if (!goldKey) {
            print("[ProceduralRoom] WARNING: no goldKey prefab for solvability fallback.");
            return;
        }

        const pickSpot = (predicate: (spot: ItemSpot) => boolean): ItemSpot | null => {
            for (let i = 0; i < freeItemSpots.length; i++) {
                const sp = freeItemSpots[i].spot;
                if (!sp.lockedSlot && predicate(sp)) return sp;
            }
            return null;
        };

        const target =
            pickSpot((sp) => isItemHolder(sp) && itemsOnlyHorizontal(sp)) ||
            pickSpot((sp) => isItemHolder(sp)) ||
            pickSpot(() => true);

        if (!target) {
            print("[ProceduralRoom] WARNING: solvability fallback found no free spot for goldKey.");
            return;
        }

        spawnPickupInSpot(goldKey, target, false, "goldKey");
        removeSpotFromFreeList(target, freeItemSpots);
        print("[ProceduralRoom] Solvability fallback: placed a reachable goldKey.");
    }

    private allowRoomObject(obj: RoomObjectDef): boolean {
        const ps = global.persistentStorage;
        if (!ps) return true;

        if (ps.getUnlockAllProgressionSpawns?.()) {
            return true;
        }

        if (obj.id === "clock") {
            return typeof ps.hasPlayedFirstGame === "function" ? ps.hasPlayedFirstGame() : true;
        }
        if (obj.id === "codeSafe") {
            const played = typeof ps.hasPlayedFirstGame === "function" ? ps.hasPlayedFirstGame() : true;
            const rounds = typeof ps.getStat === "function" ? ps.getStat("roundPlayed") : 0;
            return played && (rounds ?? 0) > 3;
        }
        return true;
    }

    private buildRotationForDoor(doorData: HexenfurtExitDoor): quat {
        const n = (doorData && doorData.normal ? doorData.normal : vec3.forward()).normalize();
        let worldUp = vec3.up();
        if (Math.abs(n.dot(worldUp)) > 0.99) worldUp = vec3.right();

        const lookDir = n.cross(worldUp).normalize();
        const wallRot = quat.lookAt(lookDir, n);

        const fixStandUpright = quat.fromEulerAngles(-Math.PI / 2, 0, 0);
        let rot = wallRot.multiply(fixStandUpright);
        rot = rot.multiply(quat.fromEulerAngles(Math.PI / 2, 0, 0));
        return rot;
    }

    private createEscapeDoor(doorData: HexenfurtExitDoor): SceneObject {
        const flow = this.gameFlow as unknown as GameFlowFinalize;
        const escapeDoorObject = this.escapeDoor.instantiate(flow.poiRoot);
        const rot = this.buildRotationForDoor(doorData);
        escapeDoorObject.getTransform().setWorldPosition(doorData.position);
        escapeDoorObject.getTransform().setWorldRotation(rot);
        this.markArchiveObjectSeen("door");
        return escapeDoorObject;
    }

    private shuffle<T>(a: T[]): void {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
    }
}
