const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Safe Setup</font>"}
//@input Component.ScriptComponent safeDoorInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var safeDoorInteractable = script.safeDoorInteractable;
//@input Component.ScriptComponent safeDoorOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var safeDoorOutline = script.safeDoorOutline;
//@input SceneObject safeDoor {"label":"Safe Door"}
/** @type {SceneObject} */
var safeDoor = script.safeDoor;
//@input SceneObject safeHandle {"label":"Handle"}
/** @type {SceneObject} */
var safeHandle = script.safeHandle;
// @input string inventoryItemName = "silverKey" {"label":"Required Item"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
//@input SceneObject keyParent {"label":"Key Parent"}
/** @type {SceneObject} */
var keyParent = script.keyParent;
//@input SceneObject silverKey {"label":"Silver Key"}
/** @type {SceneObject} */
var silverKey = script.silverKey;
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

var KEY_SCALE = new vec3(1, 1, 1);

function spinKeyEase(t) {
    var p1 = 250 / 700;
    var p2 = 450 / 700;
    if (t <= p1) {
        var u = t / p1;
        return 0.35 * u * u;
    }
    if (t <= p2) {
        var u = (t - p1) / (p2 - p1);
        return 0.35 + 0.30 * u;
    }
    var u = (t - p2) / (1 - p2);
    return 0.65 + 0.35 * (1 - (1 - u) * (1 - u));
}

function spinSilverKey(silverKeyT, onDone) {
    var startRot = silverKeyT.getLocalRotation();
    var axis = vec3.up();
    var deg = MathUtils.DegToRad;

    LSTween.rawTween(700)
        .onUpdate(function(obj) {
            var progress = spinKeyEase(obj.t);
            silverKeyT.setLocalRotation(
                quat.angleAxis(360 * progress * deg, axis).multiply(startRot)
            );
        })
        .onComplete(onDone)
        .start();
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

function onUnlockComplete() {
    safeDoorInteractable.release();
    safeDoorOutline.enabled = false;

    global.persistentStorage.increaseStat("puzzlesSolved");
    global.persistentStorage.increaseStat("safesCracked");

    script.itemSpots[0].origin.enabled = true;

    spinSafeHandle(function() {
        global.soundManager.playSpatialSound(script.getSceneObject(), "safeDoorOpen", 1, 1);
        openSafeDoor();
    });
}

script.createEvent("OnStartEvent").bind(function() {
    testItemSpots();

    safeDoorInteractable.onTriggerEnd.add(function() {
        if (!global.inventory.has(script.inventoryItemName)) {
            global.hintSystem.showHint("lockedKeySafe");
            global.soundManager.playSpatialSound(script.getSceneObject(), "safeLocked", 1, 1);
            shakeSafeDoor();
            shakeSafeHandle();
            return;
        }
        if (safeDoorOpened) return;
        safeDoorOpened = true;

        global.utils.delay(0.5, function() {
            global.soundManager.playSpatialSound(script.getSceneObject(), "lockUnlock", 1, 1);
        });

        var keyParentT = keyParent.getTransform();
        var silverKeyT = silverKey.getTransform();
        var ZERO = vec3.zero();
        var quadOut = Easing.Quadratic.Out;

        var keyPos = keyParentT.getLocalPosition();
        var pushStart = new vec3(keyPos.x, 17.0, keyPos.z);
        var pushEnd = new vec3(keyPos.x, 12.0, keyPos.z);

        var scaleOnKey = LSTween.scaleFromToLocal(keyParentT, ZERO, KEY_SCALE, 300).easing(quadOut);
        var pushKey = LSTween.moveFromToLocal(keyParentT, pushStart, pushEnd, 300).easing(quadOut);
        var scaleOffKey = LSTween.scaleFromToLocal(keyParentT, KEY_SCALE, ZERO, 300)
            .easing(quadOut)
            .onComplete(onUnlockComplete);

        scaleOnKey.chain(pushKey);
        pushKey.onComplete(function() {
            spinSilverKey(silverKeyT, function() { scaleOffKey.start(); });
        });
        scaleOnKey.start();
    });
});

script.init = function() {
    return script.inventoryItemName;
}
