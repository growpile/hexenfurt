// Starts the spatial fan loop shortly after spawn.

@component
export class FanAmbience extends BaseScriptComponent {
    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            global.utils.delay(1, () => {
                global.soundManager.playSpatialSound(this.getSceneObject(), "fanLoop", 1, -1);
            });
        });
    }
}
