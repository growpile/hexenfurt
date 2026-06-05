const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Clock Hands</font>"}
//@input Component.ScriptComponent minutesArrowManipulation {"label":"Minutes Manipulation"}
/** @type {ScriptComponent} */
var minutesArrowManipulation = script.minutesArrowManipulation;
//@input Component.ScriptComponent hoursArrowManipulation {"label":"Hours Manipulation"}
/** @type {ScriptComponent} */
var hoursArrowManipulation = script.hoursArrowManipulation;
//@input SceneObject hoursArrow {"label":"Hours Arrow Mesh"}
/** @type {SceneObject} */
var hoursArrow = script.hoursArrow;
//@input SceneObject minutesArrow {"label":"Minutes Arrow Mesh"}
/** @type {SceneObject} */
var minutesArrow = script.minutesArrow;
//@input Component.Text debugTimeText {"label":"Debug Time Text"}
/** @type {Text} */
var debugTimeText = script.debugTimeText;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Pendulum & Hanging Parts</font>"}
//@input SceneObject mainHangingPart {"label":"Main Hanging Part"}
/** @type {SceneObject} */
var mainHangingPart = script.mainHangingPart;
//@input SceneObject[] smallHangingParts {"label":"Small Hanging Parts"}
/** @type {SceneObject[]} */
var smallHangingParts = script.smallHangingParts;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Drawer</font>"}
//@input Component.ScriptComponent drawerInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var drawerInteractable = script.drawerInteractable;
//@input Component.ScriptComponent drawerManipulation {"label":"Manipulation"}
/** @type {ScriptComponent} */
var drawerManipulation = script.drawerManipulation;
//@input Component.ScriptComponent drawerOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var drawerOutline = script.drawerOutline;
//@input SceneObject drawer {"label":"Drawer Object"}
/** @type {SceneObject} */
var drawer = script.drawer;
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
        spawnedItem.getTransform().setLocalScale(vec3.one());
    }
}

script.solved = false;
script.drawerOpened = false;

var isAnimating = false;
var elapsedTime = 0;
var animationSpeed = 5;
var updateEvent = null;
var OFFSET_HOURS_DEG = 270;
var OFFSET_MIN_DEG = -90;
script.targetHour = 12;
script.targetMinute = 0;

var isShaking = false;
var drawerRestPos = null;

function hourPivot() { return hoursArrow.getParent(); }
function minutePivot() { return minutesArrow.getParent(); }
function hourPivotT() { return hourPivot().getTransform(); }
function minutePivotT() { return minutePivot().getTransform(); }

function quatFromZDegrees(deg) {
    return quat.fromEulerAngles(0, 0, deg * (Math.PI / 180));
}
function codeString() {
    return script.targetHour + ":" + (script.targetMinute === 0 ? "00" : "30");
}
function randomInt(min, maxInclusive) {
    return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}
function normalizeDeg(d) { return (d % 360 + 360) % 360; }
function rad2deg(r) { return r * 180 / Math.PI; }

function getPivotLocalZDeg(pivotSO) {
    var q = pivotSO.getTransform().getLocalRotation();
    var e = q.toEulerAngles();
    return normalizeDeg(rad2deg(e.z));
}

function angleCWFrom12_inParentSpace(pivotSO, driverSO) {
    var pivotT = pivotSO.getTransform();
    var parentT = pivotSO.getParent() ? pivotSO.getParent().getTransform() : null;

    var p = pivotT.getWorldPosition();
    var d = driverSO.getTransform().getWorldPosition();
    var vWorld = d.sub(p);

    var vLocal = vWorld;
    if (parentT) {
        var parentWRot = parentT.getWorldRotation();
        var inv = parentWRot.invert();
        vLocal = inv.multiplyVec3(vWorld);
    }

    var degCCW_fromPosX = rad2deg(Math.atan2(vLocal.y, vLocal.x));
    return normalizeDeg(90 - degCCW_fromPosX);
}

function localZFromDesiredAngleCW(desiredCW, offsetDeg) {
    return normalizeDeg(360 + offsetDeg - desiredCW);
}

function updateTime() {
    var hourLocalZ = getPivotLocalZDeg(hourPivot());
    var minuteLocalZ = getPivotLocalZDeg(minutePivot());

    var hourAngleCW = normalizeDeg((360 - hourLocalZ) + OFFSET_HOURS_DEG);
    var minuteAngleCW = normalizeDeg((360 - minuteLocalZ) + OFFSET_MIN_DEG);

    var hours = (hourAngleCW / 360) * 12;
    var minutes = (minuteAngleCW / 360) * 60;

    if (hours >= 12) hours -= 12;
    if (hours < 0) hours += 12;
    if (minutes >= 60) minutes -= 60;
    if (minutes < 0) minutes += 60;

    var displayHours = Math.floor(hours) === 0 ? 12 : Math.floor(hours);
    var minutesInt = Math.floor(minutes);
    var displayMinutes = minutesInt.toString().padStart(2, "0");

    if(debugTimeText) {
        debugTimeText.text = displayHours + ":" + displayMinutes;
    }
}

