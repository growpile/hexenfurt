// A book in a decorative stack. When touched it becomes dynamic and calls the
// parent stack's bookMoved.

@component
export class BookDecoration extends BaseScriptComponent {
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

    @input
    public bookBody!: BodyComponent;

    public bookPushedOut: boolean = false;
    public movedCallback: (() => void) | null = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            const currentMaterial = this.materialMeshVisual.getMaterial(0);
            const newMaterial = currentMaterial.clone();
            this.materialMeshVisual.clearMaterials();
            this.materialMeshVisual.addMaterial(newMaterial);
            const hueValues = [-163.30, -96.30, 50.20, 154.90, -20.90];
            newMaterial.mainPass.hueValue = hueValues[Math.floor(Math.random() * hueValues.length)];

            (this.bookInteractable as any).onTriggerStart.add(() => {
                const parent = this.getSceneObject().getParent();
                if (parent) {
                    const parentScript = parent.getComponent("Component.ScriptComponent") as any;
                    if (parentScript && typeof parentScript.bookMoved === "function") {
                        parentScript.bookMoved();
                    }
                }
                this.bookBody.dynamic = true;
                (this.bookInteractable as any).release();
                this.bookOutline.enabled = false;
            });
        });
    }
}
