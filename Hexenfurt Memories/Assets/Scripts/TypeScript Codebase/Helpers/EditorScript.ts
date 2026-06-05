// Editor-only helper hook.

@component
export class EditorScript extends BaseScriptComponent {
    @input
    @hint("Object that should only be enabled inside Lens Studio (e.g. simulator-only Play button).")
    public editorObject!: SceneObject;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.editorObject.enabled = global.deviceInfoSystem.isEditor();
        });
    }
}
