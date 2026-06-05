const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Chest Setup</font>"}
//@input Component.ScriptComponent chestInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var chestInteractable = script.chestInteractable;
//@input Component.ScriptComponent chestOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var chestOutline = script.chestOutline;
//@input SceneObject chestLid {"label":"Lid"}
/** @type {SceneObject} */
var chestLid = script.chestLid;
// @input string inventoryItemName = "bronzeKey" {"label":"Required Item"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Key Animation</font>"}
//@input SceneObject keyParent {"label":"Key Parent"}
/** @type {SceneObject} */
var keyParent = script.keyParent;
//@input SceneObject bronzeKey {"label":"Bronze Key"}
/** @type {SceneObject} */
var bronzeKey = script.bronzeKey;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Lock Animation</font>"}
//@input SceneObject lockFull {"label":"Lock (Full)"}
/** @type {SceneObject} */
var lockFull = script.lockFull;
//@input SceneObject lockLowerPart {"label":"Lower Part"}
/** @type {SceneObject} */
var lockLowerPart = script.lockLowerPart;
//@input SceneObject lockUpperPart {"label":"Upper Part (Ring)"}
/** @type {SceneObject} */
var lockUpperPart = script.lockUpperPart;
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

function testItemSpots() {
    if(script.testItems) {
        var testingPrefab = script.testItem == 0 ? script.keyTestingPrefab : script.noteTestingPrefab;
        if(script.testItem == 2) {
            testingPrefab = script.decoTestingPrefab;
        }
        var spot = script.itemSpots[script.testSpot];
        var spawnedItem = testingPrefab.instantiate(spot.origin);
        spawnedItem.getTransform().setLocalPosition(vec3.zero());
        spawnedItem.getTransform().setLocalScale(new vec3(1,1,1));
    }
}

script.chestOpened = false;
var isLockShaking = false;
var isLidShaking = false;

var lockRestRotation = null;
var lidRestRotation = null;

function shakeLock() {
    if (isLockShaking) return;
    isLockShaking = true;
    var t = lockFull.getTransform();
    if (lockRestRotation === null) lockRestRotation = t.getLocalRotation();
    var fwd = vec3.forward();
    var deg = MathUtils.DegToRad;
    var shakeLeft = LSTween.rotateToLocal(t, quat.angleAxis(2 * deg, fwd).multiply(lockRestRotation), 60).easing(Easing.Quadratic.Out);
    var shakeRight = LSTween.rotateToLocal(t, quat.angleAxis(-2 * deg, fwd).multiply(lockRestRotation), 60).easing(Easing.Quadratic.Out);
    var shakeLeft2 = LSTween.rotateToLocal(t, quat.angleAxis(1.5 * deg, fwd).multiply(lockRestRotation), 50).easing(Easing.Quadratic.Out);
    var shakeRight2 = LSTween.rotateToLocal(t, quat.angleAxis(-1.5 * deg, fwd).multiply(lockRestRotation), 50).easing(Easing.Quadratic.Out);
    var settle = LSTween.rotateToLocal(t, lockRestRotation, 80)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isLockShaking = false; });
    shakeLeft.chain(shakeRight);
    shakeRight.chain(shakeLeft2);
    shakeLeft2.chain(shakeRight2);
    shakeRight2.chain(settle);
    shakeLeft.start();
}

function shakeLid() {
    if (isLidShaking) return;
    isLidShaking = true;
    var t = chestLid.getChild(0).getTransform();
    if (lidRestRotation === null) lidRestRotation = t.getLocalRotation();
    var axis = vec3.right();
    var deg = MathUtils.DegToRad;
    var s1 = LSTween.rotateToLocal(t, quat.angleAxis(1 * deg, axis).multiply(lidRestRotation), 60).easing(Easing.Quadratic.Out);
    var s2 = LSTween.rotateToLocal(t, quat.angleAxis(-1 * deg, axis).multiply(lidRestRotation), 60).easing(Easing.Quadratic.Out);
    var s3 = LSTween.rotateToLocal(t, quat.angleAxis(0.5 * deg, axis).multiply(lidRestRotation), 50).easing(Easing.Quadratic.Out);
    var settle = LSTween.rotateToLocal(t, lidRestRotation, 70)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isLidShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(settle);
    s1.start();
}

