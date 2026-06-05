// Keypad code safe. init() generates a random 5-digit code and returns it so the
// spawner can place a matching clue note elsewhere in the room.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

const LSTween_CS = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_CS = require("LSTween.lspkg/TweenJS/Easing").Easing;

const NUMBER_STRIP_MAX_DURATION_MS = 500;
const NUMBER_STRIP_MOTION_RAMP_FRACTION = 0.06;

@component
export class CodeSafeRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Code Safe</font>"}
    @input
    public debugText!: Text;

    @input
    public safeDoorInteractable!: ScriptComponent;

    @input
    @allowUndefined
    public safeDoorManipulation: ScriptComponent | null = null;

    @input
    public safeDoorOutline!: ScriptComponent;

    @input
    public safeDoor!: SceneObject;

    @input
    public safeHandle!: SceneObject;

    @input
    public indexIndicator!: SceneObject;

    @input
    @label("Number Strip Material")
    @allowUndefined
    public numberStripMaterial: Material | null = null;

    @input
    @label("Safe Combination Numbers")
    public safeCombinationNumbers: RenderMeshVisual[] = [];
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

    public solved: boolean = false;
    public password: string = "00000";
    public currentString: string = "";

    private safeDoorOpened: boolean = false;
    private isDoorShaking: boolean = false;
    private isHandleShaking: boolean = false;
    private doorRestRot: quat | null = null;
    private handleRestRot: quat | null = null;
    private indicatorColumnXs: number[] = [-4, -2.05, 0, 2.05, 4];
    private indicatorActiveTween: any = null;
    private indicatorRestCached: boolean = false;
    private indicatorRestLocalY: number = 0;
    private indicatorRestLocalZ: number = 0;
    private numberStripPasses: (Pass | undefined)[] = [];
    private numberStripTweens: any[] = [];
    private pendingInputCheck: boolean = false;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.setupNumberStripMaterials();
            this.testItemSpots();
            this.refreshIndicatorColumnXs();
            this.snapIndicatorToSlot(0);

            (this.safeDoorInteractable as any).onTriggerEnd.add(() => {
                if (!this.solved) {
                    global.hintSystem.showHint("lockedCodeSafe");
                    global.soundManager.playSpatialSound(this.getSceneObject(), "safeLocked", 1, 1);
                    this.shakeSafeDoor();
                    this.shakeSafeHandle();
                    return;
                }
                (this.safeDoorInteractable as any).release();
                this.safeDoorOutline.enabled = false;
                if (this.safeDoorOpened) return;
                this.safeDoorOpened = true;

                if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;

                this.spinSafeHandle(() => {
                    global.soundManager.playSpatialSound(this.getSceneObject(), "codeSafeUnlock", 1, 1);
                    this.openSafeDoor();
                });
            });
        });
    }

    public init = (): string => {
        let code = "";
        for (let i = 0; i < 5; i++) code += global.utils.rng(0, 9);
        this.password = code;
        this.refreshIndicatorColumnXs();
        this.snapIndicatorToSlot(0);
        this.resetAllNumberStrips();
        print("Safe Code is: " + this.password);
        return this.password;
    };

    public pressedKey0 = (): void => this.appendDigit("0");
    public pressedKey1 = (): void => this.appendDigit("1");
    public pressedKey2 = (): void => this.appendDigit("2");
    public pressedKey3 = (): void => this.appendDigit("3");
    public pressedKey4 = (): void => this.appendDigit("4");
    public pressedKey5 = (): void => this.appendDigit("5");
    public pressedKey6 = (): void => this.appendDigit("6");
    public pressedKey7 = (): void => this.appendDigit("7");
    public pressedKey8 = (): void => this.appendDigit("8");
    public pressedKey9 = (): void => this.appendDigit("9");

    /** Backspace — removes the last digit with strip wipe and moves the indicator back. */
    public clearInput = (): void => {
        if (this.solved) return;
        if (this.currentString.length === 0) return;

        this.pendingInputCheck = false;

        const slotIndex = this.currentString.length - 1;
        const lastDigitChar = this.currentString.charAt(slotIndex);
        this.currentString = this.currentString.slice(0, -1);
        this.debugText.text = this.currentString.toString();

        this.animateNumberStripSlotToZero(slotIndex, lastDigitChar);
        this.animateIndicatorToSlot(this.indicatorSlotForCurrentString());
    };

    private clearAllInputAnimated(onStripsComplete?: () => void): void {
        this.pendingInputCheck = false;
        const enteredDigits = this.currentString;
        this.currentString = "";
        this.debugText.text = this.currentString.toString();
        this.animateAllNumberStripsToZero(onStripsComplete, enteredDigits);
        this.animateIndicatorClearToStart();
    }

    public checkInput = (): void => {
        if (this.solved) return;
        if (this.currentString.length !== this.password.length) return;

        if (this.hasActiveNumberStripTween()) {
            if (!this.pendingInputCheck) this.pendingInputCheck = true;
            this.waitForNumberStripTweensIdle(() => this.checkInput());
            return;
        }

        this.resolveInputCheck();
    };

    private resolveInputCheck(): void {
        if (this.solved) return;
        if (this.currentString.length !== this.password.length) {
            this.pendingInputCheck = false;
            return;
        }

        if (this.currentString === this.password) {
            this.pendingInputCheck = false;
            this.debugText.text = "-----";
            print("Safe Unlocked!");
            this.solved = true;
            global.persistentStorage.increaseStat("puzzlesSolved");
            global.persistentStorage.increaseStat("safesCracked");
            global.tweenManager.startTween(this.getSceneObject(), "turn-green");
            global.soundManager.playSpatialSound(this.getSceneObject(), "codeSafeUnlock", 1, 1);
        } else {
            this.clearAllInputAnimated(() => { this.pendingInputCheck = false; });
            global.soundManager.playSpatialSound(this.getSceneObject(), "codeSafeFail", 1, 1);
            global.tweenManager.startTween(this.getSceneObject(), "flash-red");
        }
    };

    private appendDigit(ch: string): void {
        if (this.solved || this.pendingInputCheck) return;
        if (this.currentString.length >= this.password.length) return;
        this.currentString += ch;
        this.debugText.text = this.currentString.toString();
        const slotIndex = this.currentString.length - 1;
        const digit = parseInt(ch, 10);
        const isFullCode = this.currentString.length === this.password.length;
        this.animateIndicatorToSlot(this.indicatorSlotForCurrentString());
        if (isFullCode) {
            this.pendingInputCheck = true;
            this.animateNumberStripToDigit(slotIndex, digit, () => this.checkInput());
        } else {
            this.animateNumberStripToDigit(slotIndex, digit);
        }
    }

    private refreshIndicatorColumnXs(): void {
        this.indicatorColumnXs = [-4, -2.05, 0, 2.05, 4];
    }

    private ensureIndicatorRestYZ(): void {
        if (!this.indexIndicator || this.indicatorRestCached) return;
        const p = this.indexIndicator.getTransform().getLocalPosition();
        this.indicatorRestLocalY = p.y;
        this.indicatorRestLocalZ = p.z;
        this.indicatorRestCached = true;
    }

    private stopIndicatorTween(): void {
        if (this.indicatorActiveTween) {
            this.indicatorActiveTween.stop();
            this.indicatorActiveTween = null;
        }
    }

    private snapIndicatorToSlot(slotIndex: number): void {
        if (!this.indexIndicator) return;
        this.stopIndicatorTween();
        this.ensureIndicatorRestYZ();
        const clamped = Math.min(Math.max(slotIndex, 0), this.indicatorColumnXs.length - 1);
        const x = this.indicatorColumnXs[clamped];
        this.indexIndicator.getTransform().setLocalPosition(new vec3(x, this.indicatorRestLocalY, this.indicatorRestLocalZ));
    }

    private indicatorSlotForCurrentString(): number {
        const len = this.password.length;
        if (len <= 1) return 0;
        return Math.min(this.currentString.length, len - 1);
    }

    private animateIndicatorToSlot(slotIndex: number): void {
        if (!this.indexIndicator) return;
        this.ensureIndicatorRestYZ();
        const clamped = Math.min(Math.max(slotIndex, 0), this.indicatorColumnXs.length - 1);
        const targetX = this.indicatorColumnXs[clamped];
        const tf = this.indexIndicator.getTransform();
        this.stopIndicatorTween();
        const fromPos = tf.getLocalPosition();
        const targetPos = new vec3(targetX, this.indicatorRestLocalY, this.indicatorRestLocalZ);
        if (Math.abs(fromPos.x - targetX) < 0.025) return;
        const isLastColumn = clamped >= this.indicatorColumnXs.length - 1;
        const ms = isLastColumn ? 280 : 320;
        const tw = LSTween_CS.moveFromToLocal(tf, fromPos, targetPos, ms);
        tw.easing(isLastColumn ? Easing_CS.Cubic.Out : Easing_CS.Back.Out);
        this.indicatorActiveTween = tw;
        tw.onComplete(() => { this.indicatorActiveTween = null; });
        tw.start();
    }

    private setupNumberStripMaterials(): void {
        if (!this.numberStripMaterial || this.safeCombinationNumbers.length === 0) return;

        this.numberStripPasses = new Array(this.safeCombinationNumbers.length);
        this.numberStripTweens = new Array(this.safeCombinationNumbers.length);
        for (let i = 0; i < this.safeCombinationNumbers.length; i++) {
            const rmv = this.safeCombinationNumbers[i];
            if (!rmv) continue;
            const clone = this.numberStripMaterial.clone();
            rmv.clearMaterials();
            rmv.addMaterial(clone);
            const pass = clone.mainPass;
            pass.number = 0;
            pass.motionState = 0;
            this.numberStripPasses[i] = pass;
            this.numberStripTweens[i] = null;
        }
    }

    private resetAllNumberStrips(): void {
        for (let i = 0; i < this.numberStripPasses.length; i++) {
            this.stopNumberStripTween(i);
            this.setNumberStripValues(i, 0, 0);
        }
    }

    private setNumberStripValues(slotIndex: number, number: number, motionState: number): void {
        const pass = this.numberStripPasses[slotIndex];
        if (!pass) return;
        pass.number = number;
        pass.motionState = motionState;
    }

    private stopNumberStripTween(slotIndex: number): void {
        const tw = this.numberStripTweens[slotIndex];
        if (!tw) return;
        try {
            tw.stop();
        } catch (e) {}
        this.numberStripTweens[slotIndex] = null;
    }

    private hasActiveNumberStripTween(): boolean {
        for (let i = 0; i < this.numberStripTweens.length; i++) {
            if (this.numberStripTweens[i]) return true;
        }
        return false;
    }

    private waitForNumberStripTweensIdle(callback: () => void): void {
        global.utils.delay(0.016, () => {
            if (this.hasActiveNumberStripTween()) {
                this.waitForNumberStripTweensIdle(callback);
                return;
            }
            callback();
        });
    }

    private numberStripDurationMs(digit: number): number {
        const clamped = Math.min(Math.max(digit, 0), 9);
        return (clamped / 9) * NUMBER_STRIP_MAX_DURATION_MS;
    }

    private numberStripDurationFromValue(number: number): number {
        const digit = Math.round(Math.min(Math.max(number, 0), 0.9) * 10);
        return this.numberStripDurationMs(digit);
    }

    private numberStripMotionState(linearT: number): number {
        const ramp = NUMBER_STRIP_MOTION_RAMP_FRACTION;
        const blurInStart = 0.2 - ramp;
        const blurInEnd = 0.2 + ramp;
        const blurOutStart = 0.8 - ramp;
        const blurOutEnd = 0.8 + ramp;

        if (linearT <= blurInStart) return 0;
        if (linearT >= blurOutEnd) return 0;
        if (linearT < blurInEnd) return global.utils.lerp(0, 1, (linearT - blurInStart) / (blurInEnd - blurInStart));
        if (linearT <= blurOutStart) return 1;
        return global.utils.lerp(1, 0, (linearT - blurOutStart) / (blurOutEnd - blurOutStart));
    }

    private animateNumberStripToDigit(slotIndex: number, digit: number, onComplete?: () => void): void {
        this.animateNumberStrip(slotIndex, digit / 10, this.numberStripDurationMs(digit), onComplete);
    }

    private animateNumberStripSlotToZero(slotIndex: number, digitChar: string, onComplete?: () => void): void {
        const pass = this.numberStripPasses[slotIndex];
        if (!pass) {
            if (onComplete) onComplete();
            return;
        }

        this.stopNumberStripTween(slotIndex);

        let fromNumber = pass.number as number;
        if (fromNumber < 0.001 && digitChar.length > 0) {
            fromNumber = parseInt(digitChar, 10) / 10;
        }
        if (fromNumber < 0.001) {
            this.setNumberStripValues(slotIndex, 0, 0);
            if (onComplete) onComplete();
            return;
        }

        this.animateNumberStripFrom(
            slotIndex,
            fromNumber,
            0,
            this.numberStripDurationFromValue(fromNumber),
            onComplete
        );
    }

    private animateAllNumberStripsToZero(onComplete?: () => void, enteredDigits: string = ""): void {
        let pending = 0;
        const tryComplete = (): void => {
            pending--;
            if (pending <= 0 && onComplete) onComplete();
        };

        for (let i = 0; i < this.numberStripPasses.length; i++) {
            const pass = this.numberStripPasses[i];
            if (!pass) continue;

            this.stopNumberStripTween(i);

            let fromNumber = pass.number as number;
            if (fromNumber < 0.001 && i < enteredDigits.length) {
                fromNumber = parseInt(enteredDigits.charAt(i), 10) / 10;
            }
            if (fromNumber < 0.001) continue;

            pending++;
            this.animateNumberStripFrom(i, fromNumber, 0, this.numberStripDurationFromValue(fromNumber), tryComplete);
        }

        if (pending === 0 && onComplete) onComplete();
    }

    private animateNumberStrip(slotIndex: number, toNumber: number, durationMs: number, onComplete?: () => void): void {
        const pass = this.numberStripPasses[slotIndex];
        if (!pass) {
            if (onComplete) onComplete();
            return;
        }

        this.stopNumberStripTween(slotIndex);
        const fromNumber = pass.number as number;
        this.animateNumberStripFrom(slotIndex, fromNumber, toNumber, durationMs, onComplete);
    }

    private animateNumberStripFrom(
        slotIndex: number,
        fromNumber: number,
        toNumber: number,
        durationMs: number,
        onComplete?: () => void
    ): void {
        const pass = this.numberStripPasses[slotIndex];
        if (!pass) {
            if (onComplete) onComplete();
            return;
        }

        if (durationMs <= 1 || Math.abs(fromNumber - toNumber) < 0.001) {
            this.setNumberStripValues(slotIndex, toNumber, 0);
            if (onComplete) onComplete();
            return;
        }

        pass.number = fromNumber;
        const startTime = getTime();
        const tw = LSTween_CS.rawTween(durationMs)
            .easing(Easing_CS.Quadratic.InOut)
            .onUpdate((obj: { t: number }) => {
                const linearT = Math.min(Math.max((getTime() - startTime) / (durationMs * 0.001), 0), 1);
                pass.number = fromNumber + (toNumber - fromNumber) * obj.t;
                pass.motionState = this.numberStripMotionState(linearT);
            })
            .onComplete(() => {
                this.numberStripTweens[slotIndex] = null;
                this.setNumberStripValues(slotIndex, toNumber, 0);
                if (onComplete) onComplete();
            })
            .start();

        this.numberStripTweens[slotIndex] = tw;
    }

    private animateIndicatorClearToStart(): void {
        if (!this.indexIndicator) return;
        this.stopIndicatorTween();
        this.ensureIndicatorRestYZ();
        const tf = this.indexIndicator.getTransform();
        const from = tf.getLocalPosition();
        const aimX = this.indicatorColumnXs[0];
        const drop = 0.13;
        const midX = from.x * 0.62 + aimX * 0.38;
        const dip = new vec3(midX, from.y - drop, from.z);
        const targetPos = new vec3(aimX, this.indicatorRestLocalY, this.indicatorRestLocalZ);
        const fall = LSTween_CS.moveFromToLocal(tf, from, dip, 120).easing(Easing_CS.Cubic.In);
        const slide = LSTween_CS.moveFromToLocal(tf, dip, targetPos, 318).easing(Easing_CS.Cubic.Out);
        fall.chain(slide);
        this.indicatorActiveTween = fall;
        slide.onComplete(() => { this.indicatorActiveTween = null; });
        fall.start();
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }

    private shakeSafeDoor(): void {
        if (this.isDoorShaking) return;
        this.isDoorShaking = true;
        const t = this.safeDoor.getTransform();
        if (this.doorRestRot === null) this.doorRestRot = t.getLocalRotation();
        const up = vec3.up();
        const deg = MathUtils.DegToRad;
        const s1 = LSTween_CS.rotateToLocal(t, quat.angleAxis(2 * deg, up).multiply(this.doorRestRot), 60).easing(Easing_CS.Quadratic.Out);
        const s2 = LSTween_CS.rotateToLocal(t, quat.angleAxis(-2 * deg, up).multiply(this.doorRestRot), 60).easing(Easing_CS.Quadratic.Out);
        const s3 = LSTween_CS.rotateToLocal(t, quat.angleAxis(1 * deg, up).multiply(this.doorRestRot), 50).easing(Easing_CS.Quadratic.Out);
        const settle = LSTween_CS.rotateToLocal(t, this.doorRestRot, 70)
            .easing(Easing_CS.Quadratic.Out)
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
        const s1 = LSTween_CS.rotateToLocal(t, quat.angleAxis(wobble, tiltAxis).multiply(this.handleRestRot), 55).easing(Easing_CS.Quadratic.Out);
        const s2 = LSTween_CS.rotateToLocal(t, quat.angleAxis(-wobble, tiltAxis).multiply(this.handleRestRot), 55).easing(Easing_CS.Quadratic.Out);
        const s3 = LSTween_CS.rotateToLocal(t, quat.angleAxis(3 * deg, tiltAxis).multiply(this.handleRestRot), 45).easing(Easing_CS.Quadratic.Out);
        const settle = LSTween_CS.rotateToLocal(t, this.handleRestRot, 65)
            .easing(Easing_CS.Quadratic.Out)
            .onComplete(() => { this.isHandleShaking = false; });
        s1.chain(s2); s2.chain(s3); s3.chain(settle);
        s1.start();
    }

    private spinSafeHandle(onComplete: () => void): void {
        const handleT = this.safeHandle.getTransform();
        const startRot = handleT.getLocalRotation();
        const axis = vec3.forward();
        const deg = MathUtils.DegToRad;
        LSTween_CS.rawTween(1100)
            .easing(Easing_CS.Cubic.InOut)
            .onUpdate((obj: { t: number }) => {
                handleT.setLocalRotation(quat.angleAxis(372 * obj.t * deg, axis).multiply(startRot));
            })
            .onComplete(() => {
                LSTween_CS.rawTween(220)
                    .easing(Easing_CS.Sinusoidal.Out)
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

        const swing = LSTween_CS.rotateFromToLocal(doorT, closedRot, overshootRot, 600).easing(Easing_CS.Cubic.Out);
        const settle = LSTween_CS.rotateFromToLocal(doorT, overshootRot, openRot, 300)
            .easing(Easing_CS.Sinusoidal.InOut)
            .onComplete(() => { print("Safe Door Opened!"); });

        swing.chain(settle);
        swing.start();
    }
}
