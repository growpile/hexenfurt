// Hanging lore item. Exposes loreId, stopHanging, and getBolt, which the gallery
// uses to gate its visuals.

import { computeHangRotation } from "./HangSwing";

@component
export class HangingLore extends BaseScriptComponent {
    @input
    public loreId: string = "";

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

    private hangEvent!: UpdateEvent;
    private hangTime: number = 0;
    private hangingActive: boolean = false;
    private neutralLocalRot: quat | null = null;

    onAwake(): void {
        this.hangEvent = this.createEvent("UpdateEvent");
        this.hangEvent.enabled = false;
        this.hangEvent.bind((ev) => this.tickHang(ev));

        this.createEvent("OnStartEvent").bind(() => this.startHanging());
    }

    public getBolt = (): SceneObject => this.getSceneObject().getChild(0).getChild(0);

    private startHanging(): void {
        if (!this.neutralLocalRot) this.neutralLocalRot = this.getSceneObject().getTransform().getLocalRotation();
        this.hangTime = 0;
        this.hangingActive = true;
        this.hangEvent.enabled = true;
    }

    public stopHanging = (): void => {
        this.hangingActive = false;
        this.hangEvent.enabled = false;
        if (!this.neutralLocalRot) return;
        this.getSceneObject().getTransform().setLocalRotation(this.neutralLocalRot);
    };

    private tickHang(ev: UpdateEvent): void {
        if (!this.hangingActive || !this.neutralLocalRot) return;
        this.hangTime += ev.getDeltaTime();
        const finalLocalRot = computeHangRotation(this.neutralLocalRot, this.hangTime, this);
        this.getSceneObject().getTransform().setLocalRotation(finalLocalRot);
    }
}
