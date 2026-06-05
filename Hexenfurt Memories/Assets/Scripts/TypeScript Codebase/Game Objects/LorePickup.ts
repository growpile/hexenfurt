// Collectable lore pickup.

import { computeHangRotation } from "./HangSwing";

@component
export class LorePickup extends BaseScriptComponent {
    @input
    public itemInteractable!: ScriptComponent;

    @input
    public loreId: string = "";

    @input
    public tooltip!: SceneObject;

    @input("int", "0")
    @label("Direction")
    @hint("Which way the lore piece hangs and swings.")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Left", 0),
            new ComboBoxItem("Right", 1),
        ])
    )
    public hangingTo: number = 0;

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Hang Tuning</font>"}
    @input
    public hangAmplitudeDeg: number = 8.0;

    @input
    public hangBiasDeg: number = 4.0;

    @input
    public hangSpeedHz: number = 0.6;

    @input
    public resetDuration: number = 0.35;
    // @ui {"widget":"group_end"}

    public tooltipMainPass: any = null;
    public chaseValue: number = 0;

    private updateEvent!: UpdateEvent;
    private hangEvent!: UpdateEvent;
    private resetEvent!: UpdateEvent;
    private neutralLocalRot: quat | null = null;
    private hangTime: number = 0;
    private hangingActive: boolean = false;
    private resetElapsed: number = 0;
    private resetFromRot!: quat;

    onAwake(): void {
        this.updateEvent = this.createEvent("UpdateEvent");
        this.updateEvent.enabled = false;
        this.updateEvent.bind(() => {
            if (!this.tooltipMainPass) return;
            this.tooltipMainPass.opacity = global.utils.lerp(this.tooltipMainPass.opacity, this.chaseValue, 0.05);
            if (Math.abs(this.tooltipMainPass.opacity - this.chaseValue) < 0.05) {
                this.tooltipMainPass.opacity = this.chaseValue;
                this.updateEvent.enabled = false;
            }
        });

        this.hangEvent = this.createEvent("UpdateEvent");
        this.hangEvent.enabled = false;
        this.hangEvent.bind((ev) => this.tickHang(ev));

        this.resetEvent = this.createEvent("UpdateEvent");
        this.resetEvent.enabled = false;

        this.createEvent("OnStartEvent").bind(() => {
            this.tooltipSetup();
            this.startHanging();

            (this.itemInteractable as any).onHoverEnter.add(() => { this.chaseValue = 1; this.updateEvent.enabled = true; });
            (this.itemInteractable as any).onHoverExit.add(() => { this.chaseValue = 0; this.updateEvent.enabled = true; });
            (this.itemInteractable as any).onTriggerEnd.add(() => {
                if (global.inventory.isInspecting) return;
                (this.itemInteractable as any).release();
                this.stopHanging();
                this.resetRotationToNeutral(() => {
                    this.chaseValue = 0;
                    this.updateEvent.enabled = true;
                    this.getBolt().destroy();
                    global.inventory.addLore(this.loreId, this.getSceneObject(), this.getSceneObject().getChild(0));
                });
            });
        });
    }

    public getBolt(): SceneObject {
        return this.getSceneObject().getChild(0).getChild(0);
    }

    public playTween = (): void => {
        global.tweenManager.startTween(this.getSceneObject(), "item_pickup", () => {
            global.tweenManager.startTween(this.getSceneObject().getChild(0), "orbit");
        });
    };

    private tooltipSetup(): void {
        const imageComponent = this.tooltip.getComponent("Component.Image") as any;
        const newMainMaterial = imageComponent.mainMaterial.clone();
        imageComponent.clearMaterials();
        imageComponent.addMaterial(newMainMaterial);
        this.tooltipMainPass = imageComponent.mainPass;
    }

    private startHanging(): void {
        if (!this.neutralLocalRot) this.neutralLocalRot = this.getSceneObject().getTransform().getLocalRotation();
        this.hangTime = 0;
        this.hangingActive = true;
        this.hangEvent.enabled = true;
    }

    public stopHanging = (): void => {
        this.hangingActive = false;
        this.hangEvent.enabled = false;
    };

    private tickHang(ev: UpdateEvent): void {
        if (!this.hangingActive || !this.neutralLocalRot) return;
        this.hangTime += ev.getDeltaTime();
        const finalLocalRot = computeHangRotation(this.neutralLocalRot, this.hangTime, this);
        this.getSceneObject().getTransform().setLocalRotation(finalLocalRot);
    }

    private resetRotationToNeutral(onComplete: () => void): void {
        const t = this.getSceneObject().getTransform();
        this.resetFromRot = t.getLocalRotation();
        if (!this.neutralLocalRot) this.neutralLocalRot = t.getLocalRotation();

        this.resetElapsed = 0;
        this.resetEvent.enabled = true;
        this.resetEvent.bind((ev) => {
            const dt = ev.getDeltaTime();
            this.resetElapsed += dt;
            const tt = Math.min(this.resetElapsed / this.resetDuration, 1.0);
            const eased = tt * (2 - tt);
            const slerped = quat.slerp(this.resetFromRot, this.neutralLocalRot!, eased);
            t.setLocalRotation(slerped);
            if (tt >= 1.0) {
                t.setLocalRotation(this.neutralLocalRot!);
                this.resetEvent.enabled = false;
                onComplete();
            }
        });
    }
}
