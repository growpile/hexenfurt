// @input Component.Camera camera
// @input int maxHitDistance = 270.0
// @input SceneObject hitOriginObject
// @input bool filter
// @input float angleThreshold = 45.0
// @input int wallYOffset = -20.0
// @input int maxDistanceToOtherAnchors = 100.0
// @input SceneObject[] placementGuides
// @input SceneObject groundPlane
// @input Asset.ObjectPrefab anchorPrefab
// @input Component.ScriptComponent logic
// @input Component.Text hintText 
// @input SceneObject tweens
// @input int groundAnchorLevelPrecision = 10
// @input Asset.Material worldGridMaterial

// @input SceneObject anchorVisualsRoot
// @ui {"widget":"group_start", "label":"Anchor Settings"}
// @input int groundAnchorsTarget = 2
// @input int wallAnchorsTarget = 2
// @input int ceilingAnchorsTarget = 1
// @ui {"widget":"group_end"}

const WorldQueryModule = require("LensStudio:WorldQueryModule");
const SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
const InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;

script.eyeHeight = null;
script.groundHeight = null;
global.groundHeight = -170.0;
script.exitDoor = null;
global.surfaceAnchors = [];

script.measureButton = false;
script.lastFaced = "null";

script.currentlyRecording = null;
// "eye-height"
// "ground-height"
// "exit-door"
// "poi-anchors"

script.recordingData = 
{
    objective: null,
    recorded: null,
    callback: null,
    recordingMsg: "Hello World!"
}

script.reset = function() {
    script.eyeHeight = null;
    script.groundHeight = null;
    global.groundHeight = -170.0;
    script.exitDoor = null;
    global.surfaceAnchors = [];
    script.measureButton = false;
    script.currentlyRecording = null;
    script.recordingData = 
    {
        objective: null,
        recorded: null,
        callback: null,
        recordingMsg: "Hello World!"
    }
    script.anchorVisualsRoot.enabled = true;
    global.utils.removeAllChildren(script.anchorVisualsRoot);
    script.logic.updateAnchorRequirementsHint();
}

function lerp(start, end, amt) {
    return (1-amt)*start+amt*end
}

function snapEyeHeight(callback) {
    script.eyeHeight = getCameraPosition().y;
    if (typeof callback === "function") { callback(); }
}

function displayAnchorHint(identifiedSurface) {
    if (isSurfaceNeeded(identifiedSurface.surfaceType)) {
        if (!farEnoughFromOtherAnchors(identifiedSurface.position)) {
            newHint("Too close to another anchor.");
        } else if(!farEnoughFromDoor(identifiedSurface.position)) {
            newHint("Too close to escape door.");
        } else if(identifiedSurface.surfaceType == "ground" && !closeEnoughToFloorLevel(identifiedSurface.position)) {
            newHint("Ground anchor too far from floor.");
        } else if(farEnoughFromOtherAnchors(identifiedSurface.position) && farEnoughFromDoor(identifiedSurface.position)) {
            clearHint();
        }
    } else {
        newHint("You already have enough " + identifiedSurface.surfaceType + " anchors.");
    }
}

var currentHint = "";

function newHint(hintText) {
    if(currentHint == hintText) return;
    currentHint = hintText;
    script.logic.updateAnchorRequirementsHint();
}

function clearHint() {
    currentHint = "";
    script.logic.updateAnchorRequirementsHint();
}

//@input float maxHold = 0.3 {"label":"Max Hold For Tap (s)"}

var _pinchStartTime = 0;

function pinchingAir() {
    var primaryInteractor = SIK.InteractionManager.getTargetingInteractors().shift();
    if (!primaryInteractor) { return false; }

    // Record start time when pinch begins
    if (primaryInteractor.previousTrigger === InteractorTriggerType.None &&
        primaryInteractor.currentTrigger  !== InteractorTriggerType.None) {
        _pinchStartTime = getTime();
        return false;
    }

    // On release, check duration + "air" targeting
    if (primaryInteractor.previousTrigger !== InteractorTriggerType.None &&
        primaryInteractor.currentTrigger  === InteractorTriggerType.None) {

        var inAir = (primaryInteractor.targetHitInfo == null) ||
                    (primaryInteractor.targetHitInfo.hit &&
                     primaryInteractor.targetHitInfo.hit.collider &&
                     primaryInteractor.targetHitInfo.hit.collider.getSceneObject() &&
                     primaryInteractor.targetHitInfo.hit.collider.getSceneObject().name == "Setup View");

        var held = getTime() - _pinchStartTime;
        var maxHold = (typeof script.maxHold === "number" && script.maxHold > 0) ? script.maxHold : 0.3;

        return inAir && held <= maxHold;
    }

    return false;
}


