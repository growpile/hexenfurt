// Collectable item or clue note. Exposes isNote, itemId, noteTextComponent, and
// playTween for ProceduralRoom.

@component
export class ItemPickup extends BaseScriptComponent {
    @input
    public itemInteractable!: ScriptComponent;

    @input
    public itemManipulation!: ScriptComponent;

    @input
    @allowUndefined
    public itemOutline: ScriptComponent | null = null;

    @input
    public itemId: string = "";

    @input
    public isNote: boolean = false;

    // @input Component.Text noteTextComponent {"showIf":"isNote"}
    @input
    @allowUndefined
    public noteTextComponent: Text | null = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.itemInteractable.enabled = false;
            global.utils.delay(0.7, () => { this.itemInteractable.enabled = true; });

            (this.itemInteractable as any).onTriggerEnd.add(() => {
                if (global.inventory.isInspecting) return;
                (this.itemInteractable as any).release();
                if (this.itemOutline) this.itemOutline.enabled = false;

                if (this.isNote) {
                    const text = this.noteTextComponent ? this.noteTextComponent.text : "";
                    global.inventory.addNote(text, this.getSceneObject());
                } else {
                    global.inventory.addItem(this.itemId, this.getSceneObject());
                }
            });
        });
    }

    public playTween = (): void => {
        global.tweenManager.startTween(this.getSceneObject(), "item_pickup", () => {
            global.tweenManager.startTween(this.getSceneObject().getChild(0), "orbit");
        });
    };
}
