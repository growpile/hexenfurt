// ------------------ Module Imports ------------------
const SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
const HandInputDataModule = require("SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData");
const WorldCameraFinderProviderModule = require("SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider");
const animateModule = require("SpectaclesInteractionKit.lspkg/Utils/animate");

const HandInputData = HandInputDataModule.HandInputData;
const WorldCameraFinderProviderClass = WorldCameraFinderProviderModule.default;
const animate = animateModule.default;
const CancelSet = animateModule.CancelSet;

// @input int hand = 0 {"widget":"combobox", "values":[{"label":"Left", "value":0}, {"label":"Right", "value":1}]}
// @input float buttonHorizontalSpacing = 1.0
//@input Component.ScriptComponent logic
/** @type {ScriptComponent} */
var logic = script.logic;

// ------------------ Variables ------------------
var handProvider = SIK.HandInputData;
var menuHand = handProvider.getHand("left");
if(script.hand == 1) {
    menuHand = handProvider.getHand("right");
}

// Manual singleton for camera (decorators don’t exist in JS)
var mCamera = null;
if (!mCamera) {
    mCamera = new WorldCameraFinderProviderClass();
}

var menuButtons = [];
var menuButtonTransforms = [];
var buttonAnimations = [];
var isShown = false;

// ------------------ Initialization ------------------
function onAwake() {
    var sceneObject = script.getSceneObject();

    // Collect children as buttons
    for (var i = 0; i < sceneObject.getChildrenCount(); i++) {
        var child = sceneObject.getChild(i);
        menuButtons.push(child);
        menuButtonTransforms.push(child.getTransform());
    }

    layoutMenu();

    script.createEvent("UpdateEvent").bind(onUpdate);

    var delay = script.createEvent("DelayedCallbackEvent");
    delay.bind(function() {
        if (global.deviceInfoSystem.isEditor()) {
            showMenu();
        } else {
            hideMenu();
        }
    });
    delay.reset(0.25);
}

// ------------------ Update ------------------
function onUpdate() {
    positionMenu();
    checkForMenuActivation();
}

// ------------------ Layout ------------------
function layoutMenu() {
    for (var i = 0; i < menuButtons.length; i++) {
        var transform = menuButtonTransforms[i];
        transform.setLocalPosition(new vec3(script.buttonHorizontalSpacing * (i + 1), 0, 0));
        transform.setLocalRotation(quat.quatIdentity());
    }
}

// ------------------ Menu Activation ------------------
function checkForMenuActivation() {
    if(logic.currentPhase != 6) {
        hideMenu();
    } else {
        if (global.deviceInfoSystem.isEditor()) {
            showMenu();
            return;
        }

        if (menuHand.isTracked() && menuHand.isFacingCamera()) {
            if (!isShown) showMenu();
        } else {
            if (isShown) hideMenu();
        }
    }

}

// ------------------ Menu Positioning ------------------
function positionMenu() {
    var handPosition = menuHand.pinkyKnuckle.position;
    var handRight = menuHand.indexTip.right;
    var curPosition = script.getSceneObject().getTransform().getWorldPosition();
    var menuPosition = handPosition.add(handRight.uniformScale(1.5));

    if (global.deviceInfoSystem.isEditor()) {
        menuPosition = mCamera.getWorldPosition().add(new vec3(0, -20, -25));
    }

    var nPosition = vec3.lerp(curPosition, menuPosition, 0.5);
    script.getSceneObject().getTransform().setWorldPosition(nPosition);

    var billboardPos = mCamera.getWorldPosition().add(mCamera.forward().uniformScale(5));
    billboardPos = billboardPos.add(mCamera.right().uniformScale(-5));

    var dir = billboardPos.sub(menuPosition).normalize();
    script.getSceneObject().getTransform().setWorldRotation(quat.lookAt(dir, vec3.up()));
}

// ------------------ Show / Hide Menu ------------------
function showMenu() {
    isShown = true;

    for (var i = 0; i < menuButtons.length; i++) {
        var btn = menuButtons[i];
        btn.enabled = true;

        // Proper CancelSet usage
        if (i < buttonAnimations.length && buttonAnimations[i] instanceof CancelSet) {
            buttonAnimations[i].cancelAll();
        } else {
            buttonAnimations[i] = new CancelSet();
        }

        animate({
            cancelSet: buttonAnimations[i],
            duration: 0.2,
            delayFrames: i * 4,
            update: function(t) {
                var s = MathUtils.lerp(1.0, 1.3, t);
                btn.getTransform().setLocalScale(new vec3(s, s, s));
            }
        });
    }
}

function hideMenu() {
    isShown = false;
    for (var i = 0; i < menuButtons.length; i++) {
        menuButtons[i].enabled = false;
    }
}

// ------------------ Initialize ------------------
onAwake();