function safeStringify(obj) {
    var seen = new WeakSet();
    return JSON.stringify(obj, function(key, value) {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[[Circular]]";
            seen.add(value);
        }
        return value;
    });
}

function switchVisualHint() {
    switch(script.currentlyRecording) {
        case "ground-height":
            global.utils.stateChangeArrayWithException(script.placementGuides, 0, true);
            break;
        case "exit-door":
            global.utils.stateChangeArrayWithException(script.placementGuides, 1, true);
            break;
        case "poi-anchors":
            global.utils.stateChangeArrayWithException(script.placementGuides, 2, true);
            break;
    }
}

// identifying surfaces
function identifySurfaceType(position, normal) {
    var hitPosition = position;
    var hitNormal = normal;

    // calculate properties
    var upVector = vec3.up();
    var dotProduct = hitNormal.dot(upVector);
    dotProduct = Math.min(Math.max(dotProduct, -1.0), 1.0);
    var angle = Math.acos(dotProduct) * (180 / Math.PI);
    var lookDirection = hitNormal.cross(vec3.up());
    var toRotation = quat.lookAt(lookDirection, hitNormal);
    
    var surfaceType = "";
    if (angle <= script.angleThreshold) {
        surfaceType = "ground";
        toRotation = quat.lookAt(vec3.forward(), vec3.up());
    } else if (angle >= (180.0 - script.angleThreshold)) {
        surfaceType = "ceiling";
        toRotation = quat.lookAt(vec3.forward(), vec3.down());
    } else {
        surfaceType = "wall";
        hitPosition.y = script.eyeHeight - script.wallYOffset;
        if(script.currentlyRecording == "exit-door") {
            hitPosition.y = script.groundHeight;
        }
    }
    script.lastFaced = surfaceType;

    // include outward normal for wall logic (and later use)
    var resultObject = {
        surfaceType: surfaceType,
        position: hitPosition,
        rotation: toRotation, // for visual gizmo only
        normal: hitNormal     // outward surface normal
    }

    return resultObject;
}

function getCameraPosition() {
    return script.camera.getTransform().getWorldPosition();
}

// scale event
function scaleEvent(newScale, scaleSpeed) {
    var updateEvent = script.createEvent("UpdateEvent");
    var control = 0;    
    updateEvent.bind(function() {
        control = lerp(control, 1, scaleSpeed);
        currentScale = script.hitOriginObject.getTransform().getWorldScale();
        script.hitOriginObject.getTransform().setWorldScale(vec3.lerp(currentScale, new vec3(newScale, newScale, newScale), scaleSpeed));
        if(Math.abs(control - 1) < 0.01) {
            script.hitOriginObject.getTransform().setWorldScale(new vec3(newScale, newScale, newScale));
            updateEvent.enabled = false;
        }
    })
}

function createHitTestSession() {
    var options = HitTestSessionOptions.create();
    options.filter = script.filter;
    return WorldQueryModule.createHitTestSessionWithOptions(options);
}

function performHitTest(rayStart, rayEnd) {
    script.hitTestSession.hitTest(rayStart, rayEnd, onHitTestResult);
}

function scan(eventData) {
    cameraTransform = script.camera.getTransform();
    cameraPosition = getCameraPosition();
    rayDirection = cameraTransform.forward;

    rayDirection.y -= .1;

    rayStart = cameraPosition;
    rayEnd = rayStart.add(rayDirection.uniformScale(-script.maxHitDistance))

    performHitTest(rayStart, rayEnd);
}
var scanEvent = script.createEvent("UpdateEvent");
scanEvent.enabled = false;
scanEvent.bind(scan);

var eyeCallback = null;
function eyeHeightRecording() {
    if(pinchingAir()) {
        snapEyeHeight(eyeCallback);
    }
}
var eyeHeightEvent = script.createEvent("UpdateEvent");
eyeHeightEvent.enabled = false;
eyeHeightEvent.bind(eyeHeightRecording);

