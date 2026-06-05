const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Code Safe</font>"}
//@input Component.Text debugText {"label":"Debug Text"}
/** @type {Text} */
var debugText = script.debugText;
//@input Component.ScriptComponent safeDoorInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var safeDoorInteractable = script.safeDoorInteractable;
//@input Component.ScriptComponent safeDoorManipulation {"label":"Manip (unused)"}
/** @type {ScriptComponent} */
var safeDoorManipulation = script.safeDoorManipulation;
//@input Component.ScriptComponent safeDoorOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var safeDoorOutline = script.safeDoorOutline;
//@input SceneObject safeDoor {"label":"Safe Door"}
/** @type {SceneObject} */
var safeDoor = script.safeDoor;
//@input SceneObject safeHandle {"label":"Handle"}
/** @type {SceneObject} */
var safeHandle = script.safeHandle;
//@input SceneObject indexIndicator {"label":"Index Indicator"}
/** @type {SceneObject} */
var indexIndicator = script.indexIndicator;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
/*
@typedef itemSpotClass
@property {string} objectType = "deco" {"widget":"combobox", "values":[{"label":"Decoration", "value":"deco"}, {"label":"Inventory Item", "value":"item"}, {"label":"Lore Item", "value":"lore"}, {"label":"Both", "value":"both"}]}
@property {int} orientation = 0 {"widget":"combobox", "values":[{"label":"Horizontal", "value":0}, {"label":"Vertical", "value":1}]}
@property {bool} lockedSlot = false
@property {SceneObject} origin
*/
// @input itemSpotClass[] itemSpots {"label":"Spots"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
// @input bool testItems = false {"label":"Enable"}
// @input int testSpot = 0 {"showIf":"testItems", "label":"Spot Index"}
// @input int testItem = 0 {"showIf":"testItems", "label":"Item Type", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
// @input Asset.ObjectPrefab keyTestingPrefab {"showIf":"testItems", "label":"Key Prefab"}
// @input Asset.ObjectPrefab noteTestingPrefab {"showIf":"testItems", "label":"Note Prefab"}
// @input Asset.ObjectPrefab decoTestingPrefab {"showIf":"testItems", "label":"Deco Prefab"}
// @ui {"widget":"group_end"}

//#endregion

script.roomObject = {
    itemSpots: script.itemSpots,
    getCodeClue: script.init,
}

var safeDoorOpened = false;
var isDoorShaking = false;
var isHandleShaking = false;
var doorRestRot = null;
var handleRestRot = null;

var indicatorColumnXs = [-4, -2.05, 0, 2.05, 4];
/** @type {any} */
var indicatorActiveTween = null;
var indicatorRestCached = false;
var indicatorRestLocalY = 0;
var indicatorRestLocalZ = 0;

function refreshIndicatorColumnXs() {
    /** Five keypad columns (local X); fifth has no tween overshoot. */
    indicatorColumnXs = [-4, -2.05, 0, 2.05, 4];
}

function ensureIndicatorRestYZ() {
    if (!indexIndicator || indicatorRestCached) return;
    var p = indexIndicator.getTransform().getLocalPosition();
    indicatorRestLocalY = p.y;
    indicatorRestLocalZ = p.z;
    indicatorRestCached = true;
}

function stopIndicatorTween() {
    if (indicatorActiveTween) {
        indicatorActiveTween.stop();
        indicatorActiveTween = null;
    }
}

function snapIndicatorToSlot(slotIndex) {
    if (!indexIndicator) return;
    stopIndicatorTween();
    ensureIndicatorRestYZ();
    var x = indicatorColumnXs[Math.min(Math.max(slotIndex, 0), indicatorColumnXs.length - 1)];
    indexIndicator.getTransform().setLocalPosition(new vec3(x, indicatorRestLocalY, indicatorRestLocalZ));
}

function indicatorSlotForCurrentString() {
    var len = script.password.length;
    if (len <= 1) return 0;
    return Math.min(script.currentString.length, len - 1);
}

