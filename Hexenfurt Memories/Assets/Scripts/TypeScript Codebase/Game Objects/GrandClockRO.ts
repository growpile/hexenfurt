// Grand clock puzzle. The drawer unlocks when both hands match the random target
// time generated in init().

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

const LSTween_GC = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_GC = require("LSTween.lspkg/TweenJS/Easing").Easing;

interface ManipulationEvents {
    onTranslationStart: { add(cb: () => void): void };
    onTranslationEnd: { add(cb: () => void): void };
    onTranslationUpdate: { add(cb: () => void): void };
    getSceneObject(): SceneObject;
}

@component
export class GrandClockRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Clock Hands</font>"}
    @input
    public minutesArrowManipulation!: ScriptComponent;

    @input
    public hoursArrowManipulation!: ScriptComponent;

    @input
    public hoursArrow!: SceneObject;

    @input
    public minutesArrow!: SceneObject;

    @input
    public debugTimeText!: Text;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Pendulum & Hanging Parts</font>"}
    @input
    public mainHangingPart!: SceneObject;

    @input
    public smallHangingParts: SceneObject[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Drawer</font>"}
    @input
    public drawerInteractable!: ScriptComponent;

    @input
    @allowUndefined
    public drawerManipulation: ScriptComponent | null = null;

    @input
    public drawerOutline!: ScriptComponent;

    @input
    public drawer!: SceneObject;
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
    public drawerOpened: boolean = false;
    public targetHour: number = 12;
    public targetMinute: number = 0;

    private isAnimating: boolean = false;
    private elapsedTime: number = 0;
    private animationSpeed: number = 5;
    private updateEvent: UpdateEvent | null = null;
    private readonly OFFSET_HOURS_DEG: number = 270;
    private readonly OFFSET_MIN_DEG: number = -90;
    private isShaking: boolean = false;
    private drawerRestPos: vec3 | null = null;
    private activePendulumTweens: any[] = [];

    onAwake(): void {
        this.init();
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();
            this.startPendulumAnimations();

            const mManip = this.minutesArrowManipulation as unknown as ManipulationEvents;
            const hManip = this.hoursArrowManipulation as unknown as ManipulationEvents;

            mManip.onTranslationStart.add(() => {
                this.stopAnimation();
                global.soundManager.stopSpatialSound(this.getSceneObject(), "clockTickLoop");
            });
            hManip.onTranslationStart.add(() => {
                this.stopAnimation();
                global.soundManager.stopSpatialSound(this.getSceneObject(), "clockTickLoop");
            });

            mManip.onTranslationEnd.add(() => {
                const driverT = mManip.getSceneObject().getTransform();
                const arrowTipT = this.minutesArrow.getChild(0).getTransform();
                driverT.setWorldPosition(arrowTipT.getWorldPosition());
                this.updateTime();
                this.checkTime();
            });
            hManip.onTranslationEnd.add(() => {
                const driverT = hManip.getSceneObject().getTransform();
                const arrowTipT = this.hoursArrow.getChild(0).getTransform();
                driverT.setWorldPosition(arrowTipT.getWorldPosition());
                this.updateTime();
                this.checkTime();
            });

            mManip.onTranslationUpdate.add(() => this.driveMinuteFromDriver());
            hManip.onTranslationUpdate.add(() => this.driveHourFromDriver());

            (this.drawerInteractable as any).onTriggerEnd.add(() => {
                if (!this.solved) {
                    global.hintSystem.showHint("lockedClockDrawer");
                    global.soundManager.playSpatialSound(this.getSceneObject(), "woodLocked", 1, 1);
                    this.shakeDrawer();
                    return;
                }
                if (this.drawerOpened) return;
                this.drawerOpened = true;

                if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;
                global.soundManager.playSpatialSound(this.getSceneObject(), "drawerOpen", 1, 1);
                (this.drawerInteractable as any).release();
                this.drawerOutline.enabled = false;
                this.openDrawer();
            });

            this.updateTime();
        });

        this.createEvent("OnDestroyEvent").bind(() => this.stopPendulumAnimations());
    }

    public init = (): string => {
        this.beginAnimation();
        this.targetHour = this.randomInt(1, 12);
        this.targetMinute = Math.random() < 0.5 ? 0 : 30;
        const result = this.codeString();
        print("Clock pass time: " + result);
        return result;
    };

    private testItemSpots(): void {
        runTestItemSpots(this);
    }

    private hourPivot(): SceneObject { return this.hoursArrow.getParent(); }
    private minutePivot(): SceneObject { return this.minutesArrow.getParent(); }
    private hourPivotT(): Transform { return this.hourPivot().getTransform(); }
    private minutePivotT(): Transform { return this.minutePivot().getTransform(); }
    private quatFromZDegrees(deg: number): quat { return quat.fromEulerAngles(0, 0, deg * (Math.PI / 180)); }
    private codeString(): string { return this.targetHour + ":" + (this.targetMinute === 0 ? "00" : "30"); }
    private randomInt(min: number, maxInclusive: number): number { return Math.floor(Math.random() * (maxInclusive - min + 1)) + min; }
    private normalizeDeg(d: number): number { return (d % 360 + 360) % 360; }
    private rad2deg(r: number): number { return r * 180 / Math.PI; }

    private getPivotLocalZDeg(pivotSO: SceneObject): number {
        const q = pivotSO.getTransform().getLocalRotation();
        const e = q.toEulerAngles();
        return this.normalizeDeg(this.rad2deg(e.z));
    }

    private angleCWFrom12_inParentSpace(pivotSO: SceneObject, driverSO: SceneObject): number {
        const pivotT = pivotSO.getTransform();
        const parentT = pivotSO.getParent() ? pivotSO.getParent().getTransform() : null;
        const p = pivotT.getWorldPosition();
        const d = driverSO.getTransform().getWorldPosition();
        const vWorld = d.sub(p);
        let vLocal = vWorld;
        if (parentT) {
            const parentWRot = parentT.getWorldRotation();
            const inv = parentWRot.invert();
            vLocal = inv.multiplyVec3(vWorld);
        }
        const degCCW_fromPosX = this.rad2deg(Math.atan2(vLocal.y, vLocal.x));
        return this.normalizeDeg(90 - degCCW_fromPosX);
    }

    private localZFromDesiredAngleCW(desiredCW: number, offsetDeg: number): number {
        return this.normalizeDeg(360 + offsetDeg - desiredCW);
    }

    private updateTime(): void {
        const hourLocalZ = this.getPivotLocalZDeg(this.hourPivot());
        const minuteLocalZ = this.getPivotLocalZDeg(this.minutePivot());

        const hourAngleCW = this.normalizeDeg((360 - hourLocalZ) + this.OFFSET_HOURS_DEG);
        const minuteAngleCW = this.normalizeDeg((360 - minuteLocalZ) + this.OFFSET_MIN_DEG);

        let hours = (hourAngleCW / 360) * 12;
        let minutes = (minuteAngleCW / 360) * 60;

        if (hours >= 12) hours -= 12;
        if (hours < 0) hours += 12;
        if (minutes >= 60) minutes -= 60;
        if (minutes < 0) minutes += 60;

        const displayHours = Math.floor(hours) === 0 ? 12 : Math.floor(hours);
        const minutesInt = Math.floor(minutes);
        const displayMinutes = minutesInt.toString().padStart(2, "0");

        if (this.debugTimeText) this.debugTimeText.text = displayHours + ":" + displayMinutes;
    }

    private checkTime(): void {
        const hourLocalZ = this.getPivotLocalZDeg(this.hourPivot());
        const minuteLocalZ = this.getPivotLocalZDeg(this.minutePivot());

        const hourAngleCW = this.normalizeDeg((360 - hourLocalZ) + this.OFFSET_HOURS_DEG);
        const minuteAngleCW = this.normalizeDeg((360 - minuteLocalZ) + this.OFFSET_MIN_DEG);

        let hours = (hourAngleCW / 360) * 12;
        let minutes = (minuteAngleCW / 360) * 60;
        if (hours >= 12) hours -= 12;
        if (hours < 0) hours += 12;
        if (minutes >= 60) minutes -= 60;
        if (minutes < 0) minutes += 60;

        const displayHours = Math.floor(hours) === 0 ? 12 : Math.floor(hours);
        if (this.debugTimeText) this.debugTimeText.text = displayHours + ":" + Math.floor(minutes).toString().padStart(2, "0");

        if (!this.isAnimating && !this.solved) {
            const tol = 1;
            const minutesRounded = Math.round(minutes) % 60;
            const minuteDiff = (a: number, b: number): number => {
                const d = Math.abs(((a - b) % 60 + 60) % 60);
                return d > 30 ? 60 - d : d;
            };
            const minuteDelta = minuteDiff(minutesRounded, this.targetMinute);
            if (displayHours === this.targetHour && minuteDelta <= tol) {
                this.solved = true;
                global.persistentStorage.increaseStat("puzzlesSolved");
                print("Clock drawer unlocked!");
                global.soundManager.playSpatialSound(this.getSceneObject(), "codeSafeUnlock", 0.5, 1);
            }
        }
    }

    private beginAnimation(): void {
        this.elapsedTime = 0;
        this.isAnimating = true;

        this.hourPivotT().setLocalRotation(this.quatFromZDegrees(180 + this.OFFSET_HOURS_DEG));
        this.minutePivotT().setLocalRotation(this.quatFromZDegrees(0 + this.OFFSET_MIN_DEG));

        this.updateTime();
        global.soundManager.playSpatialSound(this.getSceneObject(), "clockTickLoop", 1, -1);

        if (!this.updateEvent) {
            this.updateEvent = this.createEvent("UpdateEvent");
            this.updateEvent.bind((ev) => this.onUpdate(ev));
        }
    }

    private onUpdate(ev: UpdateEvent): void {
        if (!this.isAnimating) return;
        this.elapsedTime += ev.getDeltaTime() * this.animationSpeed;

        const minuteAngle = (this.elapsedTime / 60) * 360 % 360;
        let hourAngle = (this.elapsedTime / (12 * 60)) * 360 % 360;
        hourAngle += 180;

        const hourLocalZ = this.localZFromDesiredAngleCW(hourAngle, this.OFFSET_HOURS_DEG);
        const minuteLocalZ = this.localZFromDesiredAngleCW(minuteAngle, this.OFFSET_MIN_DEG);

        this.hourPivotT().setLocalRotation(this.quatFromZDegrees(hourLocalZ));
        this.minutePivotT().setLocalRotation(this.quatFromZDegrees(minuteLocalZ));

        this.updateTime();
    }

    private stopAnimation(): void { this.isAnimating = false; }

    private driveMinuteFromDriver(): void {
        const driverSO = (this.minutesArrowManipulation as any).getSceneObject();
        const desiredCW = this.angleCWFrom12_inParentSpace(this.minutePivot(), driverSO);
        const localZ = this.localZFromDesiredAngleCW(desiredCW, this.OFFSET_MIN_DEG);
        this.minutePivotT().setLocalRotation(this.quatFromZDegrees(localZ));
        this.updateTime();
    }

    private driveHourFromDriver(): void {
        const driverSO = (this.hoursArrowManipulation as any).getSceneObject();
        const desiredCW = this.angleCWFrom12_inParentSpace(this.hourPivot(), driverSO);
        const localZ = this.localZFromDesiredAngleCW(desiredCW, this.OFFSET_HOURS_DEG);
        this.hourPivotT().setLocalRotation(this.quatFromZDegrees(localZ));
        this.updateTime();
    }

    private shakeDrawer(): void {
        if (this.isShaking) return;
        this.isShaking = true;
        const t = this.drawer.getTransform();
        if (this.drawerRestPos === null) this.drawerRestPos = t.getLocalPosition();
        const d = 0.4;
        const fwd = new vec3(0, 0, d);
        const back = new vec3(0, 0, -d);
        const rest = this.drawerRestPos;
        const s1 = LSTween_GC.moveFromToLocal(t, rest, rest.add(fwd), 50).easing(Easing_GC.Quadratic.Out);
        const s2 = LSTween_GC.moveFromToLocal(t, rest.add(fwd), rest.add(back), 50).easing(Easing_GC.Quadratic.Out);
        const s3 = LSTween_GC.moveFromToLocal(t, rest.add(back), rest.add(fwd.uniformScale(0.5)), 40).easing(Easing_GC.Quadratic.Out);
        const s4 = LSTween_GC.moveFromToLocal(t, rest.add(fwd.uniformScale(0.5)), rest.add(back.uniformScale(0.5)), 40).easing(Easing_GC.Quadratic.Out);
        const settle = LSTween_GC.moveFromToLocal(t, rest.add(back.uniformScale(0.5)), rest, 60)
            .easing(Easing_GC.Quadratic.Out)
            .onComplete(() => { this.isShaking = false; });
        s1.chain(s2); s2.chain(s3); s3.chain(s4); s4.chain(settle);
        s1.start();
    }

    private startPendulumAnimations(): void {
        const mainT = this.mainHangingPart.getTransform();
        const deg = MathUtils.DegToRad;
        const pendulumTween = LSTween_GC.rotateFromToLocal(
            mainT,
            quat.angleAxis(8 * deg, vec3.forward()).multiply(mainT.getLocalRotation()),
            quat.angleAxis(-8 * deg, vec3.forward()).multiply(mainT.getLocalRotation()),
            2200,
        ).easing(Easing_GC.Sinusoidal.InOut).repeat(Infinity).yoyo(true);
        pendulumTween.start();
        this.activePendulumTweens.push(pendulumTween);

        for (let i = 0; i < this.smallHangingParts.length; i++) {
            const partT = this.smallHangingParts[i].getTransform();
            const startPos = partT.getLocalPosition();
            const delay = i * 300;
            const drift = 0.6 + (i % 3) * 0.25;
            const duration = 1800 + (i % 2) * 400;
            const hangTween = LSTween_GC.moveFromToLocal(
                partT,
                startPos,
                startPos.add(new vec3(0, drift, 0)),
                duration,
            ).easing(Easing_GC.Sinusoidal.InOut).repeat(Infinity).yoyo(true).delay(delay);
            hangTween.start();
            this.activePendulumTweens.push(hangTween);
        }
    }

    private stopPendulumAnimations(): void {
        for (let i = 0; i < this.activePendulumTweens.length; i++) this.activePendulumTweens[i].stop();
        this.activePendulumTweens = [];
    }

    private openDrawer(): void {
        const t = this.drawer.getTransform();
        const startPos = t.getLocalPosition();
        const overshoot = new vec3(startPos.x, startPos.y, startPos.z + 8.6);
        const target = new vec3(startPos.x, startPos.y, startPos.z + 8);

        const slide = LSTween_GC.moveFromToLocal(t, startPos, overshoot, 450).easing(Easing_GC.Cubic.Out);
        const settle = LSTween_GC.moveFromToLocal(t, overshoot, target, 200)
            .easing(Easing_GC.Sinusoidal.InOut)
            .onComplete(() => { print("Drawer Opened!"); });

        slide.chain(settle);
        slide.start();
    }
}
