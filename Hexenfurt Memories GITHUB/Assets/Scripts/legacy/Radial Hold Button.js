//@input SceneObject[] buttons
/** @type {SceneObject[]} */
var buttons = script.buttons;
//@input Component.ScriptComponent[] buttonStateComponents
/** @type {ScriptComponent[]} */
var buttonStateComponents = script.buttonStateComponents;
//@input Asset.Material buttonRadialMaterial
/** @type {Material} */
var buttonRadialMaterial = script.buttonRadialMaterial;
//@input bool startActive
/** @type {boolean} */
var startActive = script.startActive;
//@input float holdBoostValue = 0.0005   // Interpreted as acceleration (progress/sec^2)
/** @type {number} */
var holdBoostValue = script.holdBoostValue;
//@input float buttonNeededHold = 1.0     // Target progress before "complete"
/** @type {number} */
var buttonNeededHold = script.buttonNeededHold;
//@input Component.ScriptComponent functionScript
/** @type {ScriptComponent} */
var functionScript = script.functionScript;
//@input string functionName
/** @type {string} */
var functionName = script.functionName;
//@input float totalHoldTime = 2.0        // Force completion in exactly 2s
/** @type {number} */
var totalHoldTime = script.totalHoldTime || 2.0;

script.nextButtonHold = 0.0;

// Internals for time-based progression
var _elapsed = 0.0;
var _baseSpeed = 0.0;   // progress/sec at t=0 (v0)
var _accel = 0.0;       // progress/sec^2 (a)

script.setEnabled = function(state) {
    if (state) {
        global.utils.stateChangeArrayWithException(buttons, 0, true);
    } else {
        global.utils.stateChangeArrayWithException(buttons, 1, true);
    }
};

script.createEvent("OnStartEvent").bind(function() {
    if (startActive) {
        global.utils.stateChangeArrayWithException(buttons, 0, true);
    } else {
        global.utils.stateChangeArrayWithException(buttons, 1, true);
    }

    var updateEvent = script.createEvent("UpdateEvent");
    updateEvent.enabled = false;

    updateEvent.bind(function(eventData) {
        var dt = eventData.getDeltaTime();
        _elapsed += dt;

        // Closed-form progress with acceleration:
        // p(t) = v0 * t + 0.5 * a * t^2
        var p = (_baseSpeed * _elapsed) + (0.5 * _accel * _elapsed * _elapsed);

        // Normalize to [0..1] for the material (in case buttonNeededHold != 1)
        var normalized = Math.min(p / buttonNeededHold, 1.0);
        buttonRadialMaterial.mainPass.progress = normalized;

        if (p >= buttonNeededHold || _elapsed >= totalHoldTime) {
            // Snap to full
            script.nextButtonHold = buttonNeededHold;
            buttonRadialMaterial.mainPass.progress = 1.0;
            updateEvent.enabled = false;

            // Small delay to show filled state, then fire
            global.utils.delay(0.25, function() {
                // Reset visual
                script.nextButtonHold = 0.0;
                _elapsed = 0.0;
                buttonRadialMaterial.mainPass.progress = 0.0;

                // Call the function
                functionScript[functionName]();
            });
        }
    });

    function configureKinematics() {
        // We want: p(T) = v0*T + 0.5*a*T^2 = buttonNeededHold
        // Solve for v0 based on chosen a (boost):
        var T = totalHoldTime;
        var target = buttonNeededHold;

        // Keep a within feasible bounds so v0 >= 0:
        // Max a occurs when v0=0 -> a_max = 2*target / T^2
        var aMax = (2 * target) / (T * T);
        _accel = Math.max(0.0, Math.min(holdBoostValue, aMax));

        // Now compute v0 so we still finish exactly at T:
        _baseSpeed = (target - 0.5 * _accel * T * T) / T;
        if (_baseSpeed < 0) {
            _baseSpeed = 0;
        }
    }

    buttonStateComponents[0].interactable.onTriggerStart.add(function() {
        // Reset
        script.nextButtonHold = 0.0;
        _elapsed = 0.0;
        buttonRadialMaterial.mainPass.progress = 0.0;

        // Configure speeds for a 2s finish regardless of boost
        configureKinematics();

        updateEvent.enabled = true;
    });

    buttonStateComponents[0].interactable.onTriggerEnd.add(function() {
        // Cancel and reset if released early
        script.nextButtonHold = 0.0;
        _elapsed = 0.0;
        buttonRadialMaterial.mainPass.progress = 0.0;
        updateEvent.enabled = false;
    });
});