function checkTime() {
    var hourLocalZ = getPivotLocalZDeg(hourPivot());
    var minuteLocalZ = getPivotLocalZDeg(minutePivot());

    var hourAngleCW = normalizeDeg((360 - hourLocalZ) + OFFSET_HOURS_DEG);
    var minuteAngleCW = normalizeDeg((360 - minuteLocalZ) + OFFSET_MIN_DEG);

    var hours = (hourAngleCW / 360) * 12;
    var minutes = (minuteAngleCW / 360) * 60;

    if (hours >= 12) hours -= 12;
    if (hours < 0) hours += 12;
    if (minutes >= 60) minutes -= 60;
    if (minutes < 0) minutes += 60;

    var displayHours = Math.floor(hours) === 0 ? 12 : Math.floor(hours);
    var minutesInt = Math.floor(minutes);
    var displayMinutes = minutesInt.toString().padStart(2, "0");

    if(debugTimeText) {
        debugTimeText.text = displayHours + ":" + displayMinutes;
    }

    if (!isAnimating && !script.solved) {
        var tol = 1;
        var minutesRounded = Math.round(minutes) % 60;

        function minuteDiff(a, b) {
            var d = Math.abs(((a - b) % 60 + 60) % 60);
            return d > 30 ? 60 - d : d;
        }

        var minuteDelta = minuteDiff(minutesRounded, script.targetMinute);

        if (displayHours === script.targetHour && minuteDelta <= tol) {
            script.solved = true;
            global.persistentStorage.increaseStat("puzzlesSolved");
            print("Clock drawer unlocked!");
            global.soundManager.playSpatialSound(script.getSceneObject(), "codeSafeUnlock", 0.5, 1);
        }
    }
}

function beginAnimation() {
    elapsedTime = 0;
    isAnimating = true;

    hourPivotT().setLocalRotation(quatFromZDegrees(180 + OFFSET_HOURS_DEG));
    minutePivotT().setLocalRotation(quatFromZDegrees(0 + OFFSET_MIN_DEG));

    updateTime();
    global.soundManager.playSpatialSound(script.getSceneObject(), "clockTickLoop", 1, -1);

    if (!updateEvent) {
        updateEvent = script.createEvent("UpdateEvent");
        updateEvent.bind(onUpdate);
    }
}

function onUpdate(ev) {
    if (!isAnimating) return;

    elapsedTime += ev.getDeltaTime() * animationSpeed;

    var minuteAngle = (elapsedTime / 60) * 360 % 360;
    var hourAngle = (elapsedTime / (12 * 60)) * 360 % 360;
    hourAngle += 180;

    var hourLocalZ = localZFromDesiredAngleCW(hourAngle, OFFSET_HOURS_DEG);
    var minuteLocalZ = localZFromDesiredAngleCW(minuteAngle, OFFSET_MIN_DEG);

    hourPivotT().setLocalRotation(quatFromZDegrees(hourLocalZ));
    minutePivotT().setLocalRotation(quatFromZDegrees(minuteLocalZ));

    updateTime();
}

function stopAnimation() { isAnimating = false; }

function driveMinuteFromDriver() {
    var driverSO = minutesArrowManipulation.getSceneObject();
    var desiredCW = angleCWFrom12_inParentSpace(minutePivot(), driverSO);
    var localZ = localZFromDesiredAngleCW(desiredCW, OFFSET_MIN_DEG);
    minutePivotT().setLocalRotation(quatFromZDegrees(localZ));
    updateTime();
}

function driveHourFromDriver() {
    var driverSO = hoursArrowManipulation.getSceneObject();
    var desiredCW = angleCWFrom12_inParentSpace(hourPivot(), driverSO);
    var localZ = localZFromDesiredAngleCW(desiredCW, OFFSET_HOURS_DEG);
    hourPivotT().setLocalRotation(quatFromZDegrees(localZ));
    updateTime();
}

function shakeDrawer() {
    if (isShaking) return;
    isShaking = true;
    var t = drawer.getTransform();
    if (drawerRestPos === null) drawerRestPos = t.getLocalPosition();
    var d = 0.4;
    var fwd = new vec3(0, 0, d);
    var back = new vec3(0, 0, -d);
    var s1 = LSTween.moveFromToLocal(t, drawerRestPos, drawerRestPos.add(fwd), 50).easing(Easing.Quadratic.Out);
    var s2 = LSTween.moveFromToLocal(t, drawerRestPos.add(fwd), drawerRestPos.add(back), 50).easing(Easing.Quadratic.Out);
    var s3 = LSTween.moveFromToLocal(t, drawerRestPos.add(back), drawerRestPos.add(fwd.uniformScale(0.5)), 40).easing(Easing.Quadratic.Out);
    var s4 = LSTween.moveFromToLocal(t, drawerRestPos.add(fwd.uniformScale(0.5)), drawerRestPos.add(back.uniformScale(0.5)), 40).easing(Easing.Quadratic.Out);
    var settle = LSTween.moveFromToLocal(t, drawerRestPos.add(back.uniformScale(0.5)), drawerRestPos, 60)
        .easing(Easing.Quadratic.Out)
        .onComplete(function() { isShaking = false; });
    s1.chain(s2);
    s2.chain(s3);
    s3.chain(s4);
    s4.chain(settle);
    s1.start();
}

