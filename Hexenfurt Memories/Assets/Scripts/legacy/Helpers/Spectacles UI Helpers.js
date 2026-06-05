// @input int transitionStyle = 0 {"widget":"combobox", "values":[{"label":"Scale", "value":0}, {"label":"None", "value":1}]}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Container Frames / Views</font>"}
// input Component.ScriptComponent[] uiComposites1
/*
@typedef uiCompositeClass
@property {Component.ScriptComponent} uiComposite {"label": "UI Composite"}
@property {string} id {"label": "Identifier"}
@property {bool} startOpened {"label": "Start Opened"}
@property {bool} startFollowing {"label": "Follow Camera"}
@property {vec3} followOffset {"label": "Follow Offset", "showIf": "startFollowing"}
@property {float} followSpeed {"label": "Follow Speed", "showIf": "startFollowing"}
*/
// @input uiCompositeClass[] uiComposites {"label": "Registered Composites"}
// @ui {"widget":"group_end"}

// @input Component.Camera camera
var cameraTransform = script.camera.getTransform();

// playButton.inactive = true;

var compositeRegistry = {};
var activeAnimations = [];

var unwrappedCompositeTextElements = [];
var unwrappedCompositeButtonElements = [];


// helpers
function lerp(start, end, amt) {
    return (1-amt)*start+amt*end
}

script.refreshComposites = function() {
    unwrappedCompositeButtonElements = [];
    script.unwrapCompositesToFindButtons();

    unwrappedCompositeTextElements = [];
    script.unwrapCompositesToFindText();
}

function findCompositeWithId(id) {
    for (var c = 0; c < script.uiComposites.length; c++) {
        if(script.uiComposites[c].id == id) {
            return {
                composite: script.uiComposites[c].uiComposite,
                index: c
            }
        }
    }

    print("Could not find UI Composite with ID: " + id);
    return {
        composite: null,
        index: null
    }
}

function getRequiredComponents(uiCompositeId) {
    compositeQuery = findCompositeWithId(uiCompositeId);
    var uiComposite = compositeQuery.composite;
    var frameScript = uiComposite.getSceneObject().getComponents("ScriptComponent")[0];
    var interactable = uiComposite.getSceneObject().getComponents("ScriptComponent")[1];
    var interactableManipulation = uiComposite.getSceneObject().getComponents("ScriptComponent")[2];
    var transform = uiComposite.getSceneObject().getTransform();

    return {
        index: compositeQuery.index,
        uiComposite: uiComposite,
        frameScript: frameScript,
        interactableState: interactable.enabled,
        interactable: interactable,
        interactableManipulation: interactableManipulation,
        transform: transform
    }
}

script.registerComposite = function(compositeSceneObject, compositeId) {
    var requiredComponents = getRequiredComponents(compositeId);

    compositeRegistry[compositeId] = {
        index: requiredComponents.index,
        sceneObject: compositeSceneObject,
        uiComposite: requiredComponents.uiComposite,     
        frameScript: requiredComponents.frameScript,
        interactable: requiredComponents.interactable,
        interactableManipulation: requiredComponents.interactableManipulation,
        transform: requiredComponents.transform,

        // dynamic, have to be refreshed
        interactableState: requiredComponents.interactableState,
        animations: []
    }
}

function retrieveCompositeWithId(id) {
    var compositeComponents = compositeRegistry[id];
    compositeRegistry[id].interactableState = compositeComponents.interactable.enabled;
    
    return {
        index: compositeComponents.index,
        compositeIndex: compositeComponents.index,
        sceneObject: compositeComponents.sceneObject,
        uiComposite: compositeComponents.uiComposite,
        frameScript: compositeComponents.frameScript,
        interactable: compositeComponents.interactable,
        interactableState: compositeComponents.interactable.enabled,
        interactableManipulation: compositeComponents.interactableManipulation,
        transform: compositeComponents.transform,
        animations: compositeComponents.animations,
    }
}

script.findAnimationWithId = function(animationId) {
    for (var i = 0; i < activeAnimations.length; i++) {
        var animationData = activeAnimations[i];
        if (animationData.id == animationId) {
            return {
                isRunning: true,
                progress: anim.control
            };
        }
    }
    return {
        isRunning: false,
        progress: 0
    };
};

