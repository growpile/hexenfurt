// Locks the clock-arrow interactable to its local XY plane and resets it to the
// origin when manipulation ends.

interface ManipulationEvents {
    onManipulationUpdate: { add(cb: () => void): void };
    onManipulationEnd: { add(cb: () => void): void };
}

@component
export class ClockArrowsLocalXYBinder extends BaseScriptComponent {
    @input
    public arrowInteractable!: ScriptComponent;

    @input
    public arrowManipulation!: ScriptComponent;

    @input
    public arrowDriver!: SceneObject;

    @input
    public arrowOrigin!: SceneObject;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bindEvents());
    }

    private bindEvents(): void {
        const manip = this.arrowManipulation as unknown as ManipulationEvents;

        manip.onManipulationUpdate.add(() => {
            const arrowDriverTransform = this.arrowDriver.getTransform();
            const arrowInteractableTransform = this.getSceneObject().getTransform();
            const currentInteractablePos = arrowInteractableTransform.getLocalPosition();
            arrowDriverTransform.setLocalPosition(new vec3(currentInteractablePos.x, currentInteractablePos.y, 0));
        });

        manip.onManipulationEnd.add(() => {
            const arrowOriginTransform = this.arrowOrigin.getTransform();
            const arrowInteractableTransform = this.getSceneObject().getTransform();
            const originPos = arrowOriginTransform.getWorldPosition();
            arrowInteractableTransform.setWorldPosition(originPos);
        });
    }
}