function openLid() {
    var lidChild = chestLid.getChild(0).getTransform();
    var closedRot = lidChild.getLocalRotation();
    var axis = vec3.right();

    var swingTarget = quat.angleAxis(-49 * MathUtils.DegToRad, axis).multiply(closedRot);
    var settleTarget = quat.angleAxis(-45 * MathUtils.DegToRad, axis).multiply(closedRot);

    var lidSwing = LSTween.rotateFromToLocal(lidChild, closedRot, swingTarget, 500).easing(Easing.Cubic.Out);
    var lidSettle = LSTween.rotateFromToLocal(lidChild, swingTarget, settleTarget, 250)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(function() { print("Chest opened!"); });

    lidSwing.chain(lidSettle);
    lidSwing.start();
}

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();

    chestInteractable.onTriggerEnd.add(function() {
        if(!global.inventory.has(script.inventoryItemName)) {
            global.hintSystem.showHint("lockedChest");
            global.soundManager.playSpatialSound(script.getSceneObject(), "woodLocked", 1, 1);
            shakeLock();
            shakeLid();
            return;
        }
        if(script.chestOpened) return;
        script.chestOpened = true;

        global.utils.delay(0.5, function() {
            global.soundManager.playSpatialSound(script.getSceneObject(), "lockUnlock", 1, 1);
        })

        var keyParentTransform = keyParent.getTransform();
        var bronzeKeyTransform = bronzeKey.getTransform();
        var lockFullTransform = lockFull.getTransform();
        var lockLowerTransform = lockLowerPart.getTransform();

        var ZERO = vec3.zero();
        var ONE = vec3.one();
        var halfTurnX = quat.angleAxis(Math.PI, vec3.right());
        var quadOut = Easing.Quadratic.Out;

        var scaleOnKey = LSTween.scaleFromToLocal(keyParentTransform, ZERO, ONE, 300).easing(quadOut);
        var pushKey = LSTween.moveOffset(keyParentTransform, new vec3(0, 0, -3.6), 300).easing(quadOut);
        var spinKey = LSTween.rotateOffset(bronzeKeyTransform, halfTurnX, 300).easing(quadOut);
        var spin2Key = LSTween.rotateOffset(bronzeKeyTransform, halfTurnX, 300).easing(quadOut);
        var scaleOffKey = LSTween.scaleFromToLocal(keyParentTransform, ONE, ZERO, 300).easing(quadOut);

        var lockLowerDrop = LSTween.moveOffset(lockLowerTransform, new vec3(-0.15, -0.40, 0), 350).easing(Easing.Cubic.In);
        var lockLowerTilt = LSTween.rotateOffset(lockLowerTransform, quat.angleAxis(-5 * MathUtils.DegToRad, vec3.forward()), 350).easing(quadOut);
        var lockLowerOpen = LSTween.rotateOffset(lockLowerTransform, quat.angleAxis(-45 * MathUtils.DegToRad, vec3.up()), 400).easing(Easing.Back.Out);
        var lockRotate = LSTween.rotateOffset(lockFullTransform, quat.angleAxis(90 * MathUtils.DegToRad, vec3.forward()), 400).easing(Easing.Back.Out);
        var lockSlideOut = LSTween.moveOffset(lockFullTransform, new vec3(-5, 0, 0), 450).easing(Easing.Cubic.In);
        var lockScaleOut = LSTween.scaleFromToLocal(lockFullTransform, lockFullTransform.getLocalScale(), ZERO, 250)
            .easing(Easing.Back.In)
            .onComplete(function() {
                global.soundManager.playSpatialSound(script.getSceneObject(), "chestOpen", 1, 1);
                chestInteractable.release();
                chestOutline.enabled = false;
                script.itemSpots[0].origin.enabled = true;
                openLid();
            });

        scaleOnKey.chain(pushKey);
        pushKey.chain(spinKey);
        spinKey.chain(spin2Key);
        spin2Key.chain(scaleOffKey);
        scaleOffKey.chain(lockLowerDrop, lockLowerTilt);
        lockLowerDrop.chain(lockLowerOpen);
        lockLowerOpen.chain(lockRotate);
        lockRotate.chain(lockSlideOut);
        lockSlideOut.chain(lockScaleOut);
        scaleOnKey.start();
    })

})

script.init = function() {
    return script.inventoryItemName;
}