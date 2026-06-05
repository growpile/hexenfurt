// Looping spatial ambience at this scene object's position, with inspector-
// configurable sound id and volume.

@component
export class SoundAmbience extends BaseScriptComponent {
    @input
    @label("Sound ID")
    public soundId: string = "";

    @input("float", "1.0")
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    @label("Volume")
    public volume: number = 1.0;

    private started: boolean = false;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.startAmbience());
        this.createEvent("OnDestroyEvent").bind(() => this.stopAmbience());
    }

    private startAmbience(): void {
        const id = (this.soundId || "").trim();
        if (!id) {
            print("SoundAmbience: soundId is empty on " + this.getSceneObject().name);
            return;
        }
        const vol = Math.min(1, Math.max(0, this.volume));
        global.soundManager.playSpatialSound(this.getSceneObject(), id, vol, -1);
        this.started = true;
    }

    private stopAmbience(): void {
        if (!this.started) return;
        const id = (this.soundId || "").trim();
        if (!id) return;
        global.soundManager.stopSpatialSound(this.getSceneObject(), id);
        this.started = false;
    }
}
