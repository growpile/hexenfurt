// Locked key safe. Requires the configured inventoryItemName; init() returns the
// required item id so the spawner can chain a clue into it.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

const LSTween_KS = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_KS = require("LSTween.lspkg/TweenJS/Easing").Easing;

@component
export class KeySafeRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Safe Setup</font>"}
    @input
    public safeDoorInteractable!: ScriptComponent;

    @input
    public safeDoorOutline!: ScriptComponent;

    @input
    public safeDoor!: SceneObject;

    @input
    public safeHandle!: SceneObject;

    @input
    public inventoryItemName: string = "silverKey";
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
    @input
    public keyParent!: SceneObject;

    @input
    public silverKey!: SceneObject;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
    @input
    @label("Spots")
    public itemSpots: ItemSpot[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
    @input
    public testItems: boolean = false;

    @input
    public testSpot: number = 0;

    @input
    public testItem: number = 0;

    @input
    @allowUndefined
    public keyTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public noteTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public decoTestingPrefab: ObjectPrefab | null = null;
    // @ui {"widget":"group_end"}

    private safeDoorOpened: boolean = false;
    private isDoorShaking: boolean = false;
    private isHandleShaking: boolean = false;
    private doorRestRot: quat | null = null;
    private handleRestRot: quat | null = null;
    private readonly KEY_SCALE: vec3 = new vec3(1, 1, 1);

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();

            (this.safeDoorInteractable as any).onTriggerEnd.add(() => {
                if (!global.inventory.has(this.inventoryItemName)) {
                    global.hintSystem.showHint("lockedKeySafe");
                    global.soundManager.playSpatialSound(this.getSceneObject(), "safeLocked", 1, 1);
                    this.shakeSafeDoor();
                    this.shakeSafeHandle();
                    return;
                }
                if (this.safeDoorOpened) return;
                this.safeDoorOpened = true;

                global.utils.delay(0.5, () => {
                    global.soundManager.playSpatialSound(this.getSceneObject(), "lockUnlock", 1, 1);
                });

                const keyParentT = this.keyParent.getTransform();
                const silverKeyT = this.silverKey.getTransform();
                const ZERO = vec3.zero();
                const quadOut = Easing_KS.Quadratic.Out;

                const keyPos = keyParentT.getLocalPosition();
                const pushStart = new vec3(keyPos.x, 17.0, keyPos.z);
                const pushEnd = new vec3(keyPos.x, 12.0, keyPos.z);

                const scaleOnKey = LSTween_KS.scaleFromToLocal(keyParentT, ZERO, this.KEY_SCALE, 300).easing(quadOut);
                const pushKey = LSTween_KS.moveFromToLocal(keyParentT, pushStart, pushEnd, 300).easing(quadOut);
                const scaleOffKey = LSTween_KS.scaleFromToLocal(keyParentT, this.KEY_SCALE, ZERO, 300)
                    .easing(quadOut)
                    .onComplete(() => this.onUnlockComplete());

                scaleOnKey.chain(pushKey);
                pushKey.onComplete(() => {
                    this.spinSilverKey(silverKeyT, () => { scaleOffKey.start(); });
                });
                scaleOnKey.start();
            });
        });
    }

    public init = (): string => this.inventoryItemName;

    private onUnlockComplete(): void {
        (this.safeDoorInteractable as any).release();
        this.safeDoorOutline.enabled = false;

        global.persistentStorage.increaseStat("puzzlesSolved");
        global.persistentStorage.increaseStat("safesCracked");

        if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;

        this.spinSafeHandle(() => {
            global.soundManager.playSpatialSound(this.getSceneObject(), "safeDoorOpen", 1, 1);
            this.openSafeDoor();
        });
    }

    private spinKeyEase(t: number): number {
        const p1 = 250 / 700, p2 = 450 / 700;
        if (t <= p1) { const u = t / p1; return 0.35 * u * u; }
        if (t <= p2) { const u = (t - p1) / (p2 - p1); return 0.35 + 0.30 * u; }
        const u = (t - p2) / (1 - p2);
        return 0.65 + 0.35 * (1 - (1 - u) * (1 - u));
    }

    private spinSilverKey(silverKeyT: Transform, onDone: () => void): void {
        const startRot = silverKeyT.getLocalRotation();
        const axis = vec3.up();
        const deg = MathUtils.DegToRad;

        LSTween_KS.rawTween(700)
            .onUpdate((obj: { t: number }) => {
                const progress = this.spinKeyEase(obj.t);
                silverKeyT.setLocalRotation(quat.angleAxis(360 * progress * deg, axis).multiply(startRot));
            })
            .onComplete(onDone)
            .start();
    }

    private shakeSafeDoor(): void {
        if (this.isDoorShaking) return;
        this.isDoorShaking = true;
        const t = this.safeDoor.getTransform();
        if (this.doorRestRot === null) this.doorRestRot = t.getLocalRotation();
        const up = vec3.up();
        const deg = MathUtils.DegToRad;
        const s1 = LSTween_KS.rotateToLocal(t, quat.angleAxis(2 * deg, up).multiply(this.doorRestRot), 60).easing(Easing_KS.Quadratic.Out);
        const s2 = LSTween_KS.rotateToLocal(t, quat.angleAxis(-2 * deg, up).multiply(this.doorRestRot), 60).easing(Easing_KS.Quadratic.Out);
        const s3 = LSTween_KS.rotateToLocal(t, quat.angleAxis(1 * deg, up).multiply(this.doorRestRot), 50).easing(Easing_KS.Quadratic.Out);
        const settle = LSTween_KS.rotateToLocal(t, this.doorRestRot, 70)
            .easing(Easing_KS.Quadratic.Out)
            .onComplete(() => { this.isDoorShaking = false; });
        s1.chain(s2); s2.chain(s3); s3.chain(settle);
        s1.start();
    }

    private shakeSafeHandle(): void {
        if (this.isHandleShaking) return;
        this.isHandleShaking = true;
        const t = this.safeHandle.getTransform();
        if (this.handleRestRot === null) this.handleRestRot = t.getLocalRotation();
        const tiltAxis = vec3.forward();
        const deg = MathUtils.DegToRad;
        const wobble = 5 * deg;
        const s1 = LSTween_KS.rotateToLocal(t, quat.angleAxis(wobble, tiltAxis).multiply(this.handleRestRot), 55).easing(Easing_KS.Quadratic.Out);
        const s2 = LSTween_KS.rotateToLocal(t, quat.angleAxis(-wobble, tiltAxis).multiply(this.handleRestRot), 55).easing(Easing_KS.Quadratic.Out);
        const s3 = LSTween_KS.rotateToLocal(t, quat.angleAxis(3 * deg, tiltAxis).multiply(this.handleRestRot), 45).easing(Easing_KS.Quadratic.Out);
        const settle = LSTween_KS.rotateToLocal(t, this.handleRestRot, 65)
            .easing(Easing_KS.Quadratic.Out)
            .onComplete(() => { this.isHandleShaking = false; });
        s1.chain(s2); s2.chain(s3); s3.chain(settle);
        s1.start();
    }

    private spinSafeHandle(onComplete: () => void): void {
        const handleT = this.safeHandle.getTransform();
        const startRot = handleT.getLocalRotation();
        const axis = vec3.forward();
        const deg = MathUtils.DegToRad;

        LSTween_KS.rawTween(1100)
            .easing(Easing_KS.Cubic.InOut)
            .onUpdate((obj: { t: number }) => {
                handleT.setLocalRotation(quat.angleAxis(372 * obj.t * deg, axis).multiply(startRot));
            })
            .onComplete(() => {
                LSTween_KS.rawTween(220)
                    .easing(Easing_KS.Sinusoidal.Out)
                    .onUpdate((obj: { t: number }) => {
                        const angle = (372 - 12 * obj.t) * deg;
                        handleT.setLocalRotation(quat.angleAxis(angle, axis).multiply(startRot));
                    })
                    .onComplete(onComplete)
                    .start();
            })
            .start();
    }

    private openSafeDoor(): void {
        const doorT = this.safeDoor.getTransform();
        const closedRot = doorT.getLocalRotation();
        const e = closedRot.toEulerAngles();
        const openRot = quat.fromEulerAngles(e.x, -e.y - 175, e.z);
        const overshootRot = quat.slerp(closedRot, openRot, 1.03);

        const swing = LSTween_KS.rotateFromToLocal(doorT, closedRot, overshootRot, 600).easing(Easing_KS.Cubic.Out);
        const settle = LSTween_KS.rotateFromToLocal(doorT, overshootRot, openRot, 300)
            .easing(Easing_KS.Sinusoidal.InOut)
            .onComplete(() => { print("Safe Door Opened!"); });

        swing.chain(settle);
        swing.start();
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }
}
