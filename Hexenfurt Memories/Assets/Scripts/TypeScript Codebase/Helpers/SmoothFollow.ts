// Eased follow: copies a target's pose into this object each frame.

import { applySmoothFollow } from "./FollowUtils";

@component
export class SmoothFollow extends BaseScriptComponent {
    @input
    public objectToFollow!: SceneObject;

    @input
    public speed: number = 0.1;

    @input
    public copyPosition: boolean = true;

    @input
    public copyRotation: boolean = true;

    onAwake(): void {
        const selfTransform = this.getTransform();
        const targetTransform = this.objectToFollow.getTransform();

        this.createEvent("UpdateEvent").bind(() => {
            applySmoothFollow(
                selfTransform,
                this.copyPosition ? targetTransform.getWorldPosition() : null,
                this.copyRotation ? targetTransform.getWorldRotation() : null,
                this.speed
            );
        });
    }
}
