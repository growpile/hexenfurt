// Radial pinch-hold button. Progress follows p(t) = v0*t + 0.5*a*t^2 with a
// configurable target, boost, and total time, then calls functionScript[functionName]().

interface ButtonStateComponent {
    interactable: {
        onTriggerStart: { add(cb: () => void): void };
        onTriggerEnd: { add(cb: () => void): void };
    };
}

@component
export class RadialHoldButton extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Visual</font>"}
    @input
    @hint("Idle and active button visuals (index 0 = idle, 1 = active).")
    public buttons: SceneObject[] = [];

    @input
    @hint("Components exposing `.interactable.onTriggerStart/End` for the active button (index 0).")
    public buttonStateComponents: ScriptComponent[] = [];

    @input
    public buttonRadialMaterial!: Material;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Behavior</font>"}
    @input
    public startActive: boolean = false;

    @input
    @hint("Acceleration applied to progress fill (progress/sec^2). Clamped so v0 stays >= 0.")
    public holdBoostValue: number = 0.0005;

    @input
    @hint("Target progress before 'complete' fires.")
    public buttonNeededHold: number = 1.0;

    @input
    @hint("Force completion in exactly this many seconds.")
    public totalHoldTime: number = 2.0;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Callback</font>"}
    @input
    public functionScript!: ScriptComponent;

    @input
    public functionName!: string;
    // @ui {"widget":"group_end"}

    public nextButtonHold: number = 0;

    private elapsed: number = 0;
    private baseSpeed: number = 0;
    private accel: number = 0;
    private updateEvent!: UpdateEvent;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.onStart());
    }

    public setEnabled(state: boolean): void {
        if (state) global.utils.stateChangeArrayWithException(this.buttons, 0, true);
        else global.utils.stateChangeArrayWithException(this.buttons, 1, true);
    }

    private onStart(): void {
        this.setEnabled(this.startActive);

        this.updateEvent = this.createEvent("UpdateEvent");
        this.updateEvent.enabled = false;
        this.updateEvent.bind((eventData) => this.tick(eventData));

        const bsc = this.buttonStateComponents[0] as unknown as ButtonStateComponent;
        if (!bsc || !bsc.interactable) return;

        bsc.interactable.onTriggerStart.add(() => {
            this.nextButtonHold = 0;
            this.elapsed = 0;
            this.buttonRadialMaterial.mainPass.progress = 0;
            this.configureKinematics();
            this.updateEvent.enabled = true;
        });

        bsc.interactable.onTriggerEnd.add(() => {
            this.nextButtonHold = 0;
            this.elapsed = 0;
            this.buttonRadialMaterial.mainPass.progress = 0;
            this.updateEvent.enabled = false;
        });
    }

    private tick(eventData: UpdateEvent): void {
        const dt = eventData.getDeltaTime();
        this.elapsed += dt;

        const p = (this.baseSpeed * this.elapsed) + (0.5 * this.accel * this.elapsed * this.elapsed);
        const normalized = Math.min(p / this.buttonNeededHold, 1.0);
        this.buttonRadialMaterial.mainPass.progress = normalized;

        if (p >= this.buttonNeededHold || this.elapsed >= this.totalHoldTime) {
            this.nextButtonHold = this.buttonNeededHold;
            this.buttonRadialMaterial.mainPass.progress = 1.0;
            this.updateEvent.enabled = false;

            global.utils.delay(0.25, () => {
                this.nextButtonHold = 0;
                this.elapsed = 0;
                this.buttonRadialMaterial.mainPass.progress = 0;
                const fn = (this.functionScript as any)[this.functionName];
                if (typeof fn === "function") fn.call(this.functionScript);
            });
        }
    }

    private configureKinematics(): void {
        const T = this.totalHoldTime;
        const target = this.buttonNeededHold;
        const aMax = (2 * target) / (T * T);
        this.accel = Math.max(0, Math.min(this.holdBoostValue, aMax));
        this.baseSpeed = (target - 0.5 * this.accel * T * T) / T;
        if (this.baseSpeed < 0) this.baseSpeed = 0;
    }
}