function registerAnimation(uiCompositeId, animationData) {
    var composite = compositeRegistry[uiCompositeId];
    if (!composite) {
        return;
    }

    var prefix = animationData.id.split("_")[1];
    for (var i = composite.animations.length - 1; i >= 0; i--) {
        var existing = composite.animations[i];
        if (existing.id.includes(prefix)) {
            if (existing.updateEvent) {
                existing.updateEvent.enabled = false;
            }
            composite.animations.splice(i, 1);
        }
    }

    composite.animations.push(animationData);
    activeAnimations.push(animationData);

    animationData.cleanup = function() {
        composite.animations = composite.animations.filter(a => a !== animationData);
        activeAnimations = activeAnimations.filter(a => a !== animationData);
    };
}

script.unwrapCompositesToFindText = function() {
    for (let c = 0; c < script.uiComposites.length; c++) {
        if(script.uiComposites[c].uiComposite == null) return;

        var textElements = [];
        var childrenCount = script.uiComposites[c].uiComposite.getSceneObject().getChild(0).getChild(0).getChildrenCount();
        for (var i = 0; i < childrenCount; i++) {
            var child = script.uiComposites[c].uiComposite.getSceneObject().getChild(0).getChild(0).getChild(i);
            if (child.getComponent("Component.Text") != null) {
                textElements.push(child);
            }
        }
        unwrappedCompositeTextElements.push(textElements);
    }
}

script.unwrapCompositesToFindButtons = function() {
    unwrappedCompositeButtonElements = [];

    // Loop through all composites
    for (let c = 0; c < script.uiComposites.length; c++) {
        var compositeData = script.uiComposites[c];
        var requiredComponents = retrieveCompositeWithId(compositeData.id);
        if (!requiredComponents || !requiredComponents.sceneObject) continue;

        var compositeContentRoot = requiredComponents.sceneObject.getChild(0);
        if (!compositeContentRoot) continue;

        // Array to store all found objects with ScriptComponents
        var buttonElements = [];

        // Recursive function to search hierarchy
        function searchForScriptComponents(obj) {
            if (!obj) return;

            // Check if the current object has any ScriptComponent
            var scriptComponents = obj.getComponents("Component.ScriptComponent");
            if (scriptComponents.length > 0) {
                buttonElements.push(obj);
            }

            // Recurse through all children
            var childCount = obj.getChildrenCount();
            for (var i = 0; i < childCount; i++) {
                searchForScriptComponents(obj.getChild(i));
            }
        }

        // Start recursive search from compositeContentRoot
        searchForScriptComponents(compositeContentRoot);

        // Store the results for this composite
        unwrappedCompositeButtonElements.push(buttonElements);
    }
};

// initializator
function init() {
    script.createEvent("OnStartEvent").bind(() => {

        for (let c = 0; c < script.uiComposites.length; c++) {
            script.registerComposite(script.uiComposites[c].uiComposite.getSceneObject(), script.uiComposites[c].id);
            if(script.uiComposites[c].startFollowing) {
                script.setAlternativeFollowState(
                    script.uiComposites[c].id,
                    new vec3(script.uiComposites[c].followOffset.x, script.uiComposites[c].followOffset.y, script.uiComposites[c].followOffset.z),
                    script.uiComposites[c].followSpeed
                )
            }
            
            if (!script.uiComposites[c].startOpened && script.transitionStyle == 0) {
                script.newWorldScale(script.uiComposites[c].id, new vec3(0, 0, 0), 1, () => {
                    script.toggleUIComposite(script.uiComposites[c].id, false);
                });
            } else if (!script.uiComposites[c].startOpened && script.transitionStyle == 1) {
                script.toggleUIComposite(script.uiComposites[c].id, false);
            } else {
                script.newWorldScale(script.uiComposites[c].id, new vec3(1, 1, 1), 0.5)
            }
        }

        script.refreshComposites();
        // script.toggleButtonState("menuView", 0, false);

        // transition breaks button inactive
        // script.transition("menuView", "menuView", 0.1, function() {
        //     print("done")
        // })
        // script.newWorldScale("menuView", new vec3(2, 2, 2), 0.1, function() {
        //     print("Done!");
        // });
        // script.toggleUIComposite("menuView", false);
        // script.toggleUIComposite("menuView", true);
    });
}