function isSurfaceNeeded(surfaceType) {
    var groundCount = 0;
    var wallCount = 0;
    var ceilingCount = 0;

    for(let anchor of global.surfaceAnchors) {
        switch(anchor.surfaceType) {
            case "ground":
                groundCount++;
                break;
            case "wall":
                wallCount++;
                break;
            case "ceiling":
                ceilingCount++;
                break;
        }
    }

    switch(surfaceType) {
        case "ground":
            return (1 + groundCount) <= script.groundAnchorsTarget;
        case "wall":
            return (1 + wallCount) <= script.wallAnchorsTarget;
        case "ceiling":
            return (1 + ceilingCount) <= script.ceilingAnchorsTarget;
    }
}

function closeEnoughToFloorLevel(position) {
    var flatPosition = new vec3(0, position.y, 0);
    var floorPosition = new vec3(0, script.groundHeight, 0);
    var distanceToFloor = flatPosition.distance(floorPosition);
    return distanceToFloor < script.groundAnchorLevelPrecision;
}

function farEnoughFromOtherAnchors(position) {
    if(global.surfaceAnchors.length == 0) {
        return true;
    }
    var targetPosition = position;
    let allFarEnough = true;
    for (let anchor of global.surfaceAnchors) {
        var distance = targetPosition.distance(anchor.position);
        if (distance <= script.maxDistanceToOtherAnchors) {
            allFarEnough = false;
            break;
        }
    }
    return allFarEnough;
}

function farEnoughFromDoor(position) {
    var flatPosition = new vec3(position.x, 0, position.z);
    var flatDoorPosition = new vec3(script.exitDoor.position.x, 0, script.exitDoor.position.z);
    var distanceToDoor = flatPosition.distance(flatDoorPosition);
    return distanceToDoor > script.maxDistanceToOtherAnchors;
}

function isValidAnchorPlacement(identifiedSurface) {
    if(!isSurfaceNeeded(identifiedSurface.surfaceType)) return false;

    if(!farEnoughFromOtherAnchors(identifiedSurface.position)) return false;
    if(!farEnoughFromDoor(identifiedSurface.position)) return false;
    if(identifiedSurface.surfaceType == "ground" && !closeEnoughToFloorLevel(identifiedSurface.position)) return false;

    return true;
}

/* ------------------------------------------------------------------
   Store minimal, unambiguous data on global.surfaceAnchors:
   - ground/ceiling: yaw (float, radians)
   - wall: normal (vec3)
-------------------------------------------------------------------*/
function createIfAnchorIsNeeded(identifiedSurface, cameraPosition) {
    if (!isSurfaceNeeded(identifiedSurface.surfaceType)) {
        return false;
    }

    if (!farEnoughFromOtherAnchors(identifiedSurface.position)) return false;
    if (!farEnoughFromDoor(identifiedSurface.position)) return false;
    if (identifiedSurface.surfaceType == "ground" && !closeEnoughToFloorLevel(identifiedSurface.position)) return false;

    // Compute flattened facing based on camera for ground/ceiling (same as before)
    var dir = cameraPosition.sub(identifiedSurface.position);
    dir.y = 0;
    dir = dir.normalize();

    var flatQuat = quat.lookAt(dir, vec3.up());

    // Visuals (unchanged): create the visible anchor gizmo with a sensible rotation
    var newSurfaceAnchor = script.anchorPrefab.instantiate(script.anchorVisualsRoot);
    newSurfaceAnchor.getTransform().setWorldPosition(identifiedSurface.position);

    if (identifiedSurface.surfaceType == "ground") {
        newSurfaceAnchor.getTransform().setWorldRotation(flatQuat);
    } else {
        newSurfaceAnchor.getTransform().setWorldRotation(identifiedSurface.rotation);
    }

    // Store minimal data
    if (identifiedSurface.surfaceType === "wall") {
        global.surfaceAnchors.push({
            surfaceType: "wall",
            position: identifiedSurface.position,
            normal: identifiedSurface.normal,
            anchorObject: newSurfaceAnchor
        });
    } else if (identifiedSurface.surfaceType === "ground") {
        var yaw = Math.atan2(dir.x, dir.z);
        global.surfaceAnchors.push({
            surfaceType: "ground",
            position: identifiedSurface.position,
            yaw: yaw,
            anchorObject: newSurfaceAnchor
        });
    } else if (identifiedSurface.surfaceType === "ceiling") {
        var yawC = Math.atan2(dir.x, dir.z);
        global.surfaceAnchors.push({
            surfaceType: "ceiling",
            position: identifiedSurface.position,
            yaw: yawC,
            anchorObject: newSurfaceAnchor
        });
    }

    script.logic.updateAnchorRequirementsHint();
    return true;
}

