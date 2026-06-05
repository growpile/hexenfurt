// Pendulum-swing math for hanging items, shared by HangingLore and LorePickup.

export interface HangSwingParams {
    hangingTo: number;
    hangBiasDeg: number;
    hangAmplitudeDeg: number;
    hangSpeedHz: number;
}

/** Returns the local rotation for a hanging item swinging around the up axis. */
export function computeHangRotation(neutralLocalRot: quat, hangTime: number, p: HangSwingParams): quat {
    const DEG2RAD = Math.PI / 180.0;
    const TWO_PI = Math.PI * 2.0;
    const sideSign = (p.hangingTo === 1) ? 1.0 : -1.0;
    const bias = sideSign * p.hangBiasDeg * DEG2RAD;
    const amp = p.hangAmplitudeDeg * DEG2RAD;
    const omega = TWO_PI * p.hangSpeedHz;
    const angle = bias + amp * Math.sin(omega * hangTime);
    const zSwing = quat.angleAxis(angle, vec3.up());
    return neutralLocalRot.multiply(zSwing);
}
