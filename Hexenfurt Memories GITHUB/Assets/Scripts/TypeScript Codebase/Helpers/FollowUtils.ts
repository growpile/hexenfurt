// Eased-follow step shared by the follow helpers.

// Moves/rotates `transform` toward the given world-space targets. Pass null to
// skip an axis; when `speed >= 1` the target is applied immediately.
export function applySmoothFollow(
    transform: Transform,
    desiredPosition: vec3 | null,
    desiredRotation: quat | null,
    speed: number
): void {
    if (desiredPosition) {
        const current = transform.getWorldPosition();
        transform.setWorldPosition(speed >= 1 ? desiredPosition : vec3.lerp(current, desiredPosition, speed));
    }
    if (desiredRotation) {
        const current = transform.getWorldRotation();
        transform.setWorldRotation(speed >= 1 ? desiredRotation : quat.slerp(current, desiredRotation, speed));
    }
}