function onHitTestResult(results) {
    var cameraPosition = getCameraPosition();

    if(results == null || script.maxHitDistance < Math.abs(cameraPosition.distance(results.position))) { 
        scaleEvent(0, 0.1);
        if(script.currentlyRecording == "poi-anchors") {
            newHint("No surface detected. Try getting closer.");
        }
        return; 
    }

    identifiedSurface = identifySurfaceType(results.position, results.normal);

    if(identifiedSurface.surfaceType == "wall") {
        script.worldGridMaterial.mainPass.verticalMode = true;
    } else {
        script.worldGridMaterial.mainPass.verticalMode = false;
    }

    if(script.currentlyRecording == "ground-height" && identifiedSurface.surfaceType != "ground") { 
        scaleEvent(0, 0.1);
        return; 
    } else if(script.currentlyRecording == "ground-height" && identifiedSurface.surfaceType == "ground") {
        scaleEvent(1, 0.1);
    }

    if(script.currentlyRecording == "exit-door" && identifiedSurface.surfaceType != "wall") { 
        scaleEvent(0, 0.1);
        return; 
    } else if(script.currentlyRecording == "exit-door" && identifiedSurface.surfaceType == "wall") {
        scaleEvent(1, 0.1);
    }

    if(script.currentlyRecording == "poi-anchors") {
        displayAnchorHint(identifiedSurface);
    }
    
    if(script.currentlyRecording == "poi-anchors" && !isValidAnchorPlacement(identifiedSurface)) { 
        scaleEvent(0, 0.1);
        return; 
    } else if(script.currentlyRecording == "poi-anchors" && isValidAnchorPlacement(identifiedSurface)) {
        scaleEvent(1, 0.1);
    }

    // move hitOrigin object
    script.hitOriginObject.getTransform().setWorldPosition(identifiedSurface.position);
    script.hitOriginObject.getTransform().setWorldRotation(identifiedSurface.rotation);

    if(pinchingAir() || script.measureButton) {
        script.measureButton = false;

        switch(script.currentlyRecording) {
            case "ground-height":
                script.groundHeight = identifiedSurface.position.y;
                global.groundHeight = script.groundHeight;

                var groundPos = script.groundPlane.getTransform().getWorldPosition();
                script.groundPlane.getTransform().setWorldPosition(new vec3(groundPos.x, identifiedSurface.position.y, groundPos.z));

                // ALWAYS notify on capture if a callback exists
                if (typeof script.recordingData.callback === "function") {
                    script.recordingData.callback();
                }
                break;

            case "exit-door":
                // Minimal door data: position + outward normal; NO roll
                script.exitDoor = {
                    position: identifiedSurface.position,
                    normal: identifiedSurface.normal
                };

                // ALWAYS notify on capture if a callback exists
                if (typeof script.recordingData.callback === "function") {
                    script.recordingData.callback();
                }
                break;

            case "poi-anchors":
                if(!createIfAnchorIsNeeded(identifiedSurface, cameraPosition)) return;
                break;
        }

        script.recordingData.completed++;
        if(
            script.currentlyRecording == "poi-anchors" &&
            script.recordingData.objective == global.surfaceAnchors.length
        ) {
            scaleEvent(0, 0.1);
            if(script.recordingData.callback != null) {
                script.recordingData.callback();
                if(script.currentlyRecording == "poi-anchors") {
                    clearHint();
                }
            }
        }
    }
}

function measure() {
    script.measureButton = true;
    global.utils.delay(0.1, function() {
        script.measureButton = false;
    })
}
function stopRecording() {
    script.currentlyRecording = null;
    script.eyeCallback = null;
    print("Completed WQM Recording!");
    scanEvent.enabled = false;
    eyeHeightEvent.enabled = false; // ensure eye loop is off
    if (script.hitTestSession) {
        script.hitTestSession.stop();
    }
    scaleEvent(0, 0.1);
}
function manuallySnapCurrentScan(callback) {
    // Allow overriding/setting the phase callback when snapping manually
    if (typeof callback === "function") {
        script.recordingData.callback = callback;
        if (script.currentlyRecording === "eye-height") {
            eyeCallback = callback;
        }
    }

    // NEW: support manual snap for eye-height
    if (script.currentlyRecording === "eye-height") {
        var cb = eyeCallback || script.recordingData.callback;
        snapEyeHeight(cb);
        return;
    }

    // For hit-test driven phases (ground/door/anchors), trigger measure flag
    measure();
}