var activePendulumTweens = [];

function startPendulumAnimations() {
    var mainT = mainHangingPart.getTransform();
    var deg = MathUtils.DegToRad;
    var pendulumTween = LSTween.rotateFromToLocal(
        mainT,
        quat.angleAxis(8 * deg, vec3.forward()).multiply(mainT.getLocalRotation()),
        quat.angleAxis(-8 * deg, vec3.forward()).multiply(mainT.getLocalRotation()),
        2200
    ).easing(Easing.Sinusoidal.InOut).repeat(Infinity).yoyo(true);
    pendulumTween.start();
    activePendulumTweens.push(pendulumTween);

    for (var i = 0; i < smallHangingParts.length; i++) {
        var partT = smallHangingParts[i].getTransform();
        var startPos = partT.getLocalPosition();
        var delay = i * 300;
        var drift = 0.6 + (i % 3) * 0.25;
        var duration = 1800 + (i % 2) * 400;
        var hangTween = LSTween.moveFromToLocal(
            partT,
            startPos,
            startPos.add(new vec3(0, drift, 0)),
            duration
        ).easing(Easing.Sinusoidal.InOut).repeat(Infinity).yoyo(true).delay(delay);
        hangTween.start();
        activePendulumTweens.push(hangTween);
    }
}

function stopPendulumAnimations() {
    for (var i = 0; i < activePendulumTweens.length; i++) {
        activePendulumTweens[i].stop();
    }
    activePendulumTweens = [];
}

function openDrawer() {
    var t = drawer.getTransform();
    var startPos = t.getLocalPosition();
    var overshoot = new vec3(startPos.x, startPos.y, startPos.z + 8.6);
    var target = new vec3(startPos.x, startPos.y, startPos.z + 8);

    var slide = LSTween.moveFromToLocal(t, startPos, overshoot, 450).easing(Easing.Cubic.Out);
    var settle = LSTween.moveFromToLocal(t, overshoot, target, 200)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(function() { print("Drawer Opened!"); });

    slide.chain(settle);
    slide.start();
}

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();
    startPendulumAnimations();

    minutesArrowManipulation.onTranslationStart.add(function() {
        stopAnimation();
        global.soundManager.stopSpatialSound(script.getSceneObject(), "clockTickLoop");
    });
    hoursArrowManipulation.onTranslationStart.add(function() {
        stopAnimation();
        global.soundManager.stopSpatialSound(script.getSceneObject(), "clockTickLoop");
    });

    minutesArrowManipulation.onTranslationEnd.add(function() {
        var driverT = minutesArrowManipulation.getSceneObject().getTransform();
        var arrowTipT = minutesArrow.getChild(0).getTransform();
        driverT.setWorldPosition(arrowTipT.getWorldPosition());
        updateTime();
        checkTime();
    });
    hoursArrowManipulation.onTranslationEnd.add(function() {
        var driverT = hoursArrowManipulation.getSceneObject().getTransform();
        var arrowTipT = hoursArrow.getChild(0).getTransform();
        driverT.setWorldPosition(arrowTipT.getWorldPosition());
        updateTime();
        checkTime();
    });

    minutesArrowManipulation.onTranslationUpdate.add(function() {
        driveMinuteFromDriver();
    });
    hoursArrowManipulation.onTranslationUpdate.add(function() {
        driveHourFromDriver();
    });

    drawerInteractable.onTriggerEnd.add(function() {
        if(!script.solved) {
            global.hintSystem.showHint("lockedClockDrawer");
            global.soundManager.playSpatialSound(script.getSceneObject(), "woodLocked", 1, 1);
            shakeDrawer();
            return;
        }
        if(script.drawerOpened) return;
        script.drawerOpened = true;

        script.itemSpots[0].origin.enabled = true;
        global.soundManager.playSpatialSound(script.getSceneObject(), "drawerOpen", 1, 1);
        drawerInteractable.release();
        drawerOutline.enabled = false;
        openDrawer();
    })

    updateTime();
});

script.init = function() {
    beginAnimation();

    script.targetHour = randomInt(1, 12);
    script.targetMinute = Math.random() < 0.5 ? 0 : 30;
    print("Clock pass time: " + codeString());

    return codeString();
}

script.init();

script.createEvent("OnDestroyEvent").bind(function() {
    stopPendulumAnimations();
});