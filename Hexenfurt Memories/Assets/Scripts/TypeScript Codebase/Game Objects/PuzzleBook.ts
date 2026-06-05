// A single book in the bookshelf puzzle. BookshelfRO sets bookIdText.text and
// movedCallback on each instance after spawning.

@component
export class PuzzleBook extends BaseScriptComponent {
    @input
    public bookIdText!: Text;

    @input
    public bookInteractable!: ScriptComponent;

    @input
    public bookManipulation!: ScriptComponent;

    @input
    public bookOutline!: ScriptComponent;

    @input
    public materialMeshVisual!: MaterialMeshVisual;

    public bookPushedOut: boolean = false;
    public movedCallback: (() => void) | null = null;

    private static readonly LIGHTNESS_BOOST = 10;

    private initialLocalX: number = 0;
    private bookTransform!: Transform;
    private bookMaterial: Material | null = null;
    private restLightness: number = 0;

    onAwake(): void {
        this.bookTransform = this.getSceneObject().getTransform();
        this.initialLocalX = this.bookTransform.getLocalPosition().x;

        this.createEvent("OnStartEvent").bind(() => {
            const currentMaterial = this.materialMeshVisual.getMaterial(0);
            const newMaterial = currentMaterial.clone();
            this.materialMeshVisual.clearMaterials();
            this.materialMeshVisual.addMaterial(newMaterial);
            const hueValues = [-163.30, -96.30, 50.20, 154.90, -20.90];
            newMaterial.mainPass.hueValue = hueValues[Math.floor(Math.random() * hueValues.length)];

            this.bookMaterial = newMaterial;
            this.restLightness = newMaterial.mainPass.lightnessValue;

            (this.bookInteractable as any).onTriggerEnd.add(() => {
                if (this.bookPushedOut) {
                    this.bookPushedOut = false;
                    global.soundManager.playSpatialSound(this.getSceneObject(), "bookSlide", 0.5, 1);
                    const lp = this.bookTransform.getLocalPosition();
                    const newPos = new vec3(this.initialLocalX, lp.y, lp.z);
                    global.utils.animatePosition(this.getSceneObject(), true, newPos, 0.5, () => this.applyRestVisuals());
                } else {
                    this.bookPushedOut = true;
                    global.soundManager.playSpatialSound(this.getSceneObject(), "bookSlide", 0.5, 1);
                    const lp = this.bookTransform.getLocalPosition();
                    const newPos = new vec3(lp.x + 0.05, lp.y, lp.z);
                    global.utils.animatePosition(this.getSceneObject(), true, newPos, 0.5, () => this.applySelectedVisuals());
                }
                if (this.movedCallback) this.movedCallback();
            });
        });
    }

    private applySelectedVisuals(): void {
        this.flushInteractionComponents();
        this.setBookLightness(this.restLightness + PuzzleBook.LIGHTNESS_BOOST);
    }

    private applyRestVisuals(): void {
        this.flushInteractionComponents();
        this.setBookLightness(this.restLightness);
    }

    private flushInteractionComponents(): void {
        this.bookInteractable.enabled = false; this.bookInteractable.enabled = true;
        this.bookManipulation.enabled = false; this.bookManipulation.enabled = true;
        this.bookOutline.enabled = false; this.bookOutline.enabled = true;
        (this.bookInteractable as any).onAwake();
        (this.bookOutline as any).init();
    }

    private setBookLightness(lightness: number): void {
        const mat = this.materialMeshVisual.getMaterial(0) ?? this.bookMaterial;
        if (!mat) return;
        mat.mainPass.lightnessValue = lightness;
    }
}