function animateIndicatorToSlot(slotIndex) {
    if (!indexIndicator) return;
    ensureIndicatorRestYZ();
    var clamped = Math.min(Math.max(slotIndex, 0), indicatorColumnXs.length - 1);
    var targetX = indicatorColumnXs[clamped];
    var tf = indexIndicator.getTransform();
    stopIndicatorTween();
    var fromPos = tf.getLocalPosition();
    var targetPos = new vec3(targetX, indicatorRestLocalY, indicatorRestLocalZ);
    if (Math.abs(fromPos.x - targetX) < 0.025)
        return;
    var isLastColumn = clamped >= indicatorColumnXs.length - 1;
    var ms = isLastColumn ? 280 : 320;
    var tw = LSTween.moveFromToLocal(tf, fromPos, targetPos, ms);
    tw.easing(isLastColumn ? Easing.Cubic.Out : Easing.Back.Out);
    indicatorActiveTween = tw;
    tw.onComplete(function() { indicatorActiveTween = null; });
    tw.start();
}

function animateIndicatorClearToStart() {
    if (!indexIndicator) return;
    stopIndicatorTween();
    ensureIndicatorRestYZ();
    var tf = indexIndicator.getTransform();
    var from = tf.getLocalPosition();
    var aimX = indicatorColumnXs[0];
    var drop = 0.13;
    /** Blend X toward slot 1 (no teleport); drop from current altitude so interrupted Back.Out blends cleanly. */
    var midX = from.x * 0.62 + aimX * 0.38;
    var dip = new vec3(midX, from.y - drop, from.z);
    var targetPos = new vec3(aimX, indicatorRestLocalY, indicatorRestLocalZ);
    var fall = LSTween.moveFromToLocal(tf, from, dip, 120).easing(Easing.Cubic.In);
    var slide = LSTween.moveFromToLocal(tf, dip, targetPos, 318).easing(Easing.Cubic.Out);
    fall.chain(slide);
    indicatorActiveTween = fall;
    slide.onComplete(function() { indicatorActiveTween = null; });
    fall.start();
}

function testItemSpots() {
    if (!script.testItems) return;
    var testingPrefab = script.testItem == 0 ? script.keyTestingPrefab : script.noteTestingPrefab;
    if (script.testItem == 2) testingPrefab = script.decoTestingPrefab;
    var spot = script.itemSpots[script.testSpot];
    var spawnedItem = testingPrefab.instantiate(spot.origin);
    spawnedItem.getTransform().setLocalPosition(vec3.zero());
    spawnedItem.getTransform().setLocalScale(vec3.one());
}

function shakeSafeDoor() {
    if (isDoorShaking) return;
    isDoorShaking = true;
    var t = safeDoor.getTransform();
    if (doorRestRot === null) doorRestRot = t.getLocalRotation();
    var up = vec3.up();
    var deg = MathUtils.DegToRad;
    var s1 = LSTween.rotateToLocal(t, quat.angleAxis(2 * deg, up).multiply(doorRestRot), 60).easing(Easing.Quadratic.Out);
    var s2 = LSTween.rotateToLocal(t, quat.angleAxis(-2 * deg, up).multiply(doorRestRot), 60).easing(Easing.Quadratic.Out);
    var s3 = LSTween.rotateToLocal(t, quat.angleAxis(1 * deg, up).multiply(doorRestRot), 50).easing(Easing.Quadratic.Out);
    var settle = LSTween.rotateToLocal(t, doorRestRot, 70)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isDoorShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(settle);
    s1.start();
}

function shakeSafeHandle() {
    if (isHandleShaking) return;
    isHandleShaking = true;
    var t = safeHandle.getTransform();
    if (handleRestRot === null) handleRestRot = t.getLocalRotation();
    var tiltAxis = vec3.forward();
    var deg = MathUtils.DegToRad;
    var wobble = 5 * deg;
    var s1 = LSTween.rotateToLocal(t, quat.angleAxis(wobble, tiltAxis).multiply(handleRestRot), 55).easing(Easing.Quadratic.Out);
    var s2 = LSTween.rotateToLocal(t, quat.angleAxis(-wobble, tiltAxis).multiply(handleRestRot), 55).easing(Easing.Quadratic.Out);
    var s3 = LSTween.rotateToLocal(t, quat.angleAxis(3 * deg, tiltAxis).multiply(handleRestRot), 45).easing(Easing.Quadratic.Out);
    var settle = LSTween.rotateToLocal(t, handleRestRot, 65)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isHandleShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(settle);
    s1.start();
}

