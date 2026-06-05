//@input string loreId
/** @type {string} */
var loreId = script.loreId;
//@input int hangingTo = 0 {"widget":"combobox", "values":[{"label":"Left", "value":0}, {"label":"Right", "value":1}]}

// Optional tuning inputs
//@input float hangAmplitudeDeg = 8.0 {"label":"Hang Amplitude (deg)"}
//@input float hangBiasDeg = 4.0 {"label":"Hang Bias Toward Side (deg)"}
//@input float hangSpeedHz = 0.6 {"label":"Hang Speed (Hz)"}
//@input float resetDuration = 0.35 {"label":"Reset Duration (s)"}

script.getBolt = function() {
    return script.getSceneObject().getChild(0).getChild(0);
}

// ========= Hanging sway around local Z =========
var hangEvent = script.createEvent("UpdateEvent");
hangEvent.enabled = false;

var DEG2RAD = Math.PI / 180.0;
var TWO_PI = Math.PI * 2.0;
var hangTime = 0.0;       // seconds
var hangingActive = false;
var neutralLocalRot = null;

function startHanging() {
    if (!neutralLocalRot) {
        neutralLocalRot = script.getSceneObject().getTransform().getLocalRotation();
    }
    hangTime = 0.0;
    hangingActive = true;
    hangEvent.enabled = true;
}

script.stopHanging = function() {
    hangingActive = false;
    hangEvent.enabled = false;
    if(!neutralLocalRot) return;
    script.getSceneObject().getTransform().setLocalRotation(neutralLocalRot);
}

hangEvent.bind(function(ev) {
    if (!hangingActive) { return; }

    var dt = ev.getDeltaTime();
    hangTime += dt;

    // Bias toward selected side
    // Left (0) = negative Z tilt, Right (1) = positive Z tilt
    var sideSign = (script.hangingTo === 1) ? 1.0 : -1.0;

    var bias = sideSign * script.hangBiasDeg * DEG2RAD;
    var amp = script.hangAmplitudeDeg * DEG2RAD;
    var omega = TWO_PI * script.hangSpeedHz;

    // Smooth oscillation around biased mean
    var angle = bias + amp * Math.sin(omega * hangTime);

    // Rotate around local Z (forward) from the neutral rotation
    var zSwing = quat.angleAxis(angle, vec3.up());
    var finalLocalRot = neutralLocalRot.multiply(zSwing);

    script.getSceneObject().getTransform().setLocalRotation(finalLocalRot);
});

// ========= Smooth reset to neutral before pickup =========
var resetEvent = script.createEvent("UpdateEvent");
resetEvent.enabled = false;

var resetElapsed = 0.0;
var resetFromRot; // quat
function resetRotationToNeutral(onComplete) {
    // Capture current → neutral
    var t = script.getSceneObject().getTransform();
    resetFromRot = t.getLocalRotation();

    // Ensure we use the stored neutral; if not captured yet, capture now
    if (!neutralLocalRot) {
        neutralLocalRot = t.getLocalRotation();
    }

    resetElapsed = 0.0;
    resetEvent.enabled = true;

    // Bind once per reset (unbind at completion)
    resetEvent.bind(function doReset(ev) {
        var dt = ev.getDeltaTime();
        resetElapsed += dt;

        var tt = Math.min(resetElapsed / script.resetDuration, 1.0);

        // Ease out a touch for smooth stop
        var eased = tt * (2 - tt); // quadratic easeOut

        var slerped = quat.slerp(resetFromRot, neutralLocalRot, eased);
        t.setLocalRotation(slerped);

        if (tt >= 1.0) {
            // Done: lock exact neutral, stop, and unbind
            t.setLocalRotation(neutralLocalRot);
            resetEvent.enabled = false;

            if (onComplete) { onComplete(); }
        }
    });
}

// ========= Lifecycle =========
script.createEvent("OnStartEvent").bind(() => {

    // Start the infinite hanging effect right away
    startHanging();
});
