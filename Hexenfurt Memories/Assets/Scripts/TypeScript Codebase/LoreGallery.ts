// Hanging-lore compendium. Exposes global.showCompendium, global.hideCompendium,
// and global.newlyAcquiredLore.

interface HangingLoreScript {
    loreId: string;
    stopHanging(): void;
    enabled: boolean;
    getSceneObject(): SceneObject;
}

@typedef
export class HangingLoreEntry {
    @input
    @label("Hanging Script")
    hangingScript!: ScriptComponent;

    @input("int", "0")
    @label("Offset X")
    offsetX: number = 0;
}

@typedef
export class StatNoteTextEntry {
    @input
    @label("Stat ID")
    statId: string = "";

    @input
    textComponent!: Text;

    @input
    suffix: string = "";

    @input
    @label("Is Float")
    isFloat: boolean = false;
}

interface LeaderboardSource {
    tryRetrieveRank(callback: (rank: number | null) => void): void;
}

@component
export class LoreGallery extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Lore Items</span>")
    @input
    @label("Hanging Lore Items")
    public hangingLoreItems: HangingLoreEntry[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Stat Notes</span>")
    @input
    @label("Stat Note Texts")
    public statNoteTexts: StatNoteTextEntry[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Leaderboard</span>")
    @input
    public leaderboardRankText!: Text;

    @input
    public supabaseTable!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Display</span>")
    @input
    @label("Not Seen Indicator")
    @hint("Shown (scale 1) when the current lore is not yet seen; hidden (scale 0) when seen.")
    public notSeenIndicator!: SceneObject;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Scroll</span>")
    @input
    public scrollDuration: number = 0.5;
    @ui.group_end

    public hidden: boolean = true;
    public animating: boolean = false;

    private currentIndex: number = 0;
    private loreLine!: SceneObject;
    private contentTransform!: Transform;
    private notSeenIndicatorScaleEvent: SceneEvent | null = null;

    private normalizeLoreId(id: string | null | undefined): string {
        // Delegate to PersistentStorage's canonical map so every system shares one
        // alias table. Fall back to a trim if storage isn't ready yet.
        const ps = global.persistentStorage;
        if (ps && typeof ps.normalizeLoreId === "function") {
            return ps.normalizeLoreId(id);
        }
        return (id || "").trim();
    }

    private debugPrintLoreSeenStateOnStart(): void {
        if (!global.persistentStorage || typeof global.persistentStorage.getSeenLoreList !== "function") {
            print("[LoreGallery Debug] persistentStorage unavailable.");
            return;
        }

        const seenListRaw = global.persistentStorage.getSeenLoreList() || [];
        const seenMap: { [id: string]: boolean } = {};
        const seenNormalized: string[] = [];
        for (let i = 0; i < seenListRaw.length; i++) {
            const id = this.normalizeLoreId(seenListRaw[i]);
            if (!id || seenMap[id]) continue;
            seenMap[id] = true;
            seenNormalized.push(id);
        }
        print("[LoreGallery Debug] seen lore ids (" + seenNormalized.length + "): " + JSON.stringify(seenNormalized));

        for (let i = 0; i < this.hangingLoreItems.length; i++) {
            const entry = this.hangingLoreItems[i];
            if (!entry || !entry.hangingScript) {
                print("[LoreGallery Debug] item[" + i + "]: missing hanging script");
                continue;
            }
            const hs = entry.hangingScript as unknown as HangingLoreScript;
            const rawId = hs.loreId || "";
            const normalizedId = this.normalizeLoreId(rawId);
            const isSeen = !!seenMap[normalizedId];
            print(
                "[LoreGallery Debug] item[" + i + "] raw='" + rawId + "' normalized='" + normalizedId + "' seen=" + isSeen
            );
        }
    }

    onAwake(): void {
        this.loreLine = this.getSceneObject().getChild(0);
        this.contentTransform = this.loreLine.getTransform();
        this.setNotSeenIndicatorScale(vec3.zero());

        const loreIds: string[] = [];
        for (let i = 0; i < this.hangingLoreItems.length; i++) {
            const entry = this.hangingLoreItems[i];
            if (!entry || !entry.hangingScript) continue;
            const hs = entry.hangingScript as unknown as HangingLoreScript;
            const id = this.normalizeLoreId(hs.loreId);
            if (id) loreIds.push(id);
        }
        if (global.persistentStorage && typeof global.persistentStorage.registerLoreIds === "function") {
            global.persistentStorage.registerLoreIds(loreIds);
        }

        global.newlyAcquiredLore = null;
        global.showCompendium = () => this.show();
        global.hideCompendium = () => this.hide();

        this.createEvent("OnStartEvent").bind(() => {
            const defer = this.createEvent("DelayedCallbackEvent");
            defer.bind(() => this.debugPrintLoreSeenStateOnStart());
            defer.reset(0.25);
        });
    }

    public show(): void {
        if (this.animating) return;
        this.animating = true;

        this.loreLine.enabled = true;
        this.loadDataFromStorage();

        const newPos = new vec3(0, 0, 0);
        global.utils.animatePosition(this.getSceneObject().getChild(0), true, newPos, 0.5, () => {
            this.animating = false;
            this.hidden = false;

            if (global.newlyAcquiredLore) {
                this.goToLoreId(global.newlyAcquiredLore, true);
                global.newlyAcquiredLore = null;
            } else {
                this.updateNotSeenIndicator(this.currentIndex, this.scrollDuration, false);
            }
        });
    }

    public hide(): void {
        this.animating = true;
        this.hidden = true;
        this.currentIndex = 0;
        this.stopNotSeenIndicatorScaleAnim();
        this.setNotSeenIndicatorScale(vec3.zero());

        const newPos = new vec3(0, 60, 0);
        global.utils.animatePosition(this.getSceneObject().getChild(0), true, newPos, 0.5, () => {
            this.loreLine.enabled = false;
            this.animating = false;
        });
    }

    public nextItem(): void {
        if (this.hidden || this.animating) return;
        this.goToIndex(this.currentIndex + 1);
    }

    public prevItem(): void {
        if (this.hidden || this.animating) return;
        this.goToIndex(this.currentIndex - 1);
    }

    private wrapIndex(i: number, n: number): number {
        return ((i % n) + n) % n;
    }

    private goToIndex(i: number, isNew?: boolean): void {
        if (!this.hangingLoreItems || this.hangingLoreItems.length === 0) return;
        this.animating = true;
        const prevIndex = this.currentIndex;
        this.currentIndex = this.wrapIndex(i, this.hangingLoreItems.length);
        const switchPulse = !this.hidden && prevIndex !== this.currentIndex;
        this.updateNotSeenIndicator(this.currentIndex, this.scrollDuration, switchPulse);

        const targetX = this.hangingLoreItems[this.currentIndex].offsetX;
        const lp = this.contentTransform.getLocalPosition();
        const targetPos = new vec3(-targetX, lp.y, lp.z);

        global.soundManager.playSound("loreSlide", 1);
        global.utils.animatePosition(this.getSceneObject().getChild(0), true, targetPos, this.scrollDuration || 0.5, () => {
            this.animating = false;
            if (isNew) global.soundManager.playSound("loreInspect", 1);
        });
    }

    private findIndexByLoreId(loreId: string): number {
        const targetId = this.normalizeLoreId(loreId);
        if (!targetId || !this.hangingLoreItems || this.hangingLoreItems.length === 0) return -1;
        for (let i = 0; i < this.hangingLoreItems.length; i++) {
            const entry = this.hangingLoreItems[i];
            if (!entry || !entry.hangingScript) continue;
            const hs = entry.hangingScript as unknown as HangingLoreScript;
            if (this.normalizeLoreId(hs.loreId) === targetId) return i;
        }
        return -1;
    }

    private goToLoreId(loreId: string, isNew?: boolean): boolean {
        const idx = this.findIndexByLoreId(loreId);
        if (idx >= 0) {
            this.goToIndex(idx, isNew);
            return true;
        }
        return false;
    }

    private enableCorrectLoreVisuals(loreList: string[]): void {
        const seen: { [id: string]: boolean } = {};
        for (let i = 0; i < loreList.length; i++) {
            const id = this.normalizeLoreId(loreList[i]);
            if (id) seen[id] = true;
        }

        if (!this.hangingLoreItems || this.hangingLoreItems.length === 0) {
            print("enableCorrectLoreVisuals: no hangingLoreItems configured.");
            return;
        }

        for (let h = 0; h < this.hangingLoreItems.length; h++) {
            const entry = this.hangingLoreItems[h];
            if (!entry || !entry.hangingScript) {
                print("enableCorrectLoreVisuals: missing hangingScript at index " + h);
                continue;
            }
            const hs = entry.hangingScript as unknown as HangingLoreScript;
            const so = hs.getSceneObject();
            const loreId = this.normalizeLoreId(hs.loreId);

            if (!so) {
                print("enableCorrectLoreVisuals: scene object missing at index " + h);
                continue;
            }

            let visual: SceneObject | null = null;
            try {
                const c0 = so.getChild(0);
                if (!c0) throw "Missing child(0)";
                visual = c0.getChild(1);
                if (!visual) throw "Missing child(1)";
            } catch (e) {
                print("enableCorrectLoreVisuals: can't resolve visual for index " + h + " (" + e + ")");
                continue;
            }

            const shouldEnable = !!seen[loreId];
            if (visual.enabled !== shouldEnable) {
                if (!shouldEnable) {
                    hs.stopHanging();
                    hs.enabled = false;
                }
                visual.enabled = shouldEnable;
            }
        }
    }

    private loadDataFromStorage(): void {
        const loreList = global.persistentStorage.getSeenLoreList();
        this.enableCorrectLoreVisuals(loreList);

        const stats = global.persistentStorage.getAllStats();
        for (let l = 0; l < this.statNoteTexts.length; l++) {
            const note = this.statNoteTexts[l];
            const statLoaded = stats[note.statId] ?? 0;
            if (note.isFloat) {
                note.textComponent.text = statLoaded.toFixed(2).toString() + note.suffix;
            } else {
                note.textComponent.text = statLoaded.toString() + note.suffix;
            }
        }

        this.checkRank();
    }

    private checkRank(): void {
        const lb = this.supabaseTable as unknown as LeaderboardSource;
        lb.tryRetrieveRank((arg) => {
            if (!arg) {
                this.leaderboardRankText.text = "UNAVAILABLE";
                global.utils.delay(2.5, () => this.checkRank());
            } else {
                this.leaderboardRankText.text = "#" + arg.toString();
            }
        });
    }

    private isLoreSeenAtIndex(index: number): boolean {
        const entry = this.hangingLoreItems[index];
        if (!entry || !entry.hangingScript) return false;
        const hs = entry.hangingScript as unknown as HangingLoreScript;
        const loreId = this.normalizeLoreId(hs.loreId);
        if (!loreId || !global.persistentStorage) return false;
        return global.persistentStorage.hasSeenLore(loreId);
    }

    private notSeenIndicatorScaleForIndex(index: number): vec3 {
        return this.isLoreSeenAtIndex(index) ? vec3.zero() : new vec3(1, 1, 1);
    }

    private setNotSeenIndicatorScale(scale: vec3): void {
        if (!this.notSeenIndicator) return;
        this.notSeenIndicator.getTransform().setLocalScale(scale);
    }

    private stopNotSeenIndicatorScaleAnim(): void {
        if (this.notSeenIndicatorScaleEvent) {
            this.notSeenIndicatorScaleEvent.enabled = false;
            this.notSeenIndicatorScaleEvent = null;
        }
    }

    private updateNotSeenIndicator(index: number, durationSec: number, useSwitchPulse: boolean = false): void {
        if (!this.notSeenIndicator) return;
        const target = this.notSeenIndicatorScaleForIndex(index);
        const tr = this.notSeenIndicator.getTransform();
        const dur = Math.max(0.05, durationSec);

        if (useSwitchPulse) {
            const half = dur * 0.5;
            this.animateNotSeenIndicatorScale(tr, vec3.zero(), half, () => {
                this.animateNotSeenIndicatorScale(tr, target, half);
            });
            return;
        }

        this.animateNotSeenIndicatorScale(tr, target, dur);
    }

    private animateNotSeenIndicatorScale(tr: Transform, targetScale: vec3, duration: number, onDone?: () => void): void {
        this.stopNotSeenIndicatorScaleAnim();
        const from = tr.getLocalScale();
        const startTime = getTime();
        const dur = Math.max(0.05, duration);

        const ev = this.createEvent("UpdateEvent");
        this.notSeenIndicatorScaleEvent = ev;
        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            const eased = this.easeInOutCubic(t);
            tr.setLocalScale(vec3.lerp(from, targetScale, eased));
            if (t >= 1) {
                tr.setLocalScale(targetScale);
                ev.enabled = false;
                this.notSeenIndicatorScaleEvent = null;
                if (onDone) onDone();
            }
        });
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}
