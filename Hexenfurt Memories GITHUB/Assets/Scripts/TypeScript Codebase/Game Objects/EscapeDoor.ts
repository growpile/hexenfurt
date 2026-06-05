// The escape door. Requires the gold key to open, then calls global.doorOpened()
// to finalize the run.

import { playShake, buildKeyInsert } from "./RoomObjectAnimations";

const LSTween_ED = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_ED = require("LSTween.lspkg/TweenJS/Easing").Easing;

@component
export class EscapeDoor extends BaseScriptComponent {
    private static readonly POST_OPEN_SLAM_DELAY_SEC = 2;
    private static readonly SLAM_DURATION_MS = 120;
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Door Setup</font>"}
    @input
    public doorInteractable!: ScriptComponent;

    @input
    public doorOutline!: ScriptComponent;

    @input
    public doorPivot!: SceneObject;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
    @input
    public keyParent!: SceneObject;

    @input
    public goldKey!: SceneObject;
    // @ui {"widget":"group_end"}

    private doorOpened: boolean = false;
    private isShaking: boolean = false;
    private doorRestRot: quat | null = null;
    private closedRot: quat | null = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bindInteractions());
    }

    private shakeDoor(): void {
        if (this.isShaking) return;
        this.isShaking = true;
        const t = this.doorPivot.getTransform();
        if (this.doorRestRot === null) this.doorRestRot = t.getLocalRotation();
        playShake(
            t,
            this.doorRestRot,
            vec3.up(),
            [
                { angleDeg: 2, durationMs: 60 },
                { angleDeg: -2, durationMs: 60 },
                { angleDeg: 1, durationMs: 50 },
            ],
            70,
            () => { this.isShaking = false; }
        );
    }

    private openDoor(): void {
        const doorT = this.doorPivot.getTransform();
        const closedRot = doorT.getLocalRotation();
        this.closedRot = closedRot;
        const axis = vec3.up();
        const crackTarget = quat.angleAxis(-3 * MathUtils.DegToRad, axis).multiply(closedRot);
        const swingTarget = quat.angleAxis(-48 * MathUtils.DegToRad, axis).multiply(closedRot);
        const settleTarget = quat.angleAxis(-45 * MathUtils.DegToRad, axis).multiply(closedRot);

        const crack = LSTween_ED.rotateFromToLocal(doorT, closedRot, crackTarget, 250).easing(Easing_ED.Quadratic.Out);
        const swing = LSTween_ED.rotateFromToLocal(doorT, crackTarget, swingTarget, 600).easing(Easing_ED.Cubic.Out);
        const settle = LSTween_ED.rotateFromToLocal(doorT, swingTarget, settleTarget, 350)
            .easing(Easing_ED.Sinusoidal.InOut)
            .onComplete(() => {
                global.doorOpened(this.getSceneObject());
                global.utils.delay(EscapeDoor.POST_OPEN_SLAM_DELAY_SEC, () => {
                    global.soundManager.playSound("doorSlam", 1);
                    global.soundManager.playSpatialSound(this.getSceneObject(), "witchLaugh", 1, 1);
                    this.slamClosed(() => {
                        if (typeof global.escapeDoorSlammed === "function") {
                            global.escapeDoorSlammed();
                        }
                    });
                });
            });

        crack.chain(swing);
        swing.chain(settle);
        crack.start();
    }

    /** Slams the door back to its closed rotation (called after the open settle finishes). */
    public slamClosed(onDone?: () => void): void {
        if (!this.closedRot || !this.doorPivot) {
            if (onDone) onDone();
            return;
        }
        const doorT = this.doorPivot.getTransform();
        LSTween_ED.rotateFromToLocal(doorT, doorT.getLocalRotation(), this.closedRot, EscapeDoor.SLAM_DURATION_MS)
            .easing(Easing_ED.Back.In)
            .onComplete(() => { if (onDone) onDone(); })
            .start();
    }

    private bindInteractions(): void {
        (this.doorInteractable as any).onTriggerEnd.add(() => {
            if (!global.inventory.has("goldKey")) {
                global.hintSystem.showHint("lockedDoor");
                global.soundManager.playSpatialSound(this.getSceneObject(), "woodLocked", 1, 1);
                this.shakeDoor();
                return;
            }
            if (this.doorOpened) return;
            this.doorOpened = true;

            (this.doorInteractable as any).release();
            this.doorOutline.enabled = false;

            global.utils.delay(0.5, () => {
                global.soundManager.playSpatialSound(this.getSceneObject(), "lockUnlock", 1, 1);
            });

            const keyParentTransform = this.keyParent.getTransform();
            const goldKeyTransform = this.goldKey.getTransform();

            const KEY_SCALE = new vec3(0.4255, 0.4255, 0.4255);

            const keyInsert = buildKeyInsert(keyParentTransform, goldKeyTransform, KEY_SCALE, [
                { durationMs: 250, easing: Easing_ED.Quadratic.In },
                { durationMs: 200, easing: Easing_ED.Linear.None },
                { durationMs: 250, easing: Easing_ED.Quadratic.Out },
            ]);

            keyInsert.last.onComplete(() => {
                print("Door unlocked!");
                global.soundManager.playSpatialSound(this.getSceneObject(), "doorOpen", 1, 1);
                global.persistentStorage.increaseStat("doorsOpened");
                this.openDoor();
            });

            keyInsert.first.start();
        });
    }
}
