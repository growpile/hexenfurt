global.utils = self;

// Changes the specified index' enabled state and then
// the rest of the array to the opposite
global.utils.stateChangeArrayWithException = function(array, exceptionIndex, exceptionState) {
    for(var i = 0; i<array.length; i++) {
        array[i].enabled = !exceptionState;
    }
    array[exceptionIndex].enabled = exceptionState;
}

// Changes the entire array to a specified enabled state
global.utils.stateChangeArray = function(array, state) {
    for(var i = 0; i<array.length; i++) {
        array[i].enabled = state;
    }
}

// Removes (destroys) all direct children of a SceneObject
global.utils.removeAllChildren = function(sceneObject) {
    if (!sceneObject) return;
    for (var i = sceneObject.getChildrenCount() - 1; i >= 0; i--) {
        var child = sceneObject.getChild(i);
        if (child) {
            child.destroy();
        }
    }
};


// Changes the entire array class property to a specified enabled state
global.utils.stateChangeArrayClassProperty = function(array, propName, state) {
    for(var i = 0; i<array.length; i++) {
        array[i][propName].enabled = state;
    }
}

// Returns a random Int between min/max
global.utils.rng = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a random Float between min/max
global.utils.rngFloat = function(min, max, decimals) {
    var str = (Math.random() * (max - min) + min).toFixed(decimals);
    return parseFloat(str);
}

// Linear interpolation
global.utils.lerp = function(start, end, amt){
    return (1-amt)*start+amt*end
}

// Returns true if the array contains the specified item
global.utils.arrayContains = function(array, item) {
    for (var i = 0; i < array.length; i++) {
        if (array[i] == item) {
            return true;
        }
    }
    return false;
}

// Executes a function after the specified time has elapsed
// Can be provided with an ID, so the delay can be prematurely invalidated
// global.utils.delay(2, callback) - No ID provided, can't be invalidated
// global.utils.delay("someId", 2, callback) - ID provided, can be invalidated
global.utils.delayedCallbacks = {};
global.utils.delay = function(idOrDelay, delayOrCallback, callback) {
    var id = null, delay, cb;
    
    if (typeof idOrDelay === "string" && typeof delayOrCallback === "number" && typeof callback === "function") {
        id = idOrDelay;
        delay = delayOrCallback;
        cb = callback;
    } else if (typeof idOrDelay === "number" && typeof delayOrCallback === "function") {
        delay = idOrDelay;
        cb = delayOrCallback;
    } else {
        return;
    }
    
    if (id && global.utils.delayedCallbacks[id]) {
        global.invalidateTimer(id);
    }

    var delayedEvent = script.createEvent("DelayedCallbackEvent");
    delayedEvent.bind(function () {
        if (id) {
            delete global.utils.delayedCallbacks[id];
        }
        cb();
    });

    delayedEvent.reset(delay);
    
    if (id) {
        global.utils.delayedCallbacks[id] = delayedEvent;
    }
};

// Invalidates the delay with matching ID
global.utils.invalidateDelay = function(id) {
    if (global.utils.delayedCallbacks[id]) {
        global.utils.delayedCallbacks[id].cancel();
        delete global.utils.delayedCallbacks[id];
    }
};

var activeAnimations = [];

function registerAnimation(sceneObject, animationData) {
    if (!sceneObject) return;

    // We'll store animations on the object itself
    if (!sceneObject.animations) {
        sceneObject.animations = [];
    }

    // Example: "objectName_position" → prefix = "position"
    var prefix = animationData.id.split("_")[1];

    // Cancel previous animation with same prefix
    for (var i = sceneObject.animations.length - 1; i >= 0; i--) {
        var existing = sceneObject.animations[i];
        if (existing.id.includes(prefix)) {
            if (existing.updateEvent) {
                existing.updateEvent.enabled = false;
            }
            sceneObject.animations.splice(i, 1);
        }
    }

    // Add to object and global list
    sceneObject.animations.push(animationData);
    activeAnimations.push(animationData);

    // Define cleanup method
    animationData.cleanup = function() {
        if (sceneObject.animations) {
            sceneObject.animations = sceneObject.animations.filter(a => a !== animationData);
        }
        activeAnimations = activeAnimations.filter(a => a !== animationData);
    };
}

