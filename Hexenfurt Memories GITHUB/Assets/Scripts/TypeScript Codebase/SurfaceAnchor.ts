// Placeable surface anchor. Clones its visual material and exposes
// destroyAnchor() plus a per-anchor delay() helper.

interface DelayedCallbackEntry {
    callback: () => void;
    event: SceneEvent;
}

@component
export class SurfaceAnchor extends BaseScriptComponent {
    private delayedCallbacks: DelayedCallbackEntry[] = [];

    onAwake(): void {
        const child = this.getSceneObject().getChild(1);
        if (child) {
            const mmv = child.getComponent("Component.MaterialMeshVisual");
            if (mmv) {
                const newMat = mmv.getMaterial(0).clone();
                mmv.clearMaterials();
                mmv.addMaterial(newMat);
            }
        }
    }

    public delay(delay: number, callback: () => void): void {
        if (typeof callback !== "function") return;
        const delayedEvent = this.createEvent("DelayedCallbackEvent");
        const entry: DelayedCallbackEntry = { callback, event: delayedEvent };
        this.delayedCallbacks.push(entry);
        delayedEvent.bind(() => {
            const idx = this.delayedCallbacks.indexOf(entry);
            if (idx > -1) this.delayedCallbacks.splice(idx, 1);
            callback();
        });
        delayedEvent.reset(delay);
    }

    public destroyAnchor = (): void => {
        print(" Surface Anchor destroyed!");
        const so = this.getSceneObject();
        global.surfaceAnchors = (global.surfaceAnchors || []).filter((entry) => entry.anchorObject !== so);
        global.removedAnchor();
        this.delay(0.1, () => so.destroy());
    };
}