// all reworked for SnapOS 2.0 & UIKit
// potentially add local option?
script.newWorldPosition = function(uiCompositeId, newPosition, translateSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_translation",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        animationData.control = lerp(animationData.control, 1, translateSpeed);
        currentPosition = transform.getWorldPosition();
        transform.setWorldPosition(vec3.lerp(currentPosition, newPosition, translateSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setWorldPosition(newPosition);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.newWorldScale = function(uiCompositeId, newScale, scaleSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_scale",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        
        animationData.control = lerp(animationData.control, 1, scaleSpeed);
        currentScale = transform.getWorldScale();
        
        transform.setWorldScale(vec3.lerp(currentScale, newScale, scaleSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setWorldScale(newScale);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.newWorldRotation = function(uiCompositeId, newRotation, rotateSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_rotation",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        animationData.control = lerp(animationData.control, 1, rotateSpeed);
        currentRotation = transform.getWorldRotation();
        transform.setWorldRotation(quat.slerp(currentRotation, newRotation, rotateSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setWorldRotation(newRotation);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.newLocalPosition = function(uiCompositeId, newPosition, translateSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_translation",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        animationData.control = lerp(animationData.control, 1, translateSpeed);
        currentPosition = transform.getLocalPosition();
        transform.setLocalPosition(vec3.lerp(currentPosition, newPosition, translateSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setLocalPosition(newPosition);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.newLocalScale = function(uiCompositeId, newScale, scaleSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_scale",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        animationData.control = lerp(animationData.control, 1, scaleSpeed);
        currentScale = transform.getLocalScale();
        transform.setLocalScale(vec3.lerp(currentScale, newScale, scaleSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setLocalScale(newScale);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.newLocalRotation = function(uiCompositeId, newRotation, rotateSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var animationData = {
        id: uiCompositeId + "_rotation",
        control: 0,
        updateEvent: script.createEvent("UpdateEvent")
    };
    registerAnimation(uiCompositeId, animationData);

    animationData.updateEvent.bind(() => {
        animationData.control = lerp(animationData.control, 1, rotateSpeed);
        currentRotation = transform.getLocalRotation();
        transform.setLocalRotation(quat.slerp(currentRotation, newRotation, rotateSpeed));

        if (Math.abs(animationData.control - 1) < 0.01) {
            transform.setLocalRotation(newRotation);

            activeAnimations = activeAnimations.filter(function (a) {
                return a !== animationData;
            });

            if (callback) callback();
            interactable.enabled = true;
            animationData.updateEvent.enabled = false;
            animationData.cleanup();
        }
    })
}
script.faceCamera = function(uiCompositeId, facingSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;
    
    var currentCompositePosition = transform.getWorldPosition();
    var direction = cameraTransform.getWorldPosition().sub(currentCompositePosition).normalize();
    var targetRotation = quat.lookAt(direction, vec3.up());

    script.newWorldRotation(uiCompositeId, targetRotation, facingSpeed, callback);
}
script.faceObject = function(uiCompositeId, objectToFace, facingSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;
    
    var currentCompositePosition = transform.getWorldPosition();
    var direction = objectToFace.getTransform().getWorldPosition().sub(currentCompositePosition).normalize();
    var targetRotation = quat.lookAt(direction, vec3.up());

    script.newWorldRotation(uiCompositeId, targetRotation, facingSpeed, callback);
}
script.focusComposite = function(uiCompositeId, distanceVector, focusSpeed, callback) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    if (!requiredComponents) return;

    var interactable = requiredComponents.interactable;
    var transform = requiredComponents.transform;
    interactable.enabled = false;

    var camTransform = script.camera.getTransform();

    var camForward = camTransform.forward.normalize();
    var camRight = camTransform.right.normalize();
    var camUp = camTransform.up.normalize();

    var camPos = camTransform.getWorldPosition();
    var worldPosition = camPos
        .add(camRight.uniformScale(distanceVector.x))
        .add(camUp.uniformScale(distanceVector.y))
        .add(camForward.uniformScale(distanceVector.z));

    script.newWorldPosition(uiCompositeId, worldPosition, focusSpeed, () => {
        script.faceCamera(uiCompositeId, focusSpeed, () => {
            if (callback) callback();
        });
    });
};
script.transition = function(uiCompositeIdFrom, uiCompositeIdTo, transitionSpeed, callback) {
    if(script.transitionStyle == 0) {
        script.newWorldScale(uiCompositeIdFrom, new vec3(0, 0, 0), transitionSpeed, () => {
            script.toggleUIComposite(uiCompositeIdFrom, false);
            script.toggleUIComposite(uiCompositeIdTo, true);
            script.newWorldScale(uiCompositeIdTo, new vec3(1, 1, 1), transitionSpeed, () => {
                if (callback) callback();
            })
        })
    } else if (script.transitionStyle == 1) {
        script.toggleUIComposite(uiCompositeIdFrom, false);
        script.toggleUIComposite(uiCompositeIdTo, true);
    }
}
script.newInnerSize = function(uiCompositeId, newSize) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    requiredComponents.frameScript.innerSize(newSize);
}
script.toggleCompositeTranslation = function(uiCompositeId, newState) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var uiComposite = requiredComponents.uiComposite;

    uiComposite.allowTranslation = newState;
}
script.toggleCompositeScaling = function(uiCompositeId, newState) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var uiComposite = requiredComponents.uiComposite;

    uiComposite.allowScaling = newState;
}
script.toggleCompositeManipulation = function(uiCompositeId, newState) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var interactable = requiredComponents.interactable;
    var interactableManipulation = requiredComponents.interactableManipulation;

    interactable.enabled = newState;
    interactableManipulation.enabled = newState;
}
script.toggleFollow = function(uiCompositeId, newState) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var uiComposite = requiredComponents.uiComposite;

    uiComposite.isFollowing = newState;
}
script.toggleUIComposite = function(uiCompositeId, newState) {
    var requiredComponents = retrieveCompositeWithId(uiCompositeId);
    var uiComposite = requiredComponents.uiComposite;
    
    uiComposite.getSceneObject().enabled = newState;
}
script.cancelAnimationsForComposite = function(uiCompositeId) {
    var composite = compositeRegistry[uiCompositeId];
    if (!composite) return;
    
    for (var i = 0; i < composite.animations.length; i++) {
        var anim = composite.animations[i];
        if (anim.updateEvent) anim.updateEvent.enabled = false;
    }
    composite.animations = [];
}

// make it use the newWorldPosition and also others to faceCamera as well
script.spotlightComposite = function (focusCompositeId, focusDistance, pushStep = 5, minSpacing = 10, moveSpeed = 0.15) {
    var cameraTransform = script.camera.getTransform();
    var camPos = cameraTransform.getWorldPosition();
    var camForward = cameraTransform.forward.normalize();
    var camRight = cameraTransform.right.normalize();

    // Get the focused composite and focus it first
    var focusedCompositeData = retrieveCompositeWithId(focusCompositeId);
    if (!focusedCompositeData) return;

    script.focusComposite(focusCompositeId, new vec3(0, 0, focusDistance), moveSpeed, function () {
        script.faceCamera(focusCompositeId, moveSpeed);
    });

    // Calculate target positions for the others
    var focusTargetPos = camPos.add(camForward.uniformScale(focusDistance));
    var placedPositions = [focusTargetPos];
    var sideToggle = 1;

    for (let i = 0; i < script.uiComposites.length; i++) {
        var currentCompositeId = script.uiComposites[i].id;
        if (currentCompositeId === focusCompositeId) continue;

        var compData = retrieveCompositeWithId(currentCompositeId);
        if (!compData) continue;

        var compTransform = compData.transform;
        var currentPos = compTransform.getWorldPosition();

        // Determine radius using largest dimension
        var innerSize = compData.frameScript.innerSize;
        var worldScale = compTransform.getWorldScale();
        var compRadius = Math.max(innerSize.x * worldScale.x, innerSize.y * worldScale.y) * 0.5;

        // Figure out side direction (alternate left/right)
        var localToCam = currentPos.sub(camPos);
        var horizontalDot = localToCam.dot(camRight);
        var sideDir = horizontalDot >= 0 ? 1 : -1;
        sideDir *= sideToggle;
        sideToggle *= -1;

        // Start offset position
        var targetPos = currentPos.add(camRight.uniformScale(pushStep * sideDir));

        // Move horizontally until it's out of camera view
        var safety = 0;
        while (script.camera.isSphereVisible(targetPos, compRadius) && safety < 100) {
            safety++;
            targetPos = targetPos.add(camRight.uniformScale(pushStep * sideDir));
        }

        // Ensure enough spacing from other placed composites
        var needsReposition = true;
        var overlapSafety = 0;
        while (needsReposition && overlapSafety < 50) {
            overlapSafety++;
            needsReposition = false;
            for (let j = 0; j < placedPositions.length; j++) {
                var dist = targetPos.distance(placedPositions[j]);
                if (dist < minSpacing) {
                    targetPos = targetPos.add(camRight.uniformScale(minSpacing * sideDir));
                    needsReposition = true;
                    break;
                }
            }
        }

        // Depth correction to stay aligned at the same focus distance
        var depthOffset = (targetPos.sub(camPos)).dot(camForward);
        var depthCorrection = camForward.uniformScale(focusDistance - depthOffset);
        targetPos = targetPos.add(depthCorrection);

        // Animate to the computed position
        script.newWorldPosition(currentCompositeId, targetPos, moveSpeed, function () {
            script.faceCamera(currentCompositeId, moveSpeed, () => {
            });
        });

        placedPositions.push(targetPos);
    }

    print("Spotlight complete for composite: " + focusCompositeId);
};

// Each composite that follows gets its own update event
var followRegistry = {}; // { compositeId: { updateEvent, active: bool } }

script.setAlternativeFollowState = function (uiCompositeId, distanceVector, followSpeed) {
    var compositeData = retrieveCompositeWithId(uiCompositeId);
    if (!compositeData) return;

    // Ensure registry entry exists
    if (!followRegistry[uiCompositeId]) {
        followRegistry[uiCompositeId] = { updateEvent: null, active: false };
    }

    var followData = followRegistry[uiCompositeId];

    // If follow mode is already active, turn it off
    if (followData.active) {
        if (followData.updateEvent) {
            followData.updateEvent.enabled = false;
            followData.updateEvent = null;
        }

        followData.active = false;
        return;
    }

    // Disable any manipulation / animations while following
    script.cancelAnimationsForComposite(uiCompositeId);
    compositeData.interactable.enabled = false;
    compositeData.interactableManipulation.enabled = false;

    // Create new update event for this composite
    var updateEvent = script.createEvent("UpdateEvent");
    followData.updateEvent = updateEvent;
    followData.active = true;

    updateEvent.bind(function () {
        if (!followData.active) return;

        var camTransform = script.camera.getTransform();
        var camPos = camTransform.getWorldPosition();
        var camForward = camTransform.forward.normalize();
        var camRight = camTransform.right.normalize();
        var camUp = camTransform.up.normalize();

        // Compute desired world position using offset vector
        var desiredPos = camPos
            .add(camRight.uniformScale(distanceVector.x))
            .add(camUp.uniformScale(distanceVector.y))
            .add(camForward.uniformScale(distanceVector.z));

        // Smooth or instant follow
        var transform = compositeData.transform;
        var currentPos = transform.getWorldPosition();

        if (followSpeed >= 1) {
            transform.setWorldPosition(desiredPos);
        } else {
            transform.setWorldPosition(vec3.lerp(currentPos, desiredPos, followSpeed));
        }

        // Make the composite always face the camera
        var direction = camPos.sub(transform.getWorldPosition()).normalize();
        var targetRot = quat.lookAt(direction, vec3.up());
        var currentRot = transform.getWorldRotation();

        if (followSpeed >= 1) {
            transform.setWorldRotation(targetRot);
        } else {
            transform.setWorldRotation(quat.slerp(currentRot, targetRot, followSpeed));
        }
    });
};

// text & buttons
// confirm these work
script.changeTextAlpha = function(uiCompositeId, textId, alpha) {
    compositeQuery = findCompositeWithId(uiCompositeId);
    uiComposite = compositeQuery.composite;
    uiCompositeIndex = compositeQuery.index;

    var textComponent = unwrappedCompositeTextElements[uiCompositeIndex][textId].getComponent("Component.Text");
    var updateEvent = script.createEvent("UpdateEvent");
    updateEvent.bind(function() {
        var currentColor = textComponent.textFill.color
        textComponent.textFill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, global.utils.lerp(currentColor.a, alpha, 0.35));
        textComponent.outlineSettings.fill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, global.utils.lerp(currentColor.a, alpha, 0.35));
        if(Math.abs(currentColor.a - alpha) < 0.05) {
            updateEvent.enabled = false;
            textComponent.textFill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, alpha);
            textComponent.outlineSettings.fill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, alpha);
        }
    })
}
script.changeCompositeAlpha = function(uiCompositeId, alpha) {
    compositeQuery = findCompositeWithId(uiCompositeId);
    uiComposite = compositeQuery.composite;
    uiCompositeIndex = compositeQuery.index;

    var updateEvent = script.createEvent("UpdateEvent");
    updateEvent.bind(function() {
        uiComposite.borderAlpha = global.helperLerp(uiComposite.borderAlpha, alpha, 0.1);
        uiComposite.backingAlpha = global.helperLerp(uiComposite.backingAlpha, alpha, 0.1);
        if(Math.abs(uiComposite.borderAlpha - alpha) < 0.05) {
            updateEvent.enabled = false;
        }
    })
}
script.newText = function(uiCompositeId, textId, newText) {
    compositeQuery = findCompositeWithId(uiCompositeId);
    uiComposite = compositeQuery.composite;
    uiCompositeIndex = compositeQuery.index;

    var textComponent = unwrappedCompositeTextElements[uiCompositeId][textId].getComponent("Component.Text");
    textComponent.text = newText;
}
script.toggleButtonState = function(uiCompositeId, buttonId, newState) {
    var compositeData = retrieveCompositeWithId(uiCompositeId);
    buttonComponent = unwrappedCompositeButtonElements[compositeData.index][buttonId].getComponent('Component.ScriptComponent');
    interactable = unwrappedCompositeButtonElements[compositeData.index][buttonId].getComponents('Component.ScriptComponent')[2];

    // interactable.enabled = newState;
    buttonComponent.inactive = newState;
    buttonComponent.inactive = !newState;

    print("Is " + unwrappedCompositeButtonElements[compositeData.index][buttonId].name + " inactive? " + buttonComponent.inactive);

    // UIKit Button visuals not working correctly, add later

    // var roundedRect = unwrappedCompositeButtonElements[compositeData.index][buttonId].getComponents('Component.ScriptComponent')[1];
    // roundedRect.setBackgroundGradient({
    //     enabled: true,
    //     type: "Linear",
    //     start: new vec2(-2, 1),
    //     end: new vec2(2, -1),
    //     stop0: {
    //     percent: 0,
    //     color: new vec4(1,0,1,1)
    //     },
    //     stop1: {
    //     percent: 1,
    //     color: new vec4(1,0,1,1)
    //     },
    //         stop2: {
    //     percent: 1,
    //     color: new vec4(1,0,1,1)
    //     },
    //         stop3: {
    //     percent: 1,
    //     color: new vec4(1,0,1,1)
    //     },
    //         stop4: {
    //     percent: 1,
    //     color: new vec4(1,0,1,1)
    //     },
    // })
    // roundedRect.gradient = true;
    // roundedRect.initialize();
    // roundedRect.printConfig();
};


// global methods
global.uiKitDirector = {
    spotlightComposite: script.spotlightComposite,
    refreshComposites: script.refreshComposites,

    toggleButtonState: script.toggleButtonState,

    newWorldPosition: script.newWorldPosition,
    newWorldScale: script.newWorldScale,
    newWorldRotation: script.newWorldRotation,

    transition: script.transition,
    toggleFollow: script.toggleFollow,
    faceObject: script.faceObject,
    faceCamera: script.faceCamera,
    focusComposite: script.focusComposite,

    newText: script.newText,
    newInnerSize: script.newInnerSize,

    setAlternativeFollowState: script.setAlternativeFollowState,

    toggleUIComposite: script.toggleUIComposite,
    toggleCompositeManipulation: script.toggleCompositeManipulation,
    toggleCompositeTranslation: script.toggleCompositeTranslation,
    toggleCompositeScaling: script.toggleCompositeScaling,
};

init();