function recordEyeHeight(callback) {
    print("recording eye height...");
    script.currentlyRecording = "eye-height";
    eyeHeightEvent.enabled = true;
    eyeCallback = callback;
}

function recordGroundHeight(callback) {
    print("recording ground height...");
    script.recordingData.callback = (typeof callback === "function") ? callback : null; // now accepts cb
    script.recordingData.objective = 1;
    script.recordingData.completed = 0;
    script.recordingData.recordingMsg = "Pinch to select the lowest point on the floor."
    script.currentlyRecording = "ground-height";
    switchVisualHint();

    script.hitTestSession = createHitTestSession();
    script.hitTestSession.start();
    scanEvent.enabled = true;
}
function recordDoorSurfaceAnchor(callback) {
    print("recording door placement...");
    script.recordingData.callback = (typeof callback === "function") ? callback : null; // now accepts cb
    script.recordingData.objective = 1;
    script.recordingData.completed = 0;
    script.recordingData.recordingMsg = "Pinch to create the escape room's exit door."
    script.currentlyRecording = "exit-door";
    switchVisualHint();

    script.hitTestSession = createHitTestSession();
    script.hitTestSession.start();
    scanEvent.enabled = true;
}

function recordPOISurfaceAnchors(successCallback) {
    print("recording poi anchors placement...");
    script.recordingData.callback = successCallback;
    script.recordingData.objective = 5;
    script.recordingData.completed = 0;
    script.recordingData.recordingMsg = "Pinch to create surface anchors."
    script.currentlyRecording = "poi-anchors";
    switchVisualHint();

    script.hitTestSession = createHitTestSession();
    script.hitTestSession.start();
    scanEvent.enabled = true;
}

function checkAnchorsNeeded(newText = "") {
    if(script.currentlyRecording != "poi-anchors") return "";

    var groundCount = 0;
    var wallCount = 0;
    var ceilingCount = 0;

    for (let anchor of global.surfaceAnchors) {
        switch (anchor.surfaceType) {
            case "ground":
                groundCount++;
                break;
            case "wall":
                wallCount++;
                break;
            case "ceiling":
                ceilingCount++;
                break;
        }
    }

    var missingAnchors = [];

    if (groundCount < script.groundAnchorsTarget) {
        missingAnchors.push("Floor");
    }
    if (wallCount < script.wallAnchorsTarget) {
        missingAnchors.push("Wall");
    }
    if (ceilingCount < script.ceilingAnchorsTarget) {
        missingAnchors.push("Ceiling");
    }

    if(missingAnchors.length == 0) {
        return "All anchors placed. \n You can delete an anchor by pinching the red button above it."
    }
    var error = "";
    if(currentHint != "") {
        error = "\n" + currentHint;
    }
    return "Place more anchors on: " + (missingAnchors.length > 0 ? missingAnchors.join(", ") : "None") + error;
}

function checkAnchorsNeededAlt() {
    var groundCount = 0;
    var wallCount = 0;
    var ceilingCount = 0;

    for (let anchor of global.surfaceAnchors) {
        switch (anchor.surfaceType) {
            case "ground":
                groundCount++;
                break;
            case "wall":
                wallCount++;
                break;
            case "ceiling":
                ceilingCount++;
                break;
        }
    }

    var missingAnchors = [];

    if (groundCount < script.groundAnchorsTarget) {
        missingAnchors.push("Floor");
    }
    if (wallCount < script.wallAnchorsTarget) {
        missingAnchors.push("Wall");
    }
    if (ceilingCount < script.ceilingAnchorsTarget) {
        missingAnchors.push("Ceiling");
    }

    return missingAnchors.length == 0;
}

// begin

script.recordEyeHeight = recordEyeHeight;
script.recordGroundHeight = recordGroundHeight;           // now (cb)
script.recordDoorSurfaceAnchor = recordDoorSurfaceAnchor; // now (cb)

script.manuallySnapCurrentScan = manuallySnapCurrentScan;
script.stopRecording = stopRecording;

script.recordPOISurfaceAnchors = recordPOISurfaceAnchors;

script.checkAnchorsNeededAlt = checkAnchorsNeededAlt
script.checkAnchorsNeeded = checkAnchorsNeeded