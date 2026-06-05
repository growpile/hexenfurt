// Palm-up in-game menu. Only active once gameplay has started (Phase.Game).

const sikModule_HM = require("SpectaclesInteractionKit.lspkg/SIK");
const SIK_HM = sikModule_HM.SIK || sikModule_HM.default || sikModule_HM;
const WorldCameraFinderProviderClass = require("SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider").default;
const animateModule_HM = require("SpectaclesInteractionKit.lspkg/Utils/animate");
const animate = animateModule_HM.default;
const CancelSet = animateModule_HM.CancelSet;

@component
export class HandMenu extends BaseScriptComponent {
    // @input int hand = 0 {"widget":"combobox", "values":[{"label":"Left", "value":0}, {"label":"Right", "value":1}]}
    @input
    public hand: number = 0;

    @input
    public buttonHorizontalSpacing: number = 1.0;

    @input
    @allowUndefined
    @hint("Preferred: GameFlow component; menu is hidden unless `currentPhase === 6` (Phase.Game).")
    public gameFlow: ScriptComponent | null = null;

    private menuButtons: SceneObject[] = [];
    private menuButtonTransforms: Transform[] = [];
    private buttonAnimations: any[] = [];
    private isShown: boolean = false;
    private menuHand: any;
    private mCamera: any = null;

    onAwake(): void {
        const handProvider = SIK_HM.HandInputData;
        this.menuHand = (this.hand === 1) ? handProvider.getHand("right") : handProvider.getHand("left");

        if (!this.mCamera) this.mCamera = new WorldCameraFinderProviderClass();

        const sceneObject = this.getSceneObject();
        for (let i = 0; i < sceneObject.getChildrenCount(); i++) {
            const child = sceneObject.getChild(i);
            this.menuButtons.push(child);
            this.menuButtonTransforms.push(child.getTransform());
        }

        this.layoutMenu();
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());

        const delay = this.createEvent("DelayedCallbackEvent");
        delay.bind(() => {
            if (global.deviceInfoSystem.isEditor()) this.showMenu();
            else this.hideMenu();
        });
        delay.reset(0.25);
    }

    private onUpdate(): void {
        this.positionMenu();
        this.checkForMenuActivation();
    }

    private layoutMenu(): void {
        for (let i = 0; i < this.menuButtons.length; i++) {
            const transform = this.menuButtonTransforms[i];
            transform.setLocalPosition(new vec3(this.buttonHorizontalSpacing * (i + 1), 0, 0));
            transform.setLocalRotation(quat.quatIdentity());
        }
    }

    private checkForMenuActivation(): void {
        const flow = this.gameFlow as any;
        const phase = flow ? flow.currentPhase : null;
        const gameplayStarted = !!(flow && flow.gameplayStarted);
        if (phase !== 6 || !gameplayStarted) {
            this.hideMenu();
        } else {
            if (global.deviceInfoSystem.isEditor()) { this.showMenu(); return; }
            if (this.menuHand.isTracked() && this.menuHand.isFacingCamera()) {
                if (!this.isShown) this.showMenu();
            } else if (this.isShown) {
                this.hideMenu();
            }
        }
    }

    private positionMenu(): void {
        const handPosition = this.menuHand.pinkyKnuckle.position;
        const handRight = this.menuHand.indexTip.right;
        const curPosition = this.getSceneObject().getTransform().getWorldPosition();
        let menuPosition = handPosition.add(handRight.uniformScale(1.5));

        if (global.deviceInfoSystem.isEditor()) {
            menuPosition = this.mCamera.getWorldPosition().add(new vec3(0, -20, -25));
        }

        const nPosition = vec3.lerp(curPosition, menuPosition, 0.5);
        this.getSceneObject().getTransform().setWorldPosition(nPosition);

        let billboardPos = this.mCamera.getWorldPosition().add(this.mCamera.forward().uniformScale(5));
        billboardPos = billboardPos.add(this.mCamera.right().uniformScale(-5));

        const dir = billboardPos.sub(menuPosition).normalize();
        this.getSceneObject().getTransform().setWorldRotation(quat.lookAt(dir, vec3.up()));
    }

    private showMenu(): void {
        this.isShown = true;
        for (let i = 0; i < this.menuButtons.length; i++) {
            const btn = this.menuButtons[i];
            btn.enabled = true;

            if (i < this.buttonAnimations.length && this.buttonAnimations[i] instanceof CancelSet) {
                this.buttonAnimations[i].cancelAll();
            } else {
                this.buttonAnimations[i] = new CancelSet();
            }

            animate({
                cancelSet: this.buttonAnimations[i],
                duration: 0.2,
                delayFrames: i * 4,
                update: (t: number) => {
                    const s = MathUtils.lerp(1.0, 1.3, t);
                    btn.getTransform().setLocalScale(new vec3(s, s, s));
                },
            });
        }
    }

    private hideMenu(): void {
        this.isShown = false;
        for (let i = 0; i < this.menuButtons.length; i++) {
            this.menuButtons[i].enabled = false;
        }
    }
}
