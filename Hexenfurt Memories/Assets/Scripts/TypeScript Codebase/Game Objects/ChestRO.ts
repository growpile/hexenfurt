// Locked chest. Requires inventoryItemName to open; init() returns the required
// item id so the spawner can chain a clue into it.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";
import { playShake, buildKeyInsert } from "./RoomObjectAnimations";

const LSTween_CR = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_CR = require("LSTween.lspkg/TweenJS/Easing").Easing;

@component
export class ChestRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Chest Setup</font>"}
    @input
    public chestInteractable!: ScriptComponent;

    @input
    public chestOutline!: ScriptComponent;

    @input
    public chestLid!: SceneObject;

    @input
    public inventoryItemName: string = "bronzeKey";
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
    @input
    public keyParent!: SceneObject;

    @input
    public bronzeKey!: SceneObject;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Lock Animation</font>"}
    @input
    public lockFull!: SceneObject;

    @input
    public lockLowerPart!: SceneObject;

    @input
    public lockUpperPart!: SceneObject;
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

    public chestOpened: boolean = false;

    private isLockShaking: boolean = false;
    private isLidShaking: boolean = false;
    private lockRestRotation: quat | null = null;
    private lidRestRotation: quat | null = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();
            this.bindInteraction();
        });
    }

    public init = (): string => this.inventoryItemName;

    private testItemSpots(): void {
        runTestItemSpots(this);
    }

    private shakeLock(): void {
        if (this.isLockShaking) return;
        this.isLockShaking = true;
        const t = this.lockFull.getTransform();
        if (this.lockRestRotation === null) this.lockRestRotation = t.getLocalRotation();
        playShake(
            t,
            this.lockRestRotation,
            vec3.forward(),
            [
                { angleDeg: 2, durationMs: 60 },
                { angleDeg: -2, durationMs: 60 },
                { angleDeg: 1.5, durationMs: 50 },
                { angleDeg: -1.5, durationMs: 50 },
            ],
            80,
            () => { this.isLockShaking = false; }
        );
    }

    private shakeLid(): void {
        if (this.isLidShaking) return;
        this.isLidShaking = true;
        const t = this.chestLid.getChild(0).getTransform();
        if (this.lidRestRotation === null) this.lidRestRotation = t.getLocalRotation();
        playShake(
            t,
            this.lidRestRotation,
            vec3.right(),
            [
                { angleDeg: 1, durationMs: 60 },
                { angleDeg: -1, durationMs: 60 },
                { angleDeg: 0.5, durationMs: 50 },
            ],
            70,
            () => { this.isLidShaking = false; }
        );
    }

    private openLid(): void {
        const lidChild = this.chestLid.getChild(0).getTransform();
        const closedRot = lidChild.getLocalRotation();
        const axis = vec3.right();
        const swingTarget = quat.angleAxis(-49 * MathUtils.DegToRad, axis).multiply(closedRot);
        const settleTarget = quat.angleAxis(-45 * MathUtils.DegToRad, axis).multiply(closedRot);

        const lidSwing = LSTween_CR.rotateFromToLocal(lidChild, closedRot, swingTarget, 500).easing(Easing_CR.Cubic.Out);
        const lidSettle = LSTween_CR.rotateFromToLocal(lidChild, swingTarget, settleTarget, 250)
            .easing(Easing_CR.Sinusoidal.InOut)
            .onComplete(() => { print("Chest opened!"); });

        lidSwing.chain(lidSettle);
        lidSwing.start();
    }

    private bindInteraction(): void {
        (this.chestInteractable as any).onTriggerEnd.add(() => {
            if (!global.inventory.has(this.inventoryItemName)) {
                global.hintSystem.showHint("lockedChest");
                global.soundManager.playSpatialSound(this.getSceneObject(), "woodLocked", 1, 1);
                this.shakeLock();
                this.shakeLid();
                return;
            }
            if (this.chestOpened) return;
            this.chestOpened = true;

            global.utils.delay(0.5, () => {
                global.soundManager.playSpatialSound(this.getSceneObject(), "lockUnlock", 1, 1);
            });

            const keyParentTransform = this.keyParent.getTransform();
            const bronzeKeyTransform = this.bronzeKey.getTransform();
            const lockFullTransform = this.lockFull.getTransform();
            const lockLowerTransform = this.lockLowerPart.getTransform();

            const ZERO = vec3.zero();
            const ONE = vec3.one();
            const quadOut = Easing_CR.Quadratic.Out;

            const keyInsert = buildKeyInsert(keyParentTransform, bronzeKeyTransform, ONE, [
                { durationMs: 300, easing: quadOut },
                { durationMs: 300, easing: quadOut },
            ]);

            const lockLowerDrop = LSTween_CR.moveOffset(lockLowerTransform, new vec3(-0.15, -0.40, 0), 350).easing(Easing_CR.Cubic.In);
            const lockLowerTilt = LSTween_CR.rotateOffset(lockLowerTransform, quat.angleAxis(-5 * MathUtils.DegToRad, vec3.forward()), 350).easing(quadOut);
            const lockLowerOpen = LSTween_CR.rotateOffset(lockLowerTransform, quat.angleAxis(-45 * MathUtils.DegToRad, vec3.up()), 400).easing(Easing_CR.Back.Out);
            const lockRotate = LSTween_CR.rotateOffset(lockFullTransform, quat.angleAxis(90 * MathUtils.DegToRad, vec3.forward()), 400).easing(Easing_CR.Back.Out);
            const lockSlideOut = LSTween_CR.moveOffset(lockFullTransform, new vec3(-5, 0, 0), 450).easing(Easing_CR.Cubic.In);
            const lockScaleOut = LSTween_CR.scaleFromToLocal(lockFullTransform, lockFullTransform.getLocalScale(), ZERO, 250)
                .easing(Easing_CR.Back.In)
                .onComplete(() => {
                    global.soundManager.playSpatialSound(this.getSceneObject(), "chestOpen", 1, 1);
                    (this.chestInteractable as any).release();
                    this.chestOutline.enabled = false;
                    if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;
                    this.openLid();
                });

            keyInsert.last.chain(lockLowerDrop, lockLowerTilt);
            lockLowerDrop.chain(lockLowerOpen);
            lockLowerOpen.chain(lockRotate);
            lockRotate.chain(lockSlideOut);
            lockSlideOut.chain(lockScaleOut);
            keyInsert.first.start();
        });
    }
}
