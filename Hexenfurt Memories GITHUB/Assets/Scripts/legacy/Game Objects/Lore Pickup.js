//@input Component.ScriptComponent itemInteractable
/** @type {ScriptComponent} */
var itemInteractable = script.itemInteractable;
//@input string loreId
/** @type {string} */
var loreId = script.loreId;
//@input SceneObject tooltip
/** @type {SceneObject} */
var tooltip = script.tooltip;
//@input int hangingTo = 0 {"widget":"combobox", "values":[{"label":"Left", "value":0}, {"label":"Right", "value":1}]}

// Optional tuning inputs
//@input float hangAmplitudeDeg = 8.0 {"label":"Hang Amplitude (deg)"}
//@input float hangBiasDeg = 4.0 {"label":"Hang Bias Toward Side (deg)"}
//@input float hangSpeedHz = 0.6 {"label":"Hang Speed (Hz)"}
//@input float resetDuration = 0.35 {"label":"Reset Duration (s)"}

script.getBolt = function() {
    return script.getSceneObject().getChild(0).getChild(0);
}

script.tooltipMainPass = null;
script.chaseValue = 0;

function tooltipSetup() {
    var imageComponent = tooltip.getComponent('Component.Image');
    var newMainMaterial = imageComponent.mainMaterial.clone();
    imageComponent.clearMaterials();
    imageComponent.addMaterial(newMainMaterial);
    script.tooltipMainPass = imageComponent.mainPass;
}

// ========= Tooltip fade LERP (existing) =========
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.enabled = false;
updateEvent.bind(function() {
    script.tooltipMainPass.opacity = global.utils.lerp(script.tooltipMainPass.opacity, script.chaseValue, 0.05);
    if (Math.abs(script.tooltipMainPass.opacity - script.chaseValue) < 0.05) {
        script.tooltipMainPass.opacity = script.chaseValue;
        updateEvent.enabled = false;
    }
});

// ========= Hanging sway around local Z =========
var hangEvent = script.createEvent("UpdateEvent");
hangEvent.enabled = false;

var DEG2RAD = Math.PI / 180.0;
var TWO_PI = Math.PI * 2.0;

var neutralLocalRot;      // quat – captured at start
var hangTime = 0.0;       // seconds
var hangingActive = false;

function startHanging() {
    if (!neutralLocalRot) {
        neutralLocalRot = script.getSceneObject().getTransform().getLocalRotation();
    }
    hangTime = 0.0;
    hangingActive = true;
    hangEvent.enabled = true;
}

function stopHanging() {
    hangingActive = false;
    hangEvent.enabled = false;
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
    tooltipSetup();

    // Start the infinite hanging effect right away
    startHanging();

    itemInteractable.onHoverEnter.add(function() {
        script.chaseValue = 1;
        updateEvent.enabled = true;
    });

    itemInteractable.onHoverExit.add(function() {
        script.chaseValue = 0;
        updateEvent.enabled = true;
    });

    itemInteractable.onTriggerEnd.add(function() {
        if(global.inventory.isInspecting) return;
        itemInteractable.release();

        // 1) Stop hanging
        stopHanging();

        // 2) Smoothly return to neutral
        resetRotationToNeutral(function() {
            // 3) Only AFTER reset, do the pickup chain (exact order requested)
            script.chaseValue = 0;
            updateEvent.enabled = true;
            script.getBolt().destroy();
            global.inventory.addLore(loreId, script.getSceneObject(), script.getSceneObject().getChild(0));
        });
    });
});

// ========= Existing tween entrypoint =========
script.playTween = function() {
    global.tweenManager.startTween(script.getSceneObject(), "item_pickup", function() {
        global.tweenManager.startTween(script.getSceneObject().getChild(0), "orbit");
    });
};
