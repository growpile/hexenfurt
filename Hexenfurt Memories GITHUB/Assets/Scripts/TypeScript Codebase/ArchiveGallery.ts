// Room-object / decoration archive compendium (separate from LoreGallery).

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const SliderModule = require("SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider");
const InteractableModule = require("SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable");
const SLIDER_TYPE_NAME: string = SliderModule.Slider.getTypeName();
const INTERACTABLE_TYPE_NAME: string = InteractableModule.Interactable.getTypeName();
const COLLIDER_TYPE_NAME = "Component.ColliderComponent";

type ProgressSliderApi = {
    initialized?: boolean;
    inactive?: boolean;
    updateCurrentValue: (value: number, shouldAnimate?: boolean) => void;
    interactable?: { enabled: boolean };
};

const NOT_FOUND_TEXT = "Play more to find this object.";

@typedef
export class ArchiveGalleryEntry {
    @input
    @label("Object ID")
    objectId: string = "";

    @input
    @label("Object Prefab")
    objectPrefab!: ObjectPrefab;

    @input
    @label("Description")
    @widget(new TextAreaWidget())
    description: string = "";
}

@component
export class ArchiveGallery extends BaseScriptComponent {
    private static readonly ORIGIN_ROTATION_MIN_DEG = -5;
    private static readonly ORIGIN_ROTATION_MAX_DEG = 5;
    private static readonly DESC_SWAP_DELAY_ID = "archiveGalleryDescSwap";

