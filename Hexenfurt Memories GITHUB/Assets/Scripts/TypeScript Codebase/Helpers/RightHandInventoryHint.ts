// Shows the inventory hint anchored to the right hand.

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

@component
export class RightHandInventoryHint extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Hint Visual</font>"}
    @input
    public handRenderMeshVisual!: RenderMeshVisual;

    @input
    public backlightMaterial!: Material;

    @input
    @hint("Wrist R bone for the rotate-in animation.")
    public wristR!: SceneObject;

    @input
    @hint("Key prop scaled-in alongside the hand rotation.")
    public keyObject!: SceneObject;
    // @ui {"widget":"group_end"}

    private parentT!: Transform;
    private wristRT!: Transform;
    private keyT!: Transform;
    private hintChild!: SceneObject;

    onAwake(): void {
        this.hintChild = this.getSceneObject().getChild(0);
        this.parentT = this.getSceneObject().getTransform();
        this.wristRT = this.wristR.getTransform();
        this.keyT = this.keyObject.getTransform();

        global.inventoryHint = () => this.showInventoryHint();

        this.createEvent("OnStartEvent").bind(() => {
            const newMaterial1 = this.handRenderMeshVisual.getMaterial(0).clone();
            const newMaterial2 = this.handRenderMeshVisual.getMaterial(1).clone();
            this.handRenderMeshVisual.clearMaterials();
            this.handRenderMeshVisual.addMaterial(newMaterial1);
            this.handRenderMeshVisual.addMaterial(newMaterial2);
            this.handRenderMeshVisual.getMaterial(0).mainPass.fadeLevel = 0.9;
        });
    }

    private backlightTween(from: number, to: number, ms: number): any {
        return LSTween.rawTween(ms)
            .easing(Easing.Sinusoidal.In)
            .onUpdate((obj: { t: number }) => {
                this.backlightMaterial.mainPass.opacity = from + (to - from) * obj.t;
            });
    }

    private showInventoryHint(): void {
        const deg = MathUtils.DegToRad;
        this.hintChild.enabled = true;

        const move = LSTween.moveOffset(this.parentT, new vec3(-35, 0, 0), 600).easing(Easing.Back.Out);
        const rotate = LSTween.rotateOffset(this.wristRT, quat.fromEulerAngles(0, 0, -150 * deg), 800).easing(Easing.Back.Out);
        const keyShow = LSTween.scaleFromToLocal(this.keyT, vec3.zero(), new vec3(1.15, 1.15, 1.15), 250).easing(Easing.Back.Out);
        const keySettle = LSTween.scaleFromToLocal(this.keyT, new vec3(1.15, 1.15, 1.15), vec3.one(), 150).easing(Easing.Sinusoidal.Out);
        const backlightOn = this.backlightTween(0, 1, 250)
            .onComplete(() => {
                global.utils.delay(2, () => this.hideInventoryHint());
            });

        move.chain(rotate);
        rotate.chain(keyShow);
        keyShow.chain(keySettle);
        keySettle.chain(backlightOn);
        move.start();
    }

    private hideInventoryHint(): void {
        const deg = MathUtils.DegToRad;
        const backlightOff = this.backlightTween(1, 0, 180);
        const keyHide = LSTween.scaleFromToLocal(this.keyT, vec3.one(), vec3.zero(), 250).easing(Easing.Back.In);
        const rotateOff = LSTween.rotateOffset(this.wristRT, quat.fromEulerAngles(0, 0, 150 * deg), 500).easing(Easing.Cubic.In);
        const moveOff = LSTween.moveOffset(this.parentT, new vec3(45, 0, 0), 350)
            .easing(Easing.Back.In)
            .onComplete(() => { this.hintChild.enabled = false; });

        backlightOff.chain(keyHide);
        keyHide.chain(rotateOff);
        rotateOff.chain(moveOff);
        backlightOff.start();
    }
}
