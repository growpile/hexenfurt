const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Door Setup</font>"}
//@input Component.ScriptComponent doorInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var doorInteractable = script.doorInteractable;
//@input Component.ScriptComponent doorOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var doorOutline = script.doorOutline;
//@input SceneObject doorPivot {"label":"Door Pivot"}
/** @type {SceneObject} */
var doorPivot = script.doorPivot;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
//@input SceneObject keyParent {"label":"Key Parent"}
/** @type {SceneObject} */
var keyParent = script.keyParent;
//@input SceneObject goldKey {"label":"Gold Key"}
/** @type {SceneObject} */
var goldKey = script.goldKey;
// @ui {"widget":"group_end"}

//#endregion

var doorOpened = false;
var isShaking = false;
var doorRestRot = null;

function shakeDoor() {
    if (isShaking) return;
    isShaking = true;
    var t = doorPivot.getTransform();
    if (doorRestRot === null) doorRestRot = t.getLocalRotation();
    var up = vec3.up();
    var deg = MathUtils.DegToRad;
    var s1 = LSTween.rotateToLocal(t, quat.angleAxis(2 * deg, up).multiply(doorRestRot), 60).easing(Easing.Quadratic.Out);
    var s2 = LSTween.rotateToLocal(t, quat.angleAxis(-2 * deg, up).multiply(doorRestRot), 60).easing(Easing.Quadratic.Out);
    var s3 = LSTween.rotateToLocal(t, quat.angleAxis(1 * deg, up).multiply(doorRestRot), 50).easing(Easing.Quadratic.Out);
    var settle = LSTween.rotateToLocal(t, doorRestRot, 70)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(settle);
    s1.start();
}

function openDoor() {
    var doorT = doorPivot.getTransform();
    var closedRot = doorT.getLocalRotation();
    var axis = vec3.up();

    var crackTarget = quat.angleAxis(-3 * MathUtils.DegToRad, axis).multiply(closedRot);
    var swingTarget = quat.angleAxis(-48 * MathUtils.DegToRad, axis).multiply(closedRot);
    var settleTarget = quat.angleAxis(-45 * MathUtils.DegToRad, axis).multiply(closedRot);

    var crack = LSTween.rotateFromToLocal(doorT, closedRot, crackTarget, 250).easing(Easing.Quadratic.Out);
    var swing = LSTween.rotateFromToLocal(doorT, crackTarget, swingTarget, 600).easing(Easing.Cubic.Out);
    var settle = LSTween.rotateFromToLocal(doorT, swingTarget, settleTarget, 350)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(function() { global.doorOpened(script.getSceneObject()); });

    crack.chain(swing);
    swing.chain(settle);
    crack.start();
}

script.createEvent("OnStartEvent").bind(() => {
    doorInteractable.onTriggerEnd.add(function() {
        if(!global.inventory.has("goldKey")) {
            global.hintSystem.showHint("lockedDoor");
            global.soundManager.playSpatialSound(script.getSceneObject(), "woodLocked", 1, 1);
            shakeDoor();
            return;
        }
        if(doorOpened) return;
        doorOpened = true;

        doorInteractable.release();
        doorOutline.enabled = false;

        global.utils.delay(0.5, function() {
            global.soundManager.playSpatialSound(script.getSceneObject(), "lockUnlock", 1, 1);
        })

        var keyParentTransform = keyParent.getTransform();
        var goldKeyTransform = goldKey.getTransform();

        var ZERO = vec3.zero();
        var KEY_SCALE = new vec3(0.4255, 0.4255, 0.4255);
        var quadOut = Easing.Quadratic.Out;

        var halfTurnX = quat.angleAxis(Math.PI, vec3.right());

        var scaleOnKey = LSTween.scaleFromToLocal(keyParentTransform, ZERO, KEY_SCALE, 300).easing(quadOut);
        var pushKey = LSTween.moveOffset(keyParentTransform, new vec3(0, 0, -3.6), 300).easing(quadOut);
        var spin1 = LSTween.rotateOffset(goldKeyTransform, halfTurnX, 250).easing(Easing.Quadratic.In);
        var spin2 = LSTween.rotateOffset(goldKeyTransform, halfTurnX, 200).easing(Easing.Linear.None);
        var spin3 = LSTween.rotateOffset(goldKeyTransform, halfTurnX, 250).easing(Easing.Quadratic.Out);
        var scaleOffKey = LSTween.scaleFromToLocal(keyParentTransform, KEY_SCALE, ZERO, 300).easing(quadOut)
            .onComplete(function() {
                print("Door unlocked!");
                global.soundManager.playSpatialSound(script.getSceneObject(), "doorOpen", 1, 1);
                global.persistentStorage.increaseStat("doorsOpened");
                openDoor();
            });

        scaleOnKey.chain(pushKey);
        pushKey.chain(spin1);
        spin1.chain(spin2);
        spin2.chain(spin3);
        spin3.chain(scaleOffKey);
        scaleOnKey.start();
    });
});