    @ui.group_start("<span style='color: #60A5FA;'>Catalog</span>")
    @input
    @label("Archive Entries")
    public entries: ArchiveGalleryEntry[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Display</span>")
    @input
    @hint("Parent transform where the current catalog prefab is instantiated.")
    public objectDisplayRoot!: SceneObject;

    @input
    @hint("Description line for the current catalog entry.")
    public objectDescription!: Text;

    @input
    @label("Not Seen Icon")
    @hint("Shown (scale 1) when the current entry is not yet found; hidden (scale 0) when found.")
    public notSeenIcon!: SceneObject;

    @input
    @hint("Seconds to fade description text in or out.")
    public descriptionFadeDuration: number = 0.45;

    @input
    @hint("Pause (s) after fade-out before swapping text and fading in.")
    public descriptionSwapDelay: number = 0.1;

    @input
    @label("Object Progress Bar")
    @allowUndefined
    @hint("UIKit Slider; fill is seen catalog objects / total entries (0–1).")
    public objectProgressBar: ScriptComponent | null = null;

    @input
    @label("Object Count Text")
    @allowUndefined
    @hint('Shows "Objects Found X/totalCount" for archive discovery progress.')
    public objectCountText: Text | null = null;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Presentation</span>")
    @input
    @hint("Slide-in duration when opening the archive panel.")
    public showDuration: number = 0.5;

    @input
    @hint("Hidden Y offset for the sliding panel child.")
    public hiddenOffsetY: number = 60;

    @input
    @hint("Seconds for one full -5° → +5° → -5° Y sweep on the display Origin.")
    public rotationCycleDuration: number = 6;

    @input
    @hint("Seconds to scale catalog objects in/out (0 → 1 on show, 1 → 0 before swap).")
    public objectScaleDuration: number = 0.35;

    @input
    @hint("Horizontal slide distance (local X) when switching catalog entries.")
    public entrySlideUnits: number = 80;

    @input
    @hint("Duration (s) for entry swap: slide + scale run together on exit and enter.")
    public entrySlideDuration: number = 0.5;
    @ui.group_end

    public hidden: boolean = true;
    public animating: boolean = false;

    private currentIndex: number = 0;
    private panelLine!: SceneObject;
    /** Active catalog object under Origin. */
    private displayedInstance: SceneObject | null = null;
    /** Pre-instantiated neighbors (prev/next) kept disabled for fast swaps. */
    private entryInstancePool: { [index: number]: SceneObject } = {};
    private descriptionTextTween: any = null;
    private rotationAnimEvent: SceneEvent | null = null;
    private rotatingTransform: Transform | null = null;
    private originBaseLocalPosition: vec3 | null = null;
    private originBaseLocalRotation: quat | null = null;
    private panelLineShownLocalPos: vec3 = new vec3(0, 0, 0);
    private rotationAnimBaseQuat: quat = quat.quatIdentity();
    private rotationAnimStartTime: number = 0;
    private entryTransitioning: boolean = false;
    private scaleAnimEvent: SceneEvent | null = null;
    private notSeenIconScaleEvent: SceneEvent | null = null;
    private entryCrossfadeEvent: SceneEvent | null = null;
    private originSlideEvent: SceneEvent | null = null;

    onAwake(): void {
        // Script lives on "Archive Line"; Origin is a child and must keep its scene pose.
        this.panelLine = this.getSceneObject();
        this.panelLineShownLocalPos = this.panelLine.getTransform().getLocalPosition();
        this.captureOriginBasePose();
        this.preparePanelHidden();
        this.registerArchiveIds();
        this.configureProgressSliderReadOnly();
        this.updateObjectProgressDisplay();
        this.createEvent("OnStartEvent").bind(() => {
            this.configureProgressSliderReadOnly();
            this.waitForProgressSliderReady(0);
        });
    }

    /** Snapshot the display Origin rest pose from the scene (slide + rotation offsets use this). */
    private captureOriginBasePose(): void {
        if (!this.objectDisplayRoot) return;
        const tr = this.objectDisplayRoot.getTransform();
        if (!this.originBaseLocalPosition) this.originBaseLocalPosition = tr.getLocalPosition();
        if (!this.originBaseLocalRotation) this.originBaseLocalRotation = tr.getLocalRotation();
    }

    private getOriginRestLocalPosition(): vec3 {
        if (this.originBaseLocalPosition) return this.originBaseLocalPosition;
        if (!this.objectDisplayRoot) return new vec3(0, 0, 0);
        return this.objectDisplayRoot.getTransform().getLocalPosition();
    }

    private preparePanelHidden(): void {
        const tr = this.panelLine.getTransform();
        const lp = tr.getLocalPosition();
        tr.setLocalPosition(new vec3(lp.x, this.hiddenOffsetY, lp.z));
        if (this.objectDisplayRoot) this.objectDisplayRoot.enabled = false;
        this.setNotSeenIconScale(vec3.zero());
    }

    private registerArchiveIds(): void {
        const ids: string[] = [];
        for (let i = 0; i < this.entries.length; i++) {
            const id = this.entries[i]?.objectId;
            if (id) ids.push(id);
        }
        if (global.persistentStorage && typeof global.persistentStorage.registerArchiveObjectIds === "function") {
            global.persistentStorage.registerArchiveObjectIds(ids);
        }
    }

    /** Opens the archive compendium (button callback). */
    public showCompendium(): void {
        if (this.animating) return;
        print("Showing Archive");
        this.configureProgressSliderReadOnly();
        this.animating = true;
        this.stopNotSeenIconScaleAnim();
        this.setNotSeenIconScale(vec3.zero());
        if (this.objectDisplayRoot) this.objectDisplayRoot.enabled = true;
        this.currentIndex = 0;
        this.updateObjectProgressDisplay();
        this.showEntryAt(this.currentIndex);

        global.utils.animatePosition(this.panelLine, true, this.panelLineShownLocalPos, this.showDuration, () => {
            this.animating = false;
            this.hidden = false;
            this.updateNotSeenIcon(this.currentIndex, this.objectScaleDuration, false);
            this.updateObjectProgressDisplay();
        });
    }

    /** Closes the archive compendium (button callback). */
    public hideCompendium(): void {
        if (this.animating && this.hidden) return;
        this.animating = true;
        this.hidden = true;
        this.stopNotSeenIconScaleAnim();
        this.setNotSeenIconScale(vec3.zero());

        const finishPanelHide = (): void => {
            const lp = this.panelLine.getTransform().getLocalPosition();
            const hiddenPos = new vec3(lp.x, this.hiddenOffsetY, lp.z);
            global.utils.animatePosition(this.panelLine, true, hiddenPos, this.showDuration, () => {
                if (this.objectDisplayRoot) this.objectDisplayRoot.enabled = false;
                this.animating = false;
                this.entryTransitioning = false;
            });
        };

        let pending = 0;
        const onContentHideDone = (): void => {
            pending--;
            if (pending > 0) return;
            finishPanelHide();
        };

        pending++;
        this.fadeOutAndResetDescription(onContentHideDone);

        pending++;
        if (this.displayedInstance) {
            this.entryTransitioning = true;
            this.scaleDownAndDestroyDisplayedObject(onContentHideDone);
        } else {
            this.clearDisplayedObject();
            onContentHideDone();
        }
    }

    public archiveNext(): void {
        if (this.hidden || this.animating || this.entryTransitioning || !this.entries.length) return;
        this.currentIndex = this.wrapIndex(this.currentIndex + 1, this.entries.length);
        this.showEntryAt(this.currentIndex, 1);
        global.soundManager.playSound("loreSlide", 1);
    }

    public archivePrev(): void {
        if (this.hidden || this.animating || this.entryTransitioning || !this.entries.length) return;
        this.currentIndex = this.wrapIndex(this.currentIndex - 1, this.entries.length);
        this.showEntryAt(this.currentIndex, -1);
        global.soundManager.playSound("loreSlide", 1);
    }

    private wrapIndex(i: number, n: number): number {
        return ((i % n) + n) % n;
    }

    /** @param navigateDir 1 = next (exit left, enter from right), -1 = prev, 0 = no horizontal slide */
    private showEntryAt(index: number, navigateDir: number = 0): void {
        if (!this.entries.length || this.entryTransitioning) return;
        const entry = this.entries[index];
        if (!entry) return;

        this.entryTransitioning = true;
        this.stopDescriptionAnim();
        if (!this.hidden) {
            const iconDuration = navigateDir !== 0 ? this.entrySlideDuration : this.objectScaleDuration;
            const iconSwitch = navigateDir !== 0 || this.displayedInstance !== null;
            this.updateNotSeenIcon(index, iconDuration, iconSwitch);
        }

        const finish = (): void => {
            this.syncNeighborPool(this.currentIndex);
            this.entryTransitioning = false;
        };

        if (navigateDir !== 0 && this.objectDisplayRoot) {
            this.transitionDescriptionTo(this.descriptionTextForIndex(index));
            this.transitionToEntry(this.currentIndex, navigateDir, finish);
            return;
        }

        if (this.displayedInstance) {
            this.scaleDownAndDestroyDisplayedObject(() => {
                this.presentEntry(this.currentIndex, 0, finish);
            });
        } else {
            this.presentEntry(this.currentIndex, 0, finish);
        }
    }

    private isEntryFound(index: number): boolean {
        const entry = this.entries[index];
        if (!entry || !entry.objectPrefab || !this.objectDisplayRoot) return false;
        return global.persistentStorage.hasSeenArchiveObject(entry.objectId);
    }

    private getCatalogEntryCount(): number {
        let count = 0;
        for (let i = 0; i < this.entries.length; i++) {
            const id = this.entries[i]?.objectId;
            if (id && id.trim().length > 0) {
                count++;
            }
        }
        return count;
    }

    private getSeenCatalogEntryCount(): number {
        if (!global.persistentStorage || typeof global.persistentStorage.hasSeenArchiveObject !== "function") {
            return 0;
        }
        let seen = 0;
        for (let i = 0; i < this.entries.length; i++) {
            const id = this.entries[i]?.objectId;
            if (!id || id.trim().length === 0) {
                continue;
            }
            if (global.persistentStorage.hasSeenArchiveObject(id)) {
                seen++;
            }
        }
        return seen;
    }

    /** Progress bar is display-only; block drag, track taps, and collider hits. */
    private configureProgressSliderReadOnly(): void {
        const slider = this.getProgressSlider();
        if (slider) {
            slider.inactive = true;
            if (slider.interactable) {
                slider.interactable.enabled = false;
            }
        }

        const root = this.objectProgressBar?.getSceneObject();
        if (root) {
            this.setSceneObjectInteractionEnabled(root, false);
        }
    }

    private waitForProgressSliderReady(attempt: number): void {
        const slider = this.getProgressSlider();
        if (slider?.initialized || slider?.interactable) {
            this.configureProgressSliderReadOnly();
            this.updateObjectProgressDisplay();
            return;
        }
        if (attempt >= 80) {
            this.configureProgressSliderReadOnly();
            return;
        }
        const defer = this.createEvent("DelayedCallbackEvent");
        defer.bind(() => this.waitForProgressSliderReady(attempt + 1));
        defer.reset(0.05);
    }

    private setSceneObjectInteractionEnabled(root: SceneObject, enabled: boolean): void {
        const stack: SceneObject[] = [root];
        let depth = 0;
        const maxDepth = 12;

        while (stack.length > 0 && depth <= maxDepth) {
            const count = stack.length;
            for (let i = 0; i < count; i++) {
                const so = stack.pop();
                if (!so) continue;

                const interactable = (so as any).getComponent(INTERACTABLE_TYPE_NAME) as { enabled?: boolean } | null;
                if (interactable && typeof interactable.enabled === "boolean") {
                    interactable.enabled = enabled;
                }

                const collider = (so as any).getComponent(COLLIDER_TYPE_NAME) as { enabled?: boolean } | null;
                if (collider && typeof collider.enabled === "boolean") {
                    collider.enabled = enabled;
                }

                const childCount = so.getChildrenCount();
                for (let c = 0; c < childCount; c++) {
                    stack.push(so.getChild(c));
                }
            }
            depth++;
        }
    }

    private getProgressSlider(): ProgressSliderApi | null {
        if (!this.objectProgressBar) {
            return null;
        }
        const so = this.objectProgressBar.getSceneObject();
        const comp = (so as any).getComponent(SLIDER_TYPE_NAME);
        if (comp) {
            return comp as ProgressSliderApi;
        }
        return this.objectProgressBar as unknown as ProgressSliderApi;
    }

    /** Updates the progress bar (0–1) and "Objects Found X/total" label from persistent storage. */
    private updateObjectProgressDisplay(): void {
        const totalCount = this.getCatalogEntryCount();
        const seenCount = this.getSeenCatalogEntryCount();
        const normalized = totalCount > 0 ? seenCount / totalCount : 0;

        if (this.objectCountText) {
            this.objectCountText.text = "Objects Found " + seenCount + "/" + totalCount;
        }

        const slider = this.getProgressSlider();
        if (slider && typeof slider.updateCurrentValue === "function") {
            slider.updateCurrentValue(Math.min(1, Math.max(0, normalized)), false);
        }
    }

    private notSeenIconScaleForIndex(index: number): vec3 {
        return this.isEntryFound(index) ? vec3.zero() : new vec3(1, 1, 1);
    }

    private setNotSeenIconScale(scale: vec3): void {
        if (!this.notSeenIcon) return;
        this.notSeenIcon.getTransform().setLocalScale(scale);
    }

    private stopNotSeenIconScaleAnim(): void {
        if (this.notSeenIconScaleEvent) {
            this.notSeenIconScaleEvent.enabled = false;
            this.notSeenIconScaleEvent = null;
        }
    }

    private updateNotSeenIcon(index: number, durationSec: number, useSwitchPulse: boolean = false): void {
        if (!this.notSeenIcon) return;
        const target = this.notSeenIconScaleForIndex(index);
        const tr = this.notSeenIcon.getTransform();
        const dur = Math.max(0.05, durationSec);

        if (useSwitchPulse) {
            const half = dur * 0.5;
            this.animateNotSeenIconScale(tr, vec3.zero(), half, false, () => {
                this.animateNotSeenIconScale(tr, target, half, false);
            });
            return;
        }

        this.animateNotSeenIconScale(tr, target, dur, false);
    }

    private animateNotSeenIconScale(
        tr: Transform,
        targetScale: vec3,
        duration: number,
        useOvershoot: boolean,
        onDone?: () => void
    ): void {
        this.stopNotSeenIconScaleAnim();
        const from = tr.getLocalScale();
        const startTime = getTime();
        const dur = Math.max(0.05, duration);

        const ev = this.createEvent("UpdateEvent");
        this.notSeenIconScaleEvent = ev;
        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            const eased = useOvershoot ? this.easeBackOut(t, 0.12) : this.easeInOutCubic(t);
            tr.setLocalScale(vec3.lerp(from, targetScale, eased));
            if (t >= 1) {
                tr.setLocalScale(targetScale);
                ev.enabled = false;
                this.notSeenIconScaleEvent = null;
                if (onDone) onDone();
            }
        });
    }

    private getPoolInstance(index: number): SceneObject | null {
        return this.entryInstancePool[index] ?? null;
    }

    private createPoolInstance(index: number): SceneObject | null {
        if (!this.isEntryFound(index)) return null;
        const entry = this.entries[index];
        const so = entry.objectPrefab.instantiate(this.objectDisplayRoot);
        const tr = so.getTransform();
        tr.setLocalPosition(vec3.zero());
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(vec3.zero());
        so.enabled = false;
        this.entryInstancePool[index] = so;
        return so;
    }

    private ensurePoolInstance(index: number): SceneObject | null {
        return this.getPoolInstance(index) ?? this.createPoolInstance(index);
    }

    private destroyPoolInstance(index: number): void {
        const so = this.entryInstancePool[index];
        if (!so) return;
        if (this.displayedInstance === so) this.displayedInstance = null;
        so.destroy();
        delete this.entryInstancePool[index];
    }

    private clearEntryPool(): void {
        for (let i = 0; i < this.entries.length; i++) {
            this.destroyPoolInstance(i);
        }
        this.entryInstancePool = {};
        this.displayedInstance = null;
    }

    private setPoolSlotVisible(index: number, visible: boolean): void {
        const so = this.ensurePoolInstance(index);
        if (!so) return;
        so.enabled = visible;
        so.getTransform().setLocalScale(visible ? new vec3(1, 1, 1) : vec3.zero());
        if (visible) this.displayedInstance = so;
    }

    private hidePoolExcept(activeIndex: number | null): void {
        for (let i = 0; i < this.entries.length; i++) {
            const so = this.entryInstancePool[i];
            if (!so) continue;
            if (activeIndex !== null && i === activeIndex) continue;
            so.enabled = false;
            so.getTransform().setLocalScale(vec3.zero());
            if (this.displayedInstance === so) this.displayedInstance = null;
        }
    }

    /** Keeps current + prev/next instantiated; neighbors stay disabled at scale 0. */
    private syncNeighborPool(centerIndex: number): void {
        const n = this.entries.length;
        if (!n || !this.objectDisplayRoot) return;

        const keep: number[] = [centerIndex];
        if (n > 1) {
            keep.push(this.wrapIndex(centerIndex - 1, n));
            keep.push(this.wrapIndex(centerIndex + 1, n));
        }

        for (let i = 0; i < n; i++) {
            if (keep.indexOf(i) < 0) this.destroyPoolInstance(i);
        }

        this.hidePoolExcept(null);

        for (let k = 0; k < keep.length; k++) {
            const idx = keep[k];
            if (!this.isEntryFound(idx)) {
                this.destroyPoolInstance(idx);
                continue;
            }
            if (idx === centerIndex) {
                this.setPoolSlotVisible(idx, true);
            } else {
                const so = this.ensurePoolInstance(idx);
                if (so) {
                    so.enabled = false;
                    so.getTransform().setLocalScale(vec3.zero());
                }
            }
        }
    }

    private transitionToEntry(targetIndex: number, navigateDir: number, onDone: () => void): void {
        const entry = this.entries[targetIndex];
        if (!entry) {
            onDone();
            return;
        }

        if (!this.isEntryFound(targetIndex)) {
            const outgoing = this.displayedInstance;
            const finishNotFound = (): void => {
                this.hidePoolExcept(null);
                if (outgoing) {
                    outgoing.enabled = false;
                    outgoing.getTransform().setLocalScale(vec3.zero());
                }
                if (this.displayedInstance === outgoing) {
                    this.displayedInstance = null;
                }
                this.ensureRotationAnim();
                onDone();
            };
            if (navigateDir !== 0) {
                if (outgoing) {
                    this.slideToNotFoundWithObject(navigateDir, outgoing, finishNotFound);
                } else {
                    this.slideOriginOutThenIn(navigateDir, finishNotFound);
                }
                return;
            }
            this.presentEntry(targetIndex, navigateDir, onDone);
            return;
        }

        const incoming = this.ensurePoolInstance(targetIndex);
        if (!incoming) {
            this.presentEntry(targetIndex, navigateDir, onDone);
            return;
        }

        const outgoing = this.displayedInstance;
        if (outgoing && outgoing !== incoming) {
            this.crossfadePooledEntries(navigateDir, outgoing, incoming, onDone);
            return;
        }

        this.activatePooledEntryWithSlide(targetIndex, navigateDir, entry, onDone);
    }

    /** Outgoing and incoming slide/scale together on child local X (no sequential exit-then-enter gap). */
    private crossfadePooledEntries(
        navigateDir: number,
        outgoing: SceneObject,
        incoming: SceneObject,
        onDone: () => void
    ): void {
        const dur = this.entrySlideDuration;
        const slide = Math.max(0, this.entrySlideUnits);
        const outTr = outgoing.getTransform();
        const inTr = incoming.getTransform();

        this.stopScaleAnim();
        this.stopEntryCrossfadeAnim();
        this.resetOriginToRestPosition();

        incoming.enabled = true;
        outgoing.enabled = true;
        this.displayedInstance = incoming;
        this.ensureRotationAnim();

        const outFromPos = outTr.getLocalPosition();
        const outFromScale = outTr.getLocalScale();
        const outToPos = new vec3(-navigateDir * slide, 0, 0);
        const outToScale = vec3.zero();
        const inFromPos = new vec3(navigateDir * slide, 0, 0);
        const inToPos = vec3.zero();
        const inFromScale = vec3.zero();
        const inToScale = new vec3(1, 1, 1);

        outTr.setLocalRotation(quat.quatIdentity());
        inTr.setLocalPosition(inFromPos);
        inTr.setLocalRotation(quat.quatIdentity());
        inTr.setLocalScale(inFromScale);

        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.entryCrossfadeEvent = ev;
        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / Math.max(0.05, dur), 1);
            const slideEased = this.easeInOutCubic(t);
            const inScaleEased = this.easeBackOut(t, 0.12);

            outTr.setLocalPosition(vec3.lerp(outFromPos, outToPos, slideEased));
            outTr.setLocalScale(vec3.lerp(outFromScale, outToScale, slideEased));
            inTr.setLocalPosition(vec3.lerp(inFromPos, inToPos, slideEased));
            inTr.setLocalScale(vec3.lerp(inFromScale, inToScale, inScaleEased));

            if (t >= 1) {
                outgoing.enabled = false;
                outTr.setLocalScale(vec3.zero());
                outTr.setLocalPosition(vec3.zero());
                inTr.setLocalPosition(inToPos);
                inTr.setLocalScale(inToScale);
                ev.enabled = false;
                this.removeEvent(ev);
                this.entryCrossfadeEvent = null;
                onDone();
            }
        });
    }

    private stopEntryCrossfadeAnim(): void {
        if (this.entryCrossfadeEvent) {
            this.entryCrossfadeEvent.enabled = false;
            this.removeEvent(this.entryCrossfadeEvent);
            this.entryCrossfadeEvent = null;
        }
    }

    private activatePooledEntryWithSlide(
        index: number,
        navigateDir: number,
        entry: ArchiveGalleryEntry,
        onDone: () => void
    ): void {
        const incoming = this.ensurePoolInstance(index);
        if (!incoming) {
            onDone();
            return;
        }

        this.hidePoolExcept(index);
        incoming.enabled = true;
        this.displayedInstance = incoming;

        const tr = incoming.getTransform();
        tr.setLocalPosition(vec3.zero());
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(vec3.zero());
        this.ensureRotationAnim();

        const base = this.getOriginRestLocalPosition();
        const slide = Math.max(0, this.entrySlideUnits);
        const enterX = base.x + navigateDir * slide;
        this.objectDisplayRoot.getTransform().setLocalPosition(new vec3(enterX, base.y, base.z));

        const dur = this.entrySlideDuration;
        let scaleDone = false;
        let slideDone = false;
        const finish = (): void => {
            if (!scaleDone || !slideDone) return;
            onDone();
        };

        this.animateOriginLocalPosition(base, dur, () => {
            slideDone = true;
            finish();
        });
        this.animateLocalScale(tr, new vec3(1, 1, 1), dur, true, () => {
            scaleDone = true;
            finish();
        });
    }

    /** One duration: origin exits then enters (for empty / not-found slots). */
    private slideOriginOutThenIn(navigateDir: number, onDone: () => void): void {
        if (!this.objectDisplayRoot) {
            onDone();
            return;
        }

        this.stopOriginSlideAnim();
        const base = this.getOriginRestLocalPosition();
        const slide = Math.max(0, this.entrySlideUnits);
        const exitPos = new vec3(base.x - navigateDir * slide, base.y, base.z);
        const enterPos = new vec3(base.x + navigateDir * slide, base.y, base.z);
        const tr = this.objectDisplayRoot.getTransform();
        const dur = Math.max(0.05, this.entrySlideDuration);
        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.originSlideEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            if (t < 0.5) {
                const u = this.easeInOutCubic(t / 0.5);
                tr.setLocalPosition(vec3.lerp(base, exitPos, u));
            } else {
                const u = this.easeInOutCubic((t - 0.5) / 0.5);
                tr.setLocalPosition(vec3.lerp(enterPos, base, u));
            }
            if (t >= 1) {
                tr.setLocalPosition(base);
                ev.enabled = false;
                this.removeEvent(ev);
                this.originSlideEvent = null;
                onDone();
            }
        });
    }

    /**
     * Same outgoing slide/scale as crossfadePooledEntries (full entrySlideDuration, origin at rest).
     */
    private animatePooledObjectSlideOut(
        outgoing: SceneObject,
        navigateDir: number,
        onDone: () => void
    ): void {
        const dur = Math.max(0.05, this.entrySlideDuration);
        const slide = Math.max(0, this.entrySlideUnits);
        const outTr = outgoing.getTransform();
        const outFromPos = outTr.getLocalPosition();
        const outFromScale = outTr.getLocalScale();
        const outToPos = new vec3(-navigateDir * slide, 0, 0);

        this.stopScaleAnim();
        this.stopEntryCrossfadeAnim();
        outTr.setLocalRotation(quat.quatIdentity());

        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.entryCrossfadeEvent = ev;
        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            const slideEased = this.easeInOutCubic(t);

            outTr.setLocalPosition(vec3.lerp(outFromPos, outToPos, slideEased));
            outTr.setLocalScale(vec3.lerp(outFromScale, vec3.zero(), slideEased));

            if (t >= 1) {
                outTr.setLocalPosition(outToPos);
                outTr.setLocalScale(vec3.zero());
                ev.enabled = false;
                this.removeEvent(ev);
                this.entryCrossfadeEvent = null;
                onDone();
            }
        });
    }

    /** Seen → locked: object exits like a crossfade outgoing; origin stays centered. */
    private slideToNotFoundWithObject(navigateDir: number, outgoing: SceneObject, onDone: () => void): void {
        if (!this.objectDisplayRoot) {
            onDone();
            return;
        }

        this.stopOriginSlideAnim();
        this.resetOriginToRestPosition();
        this.animatePooledObjectSlideOut(outgoing, navigateDir, onDone);
    }

    private slideEntryIn(navigateDir: number, onDone: () => void): void {
        const base = this.getOriginRestLocalPosition();
        const slide = Math.max(0, this.entrySlideUnits);
        const enterX = base.x + navigateDir * slide;
        const tr = this.objectDisplayRoot.getTransform();
        tr.setLocalPosition(new vec3(enterX, base.y, base.z));
        this.animateOriginLocalPosition(base, this.entrySlideDuration, onDone);
    }

    private presentEntry(index: number, navigateDir: number, onDone: () => void): void {
        const entry = this.entries[index];
        if (!entry) {
            onDone();
            return;
        }

        if (this.isEntryFound(index)) {
            if (navigateDir !== 0) {
                this.activatePooledEntryWithSlide(index, navigateDir, entry, onDone);
            } else {
                this.spawnFoundEntry(index, entry, onDone);
            }
            return;
        }

        this.hidePoolExcept(null);
        this.ensureRotationAnim();
        const finish = (): void => {
            if (navigateDir !== 0) {
                onDone();
                return;
            }
            this.transitionDescriptionTo(NOT_FOUND_TEXT, onDone);
        };
        if (navigateDir !== 0) {
            this.slideEntryIn(navigateDir, finish);
        } else {
            this.resetOriginToRestPosition();
            finish();
        }
    }

    private resetOriginToRestPosition(): void {
        this.stopOriginSlideAnim();
        if (!this.objectDisplayRoot) return;
        const base = this.getOriginRestLocalPosition();
        this.objectDisplayRoot.getTransform().setLocalPosition(base);
    }

    private spawnFoundEntry(index: number, entry: ArchiveGalleryEntry, onDone: () => void): void {
        this.hidePoolExcept(null);
        const so = this.ensurePoolInstance(index);
        if (!so) {
            onDone();
            return;
        }

        this.hidePoolExcept(index);
        so.enabled = true;
        this.displayedInstance = so;
        const tr = so.getTransform();
        tr.setLocalPosition(vec3.zero());
        tr.setLocalRotation(quat.quatIdentity());
        tr.setLocalScale(vec3.zero());

        this.ensureRotationAnim();
        this.animateLocalScale(tr, new vec3(1, 1, 1), this.objectScaleDuration, true, () => {
            this.transitionDescriptionTo(entry.description || "", onDone);
        });
    }

    private scaleDownDisplayedObject(onDone: () => void): void {
        if (!this.displayedInstance) {
            onDone();
            return;
        }
        const tr = this.displayedInstance.getTransform();
        this.animateLocalScale(tr, vec3.zero(), this.objectScaleDuration, false, onDone);
    }

    private scaleDownAndDestroyDisplayedObject(onDone: () => void): void {
        if (!this.displayedInstance) {
            onDone();
            return;
        }

        this.haltRotationAnim();
        this.scaleDownDisplayedObject(() => {
            this.clearEntryPool();
            onDone();
        });
    }

    /** Keeps the Origin Y-sway running; does not reset phase or snap rotation on entry swap. */
    private ensureRotationAnim(): void {
        if (!this.objectDisplayRoot) return;
        if (this.rotationAnimEvent && this.rotatingTransform) {
            this.rotationAnimEvent.enabled = true;
            return;
        }
        this.beginRotationAnim();
    }

    private beginRotationAnim(): void {
        if (!this.objectDisplayRoot) return;

        this.captureOriginBasePose();
        const rotateTr = this.objectDisplayRoot.getTransform();
        this.rotatingTransform = rotateTr;
        this.rotationAnimBaseQuat = this.originBaseLocalRotation ?? rotateTr.getLocalRotation();
        this.rotationAnimStartTime = getTime();

        const period = Math.max(0.1, this.rotationCycleDuration);
        const minDeg = ArchiveGallery.ORIGIN_ROTATION_MIN_DEG;
        const maxDeg = ArchiveGallery.ORIGIN_ROTATION_MAX_DEG;
        const span = maxDeg - minDeg;

        const ev = this.createEvent("UpdateEvent");
        this.rotationAnimEvent = ev;
        ev.bind(() => {
            if (!this.rotatingTransform) return;
            const elapsed = getTime() - this.rotationAnimStartTime;
            const t01 = 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsed) / period);
            const sweepDeg = minDeg + span * t01;
            const sweepRad = sweepDeg * Math.PI / 180;
            const sweepRot = quat.fromEulerAngles(0, sweepRad, 0);
            this.rotatingTransform.setLocalRotation(this.rotationAnimBaseQuat.multiply(sweepRot));
        });
    }

    /** Stops sway and snaps Origin rotation back to the scene rest pose (e.g. on close). */
    private haltRotationAnim(): void {
        if (this.rotationAnimEvent) {
            this.rotationAnimEvent.enabled = false;
            this.removeEvent(this.rotationAnimEvent);
            this.rotationAnimEvent = null;
        }
        if (this.objectDisplayRoot && this.originBaseLocalRotation) {
            this.objectDisplayRoot.getTransform().setLocalRotation(this.originBaseLocalRotation);
        }
        this.rotatingTransform = null;
    }

    private stopOriginSlideAnim(): void {
        if (this.originSlideEvent) {
            this.originSlideEvent.enabled = false;
            this.removeEvent(this.originSlideEvent);
            this.originSlideEvent = null;
        }
    }

    private animateOriginLocalPosition(target: vec3, duration: number, onDone: () => void): void {
        if (!this.objectDisplayRoot) {
            onDone();
            return;
        }

        this.stopOriginSlideAnim();

        const tr = this.objectDisplayRoot.getTransform();
        const from = tr.getLocalPosition();
        const startTime = getTime();
        const dur = Math.max(0.05, duration);
        const ev = this.createEvent("UpdateEvent");
        this.originSlideEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            const eased = this.easeInOutCubic(t);
            tr.setLocalPosition(vec3.lerp(from, target, eased));
            if (t >= 1) {
                tr.setLocalPosition(target);
                ev.enabled = false;
                this.removeEvent(ev);
                this.originSlideEvent = null;
                onDone();
            }
        });
    }

    private clearDisplayedObject(): void {
        this.stopScaleAnim();
        this.stopEntryCrossfadeAnim();
        this.stopNotSeenIconScaleAnim();
        this.stopOriginSlideAnim();
        this.haltRotationAnim();
        this.clearEntryPool();
    }

    private stopScaleAnim(): void {
        if (this.scaleAnimEvent) {
            this.scaleAnimEvent.enabled = false;
            this.scaleAnimEvent = null;
        }
    }

    private animateLocalScale(
        tr: Transform,
        targetScale: vec3,
        duration: number,
        useOvershoot: boolean,
        onDone: () => void
    ): void {
        this.stopScaleAnim();
        const from = tr.getLocalScale();
        const startTime = getTime();
        const dur = Math.max(0.05, duration);

        const ev = this.createEvent("UpdateEvent");
        this.scaleAnimEvent = ev;
        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / dur, 1);
            const eased = useOvershoot ? this.easeBackOut(t, 0.12) : this.easeInOutCubic(t);
            tr.setLocalScale(vec3.lerp(from, targetScale, eased));
            if (t >= 1) {
                tr.setLocalScale(targetScale);
                ev.enabled = false;
                this.scaleAnimEvent = null;
                onDone();
            }
        });
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    private easeBackOut(t: number, overshoot: number): number {
        const c1 = 1 + overshoot;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    private descriptionTextForIndex(index: number): string {
        if (!this.isEntryFound(index)) return NOT_FOUND_TEXT;
        return this.entries[index]?.description || "";
    }

    private descriptionFadeMs(): number {
        return Math.max(1, this.descriptionFadeDuration * 1000);
    }

    private setDescriptionAlpha(alpha: number): void {
        if (!this.objectDescription) return;
        const a = Math.max(0, Math.min(1, alpha));
        const fill = this.objectDescription.textFill.color;
        fill.a = a;
        this.objectDescription.textFill.color = fill;
        const shadow = this.objectDescription.dropshadowSettings.fill.color;
        shadow.a = a;
        this.objectDescription.dropshadowSettings.fill.color = shadow;
        const outline = this.objectDescription.outlineSettings.fill.color;
        outline.a = a;
        this.objectDescription.outlineSettings.fill.color = outline;
    }

    private stopDescriptionAnim(): void {
        global.utils.invalidateDelay(ArchiveGallery.DESC_SWAP_DELAY_ID);
        if (this.descriptionTextTween) {
            try {
                this.descriptionTextTween.stop();
            } catch (e) {}
            this.descriptionTextTween = null;
        }
    }

    /** Fade description out, clear text, and leave alpha at 0 (e.g. when closing back to menu). */
    private fadeOutAndResetDescription(onDone?: () => void): void {
        this.stopDescriptionAnim();
        if (!this.objectDescription) {
            if (onDone) onDone();
            return;
        }

        const reset = (): void => {
            this.objectDescription.text = "";
            this.setDescriptionAlpha(0);
            if (onDone) onDone();
        };

        const hasVisibleText =
            (this.objectDescription.text || "").length > 0 &&
            this.objectDescription.textFill.color.a > 0.01;

        if (!hasVisibleText) {
            reset();
            return;
        }

        this.descriptionTextTween = LSTween.textAlphaTo(this.objectDescription, 0, this.descriptionFadeMs())
            .onComplete(() => {
                this.descriptionTextTween = null;
                reset();
            })
            .start();
    }

    /** Fade in only (first show or empty label). */
    private revealDescription(text: string, onDone?: () => void): void {
        this.stopDescriptionAnim();
        if (!this.objectDescription) {
            if (onDone) onDone();
            return;
        }

        this.objectDescription.text = text;
        this.setDescriptionAlpha(0);
        this.descriptionTextTween = LSTween.textAlphaFromTo(this.objectDescription, 0, 1, this.descriptionFadeMs())
            .onComplete(() => {
                this.descriptionTextTween = null;
                if (onDone) onDone();
            })
            .start();
    }

    /** Fade out → swap delay → instant text → fade in. */
    private transitionDescriptionTo(text: string, onDone?: () => void): void {
        this.stopDescriptionAnim();
        if (!this.objectDescription) {
            if (onDone) onDone();
            return;
        }

        const fadeMs = this.descriptionFadeMs();
        const swapDelay = Math.max(0, this.descriptionSwapDelay);
        const hasVisibleText =
            (this.objectDescription.text || "").length > 0 &&
            this.objectDescription.textFill.color.a > 0.01;

        const fadeIn = (): void => {
            this.descriptionTextTween = LSTween.textAlphaFromTo(this.objectDescription, 0, 1, fadeMs)
                .onComplete(() => {
                    this.descriptionTextTween = null;
                    if (onDone) onDone();
                })
                .start();
        };

        const afterSwapDelay = (): void => {
            global.utils.delay(ArchiveGallery.DESC_SWAP_DELAY_ID, swapDelay, () => {
                this.objectDescription.text = text;
                this.setDescriptionAlpha(0);
                fadeIn();
            });
        };

        if (!hasVisibleText) {
            this.revealDescription(text, onDone);
            return;
        }

        this.descriptionTextTween = LSTween.textAlphaTo(this.objectDescription, 0, fadeMs)
            .onComplete(() => {
                this.descriptionTextTween = null;
                afterSwapDelay();
            })
            .start();
    }
}
