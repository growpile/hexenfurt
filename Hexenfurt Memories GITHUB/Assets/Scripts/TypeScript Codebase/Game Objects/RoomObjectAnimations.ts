// LSTween animation builders shared by lockable room objects: the "shake when
// locked" wobble and the "insert key, then scale out" sequence.

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

export interface ShakeStep {
    angleDeg: number;
    durationMs: number;
}

/** Plays a damped rotational shake around `axis` (relative to `restRotation`),
 *  then settles back to rest. Used for "this is locked" feedback on chests,
 *  lock bodies, and doors. */
export function playShake(
    transform: Transform,
    restRotation: quat,
    axis: vec3,
    steps: ShakeStep[],
    settleMs: number,
    onComplete?: () => void
): void {
    const deg = MathUtils.DegToRad;
    const quadOut = Easing.Quadratic.Out;

    const tweens: any[] = [];
    for (let i = 0; i < steps.length; i++) {
        const offset = quat.angleAxis(steps[i].angleDeg * deg, axis).multiply(restRotation);
        tweens.push(LSTween.rotateToLocal(transform, offset, steps[i].durationMs).easing(quadOut));
    }
    const settle = LSTween.rotateToLocal(transform, restRotation, settleMs).easing(quadOut);
    if (onComplete) settle.onComplete(onComplete);

    if (tweens.length === 0) { settle.start(); return; }
    for (let i = 0; i < tweens.length - 1; i++) tweens[i].chain(tweens[i + 1]);
    tweens[tweens.length - 1].chain(settle);
    tweens[0].start();
}

export interface KeySpin {
    durationMs: number;
    /** Easing function from LSTween's Easing table, e.g. Easing.Quadratic.In. */
    easing: any;
}

export interface KeyInsertChain {
    /** First tween in the sequence; call .start() once fully chained. */
    first: any;
    /** Last tween (scale-out). Chain follow-up tweens or attach .onComplete(). */
    last: any;
}

/** Builds the shared "scale key in -> push -> spin(s) -> scale key out" sequence
 *  but does NOT start it, so the caller can chain its object-specific unlock
 *  tweens onto `last` (chest lock parts) or attach an onComplete (door). */
export function buildKeyInsert(
    keyParentTransform: Transform,
    keyTransform: Transform,
    keyScale: vec3,
    spins: KeySpin[]
): KeyInsertChain {
    const ZERO = vec3.zero();
    const quadOut = Easing.Quadratic.Out;
    const halfTurnX = quat.angleAxis(Math.PI, vec3.right());

    const scaleOnKey = LSTween.scaleFromToLocal(keyParentTransform, ZERO, keyScale, 300).easing(quadOut);
    const pushKey = LSTween.moveOffset(keyParentTransform, new vec3(0, 0, -3.6), 300).easing(quadOut);
    scaleOnKey.chain(pushKey);

    let prev = pushKey;
    for (let i = 0; i < spins.length; i++) {
        const spin = LSTween.rotateOffset(keyTransform, halfTurnX, spins[i].durationMs).easing(spins[i].easing);
        prev.chain(spin);
        prev = spin;
    }

    const scaleOffKey = LSTween.scaleFromToLocal(keyParentTransform, keyScale, ZERO, 300).easing(quadOut);
    prev.chain(scaleOffKey);

    return { first: scaleOnKey, last: scaleOffKey };
}