global.utils.animatePosition = function(sceneObject, isLocal, newPosition, duration, callback) {
    if (!sceneObject) return;

    var transform = sceneObject.getTransform();

    // Create animation data
    var animationData = {
        id: sceneObject.name + "_position",
        startTime: getTime(),
        updateEvent: script.createEvent("UpdateEvent")
    };

    // Register so cleanup() is added automatically
    registerAnimation(sceneObject, animationData);

    var startPosition = isLocal
        ? transform.getLocalPosition()
        : transform.getWorldPosition();

    animationData.updateEvent.bind(function() {
        var elapsed = getTime() - animationData.startTime;
        var t = Math.min(elapsed / duration, 1);

        // Smooth easing
        var smoothT = t * t * (3 - 2 * t);
        var currentPosition = vec3.lerp(startPosition, newPosition, smoothT);

        if (isLocal) {
            transform.setLocalPosition(currentPosition);
        } else {
            transform.setWorldPosition(currentPosition);
        }

        // When finished
        if (t >= 1) {
            if (isLocal) {
                transform.setLocalPosition(newPosition);
            } else {
                transform.setWorldPosition(newPosition);
            }

            // Clean up via registered cleanup()
            if (animationData.cleanup) {
                animationData.cleanup();
            }

            animationData.updateEvent.enabled = false;
            animationData.updateEvent = null;

            if (callback) callback();
        }
    });
};

global.utils.animateRotation = function(sceneObject, isLocal, newRotation, duration, callback) {
    if (!sceneObject) return;

    var transform = sceneObject.getTransform();

    var animationData = {
        id: sceneObject.name + "_rotation",
        startTime: getTime(),
        updateEvent: script.createEvent("UpdateEvent")
    };

    // Register so cleanup() gets attached
    registerAnimation(sceneObject, animationData);

    // Convert incoming rotation (vec3 or quat) to quat
    var DEG_TO_RAD = 0.0174533;
    var targetQuat = newRotation instanceof quat
        ? newRotation
        : quat.fromEulerAngles(
            newRotation.x * DEG_TO_RAD,
            newRotation.y * DEG_TO_RAD,
            newRotation.z * DEG_TO_RAD
        );

    // Get starting rotation
    var startQuat = isLocal
        ? transform.getLocalRotation()
        : transform.getWorldRotation();

    animationData.updateEvent.bind(function() {
        var elapsed = getTime() - animationData.startTime;
        var t = Math.min(elapsed / duration, 1);
        var smoothT = t * t * (3 - 2 * t); // smooth easing

        // Slerp between quaternions
        var currentQuat = quat.slerp(startQuat, targetQuat, smoothT);
        currentQuat.normalize();

        if (isLocal) {
            transform.setLocalRotation(currentQuat);
        } else {
            transform.setWorldRotation(currentQuat);
        }

        if (t >= 1) {
            // Snap to final rotation
            if (isLocal) {
                transform.setLocalRotation(targetQuat);
            } else {
                transform.setWorldRotation(targetQuat);
            }

            if (animationData.cleanup) {
                animationData.cleanup();
            }

            animationData.updateEvent.enabled = false;
            animationData.updateEvent = null;

            if (callback) callback();
        }
    });
};

// write the scale animation function
global.utils.animateScale = function(sceneObject, isLocal, newScale, duration, callback) {
    if (!sceneObject) return;

    var transform = sceneObject.getTransform();

    var animationData = {
        id: sceneObject.name + "_scale",
        startTime: getTime(),
        updateEvent: script.createEvent("UpdateEvent")
    };

    // Register so cleanup() gets attached
    registerAnimation(sceneObject, animationData);

    var startScale = isLocal
        ? transform.getLocalScale()
        : transform.getWorldScale();

    animationData.updateEvent.bind(function() {
        var elapsed = getTime() - animationData.startTime;
        var t = Math.min(elapsed / duration, 1);
        var smoothT = t * t * (3 - 2 * t); // smooth easing

        var currentScale = vec3.lerp(startScale, newScale, smoothT);
        transform.setLocalScale(currentScale);

        if (t >= 1) {
            // Snap to final scale
            if (isLocal) {
                transform.setLocalScale(newScale);
            } else {
                transform.setWorldScale(newScale);
            }

            if (animationData.cleanup) {
                animationData.cleanup();
            }

            animationData.updateEvent.enabled = false;
            animationData.updateEvent = null;

            if (callback) callback();
        }
    });
}