function spinSafeHandle(onComplete) {
    var handleT = safeHandle.getTransform();
    var startRot = handleT.getLocalRotation();
    var axis = vec3.forward();
    var deg = MathUtils.DegToRad;

    LSTween.rawTween(1100)
        .easing(Easing.Cubic.InOut)
        .onUpdate(function(obj) {
            handleT.setLocalRotation(
                quat.angleAxis(372 * obj.t * deg, axis).multiply(startRot)
            );
        })
        .onComplete(function() {
            LSTween.rawTween(220)
                .easing(Easing.Sinusoidal.Out)
                .onUpdate(function(obj) {
                    var angle = (372 - 12 * obj.t) * deg;
                    handleT.setLocalRotation(quat.angleAxis(angle, axis).multiply(startRot));
                })
                .onComplete(onComplete)
                .start();
        })
        .start();
}

function openSafeDoor() {
    var doorT = safeDoor.getTransform();
    var closedRot = doorT.getLocalRotation();
    var e = closedRot.toEulerAngles();
    var openRot = quat.fromEulerAngles(e.x, -e.y - 175, e.z);

    var overshootRot = quat.slerp(closedRot, openRot, 1.03);

    var swing = LSTween.rotateFromToLocal(doorT, closedRot, overshootRot, 600).easing(Easing.Cubic.Out);
    var settle = LSTween.rotateFromToLocal(doorT, overshootRot, openRot, 300)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(function() { print("Safe Door Opened!"); });

    swing.chain(settle);
    swing.start();
}

script.solved = false;
script.password = "00000";
script.currentString = "";

function appendDigit(ch) {
    if (script.solved) return;
    if (script.currentString.length >= script.password.length) return;
    script.currentString += ch;
    debugText.text = script.currentString.toString();
    animateIndicatorToSlot(indicatorSlotForCurrentString());
    if (script.currentString.length === script.password.length) {
        script.checkInput();
    }
}

script.pressedKey0 = function() { appendDigit("0"); };
script.pressedKey1 = function() { appendDigit("1"); };
script.pressedKey2 = function() { appendDigit("2"); };
script.pressedKey3 = function() { appendDigit("3"); };
script.pressedKey4 = function() { appendDigit("4"); };
script.pressedKey5 = function() { appendDigit("5"); };
script.pressedKey6 = function() { appendDigit("6"); };
script.pressedKey7 = function() { appendDigit("7"); };
script.pressedKey8 = function() { appendDigit("8"); };
script.pressedKey9 = function() { appendDigit("9"); };
//#endregion

script.clearInput = function() {
    script.currentString = "";
    debugText.text = script.currentString.toString();
    animateIndicatorClearToStart();
};

script.checkInput = function() {
    if (script.currentString.length !== script.password.length) {
        return;
    }
    if (script.currentString === script.password) {
        debugText.text = "-----";
        print("Safe Unlocked!");
        script.solved = true;
        global.persistentStorage.increaseStat("puzzlesSolved");
        global.persistentStorage.increaseStat("safesCracked");
        global.tweenManager.startTween(script.getSceneObject(), "turn-green");
        global.soundManager.playSpatialSound(script.getSceneObject(), "codeSafeUnlock", 1, 1);
    } else {
        script.clearInput();
        global.soundManager.playSpatialSound(script.getSceneObject(), "codeSafeFail", 1, 1);
        global.tweenManager.startTween(script.getSceneObject(), "flash-red");
    }
};

script.createEvent("OnStartEvent").bind(function() {
    testItemSpots();

    refreshIndicatorColumnXs();
    snapIndicatorToSlot(0);

    safeDoorInteractable.onTriggerEnd.add(function() {
        if (script.solved === false) {
            global.hintSystem.showHint("lockedCodeSafe");
            global.soundManager.playSpatialSound(script.getSceneObject(), "safeLocked", 1, 1);
            shakeSafeDoor();
            shakeSafeHandle();
            return;
        }

        safeDoorInteractable.release();
        safeDoorOutline.enabled = false;

        if (safeDoorOpened) return;
        safeDoorOpened = true;

        script.itemSpots[0].origin.enabled = true;

        spinSafeHandle(function() {
            global.soundManager.playSpatialSound(script.getSceneObject(), "safeDoorOpen", 1, 1);
            openSafeDoor();
        });
    });
});

script.init = function() {
    var code = "";

    for (var i = 0; i < 5; i++) {
        code += global.utils.rng(0, 9);
    }

    script.password = code;
    refreshIndicatorColumnXs();
    snapIndicatorToSlot(0);
    print("Safe Code is: " + script.password);
    return script.password;
};
