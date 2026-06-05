// @ui {"widget":"group_start", "label":"‎<font color='white'>Core Systems</font>"}
// @input Component.ScriptComponent worldQueryManager
// @input Component.ScriptComponent uiViewController
//@input Component.ScriptComponent interactionHintController
//@input Component.ScriptComponent supabaseTable
//@input SceneObject poiRoot
//@input float loadTime
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Interactors</font>"}
//@input Component.ScriptComponent[] handInteractors
//@input Component.ScriptComponent mouseInteractor
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>UI</font>"}
//@input SceneObject[] menuButtons
//@input SceneObject[] uiGloves
// @input Component.Text anchorsHint
// @input Component.Text loadingTipText
// @input Component.Text descriptionText
//@input string[] loadingTips
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Intro Sequence</font>"}
//@input SceneObject introRoot {"label":"Intro Root (for scale)"}
// @input Component.Text introLabel
//@input Asset.Material introLogoMaterial {"label":"Logo Material"}
// @input Component.Text introTableHint
// @input Component.Text introSkipHint
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Hint System</font>"}
//@input Asset.Material textOccluder
//@input Component.Text hintTextComponent
//@input float typewriterDuration = 0.5 {"label":"Typewriter Duration (s)"}
//@input float occluderShowAlpha = 0.7 {"label":"Occluder Show Alpha"}
//@input float hintDisplayTime = 1.0 {"label":"Display Time (s)"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Ambient Creaks</font>"}
//@input SceneObject creakCamera
//@input SceneObject[] creakSurrounds
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Room POIs</font>"}
/*
@typedef roomObjectsClass
@property {string} id {"label": "Identifier"}
@property {Asset.ObjectPrefab} objectPrefab
@property {string} objectType = "ground" {"widget":"combobox", "values":[{"label":"Ground", "value":"ground"}, {"label":"Wall", "value":"wall"}, {"label":"Ceiling", "value":"ceiling"}]}
@property {bool} lockedItem
@property {bool} canAnimateScale
@property {bool} canBeFinal
*/
//@input Asset.ObjectPrefab escapeDoor
// @input roomObjectsClass[] roomObjects {"label": "Room Object Prefabs"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Pickup Objects</font>"}
/*
@typedef pickupObjectsClass
@property {string} id {"label": "Identifier"}
@property {Asset.ObjectPrefab} objectPrefab
@property {string} objectType = "key" {"widget":"combobox", "values":[{"label":"Key", "value":"key"}, {"label":"Note", "value":"note"}]}
*/
// @input pickupObjectsClass[] pickupObjects
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Deco Objects</font>"}
/*
@typedef decoObjectsClass
@property {string} id {"label": "Identifier"}
@property {Asset.ObjectPrefab} objectPrefab
@property {int} maxCount = 2
@property {string[]} excludedObjects
*/
// @input decoObjectsClass[] decoObjects {"label": "Deco Object Prefabs"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Lore Objects</font>"}
/*
@typedef loreObjectsClass
@property {string} id {"label": "Identifier"}
@property {Asset.ObjectPrefab} objectPrefab
@property {int} orientation = 0 {"widget":"combobox", "values":[{"label":"Horizontal", "value":0}, {"label":"Vertical", "value":1}]}
*/
// @input loreObjectsClass[] loreObjects {"label": "Lore Object Prefabs"}
// @ui {"widget":"group_end"}

var worldQueryManager = script.worldQueryManager;
var uiViewController = script.uiViewController;
var poiRoot = script.poiRoot;
var loadTime = script.loadTime;
var handInteractors = script.handInteractors;
var mouseInteractor = script.mouseInteractor;
var menuButtons = script.menuButtons;
var uiGloves = script.uiGloves;
var anchorsHint = script.anchorsHint;
var escapeDoor = script.escapeDoor;
var textOccluder = script.textOccluder;
var hintTextComponent = script.hintTextComponent;

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

const InteractionHintModule = require("Addons/Spectacles3DHandHints.lspkg/Scripts/InteractionHintController");
const { HandAnimationClipInfo, HandAnimationsLibrary, HandMode, InteractionHintController } = InteractionHintModule;

var sikModule = require("SpectaclesInteractionKit.lspkg/SIK");
var SIK = sikModule.SIK || sikModule.default || sikModule;
var InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;

//#region Hint System

const HINTS = {
    "lockedChest": "Hmm. Looks like the chest is locked.",
    "lockedDoor": "I wonder who locked the door?",
    "lockedKeySafe": "It's locked. Maybe I can find the key.",
    "lockedCodeSafe": "What could the combination be?",
    "lockedBookshelfDrawer": "I'm not sure how to open this.",
    "lockedClockDrawer": "It's locked. Doesn't seem like it has a key.",
    "addedLore": "Lore piece added to Archive.",
    "seenLore": "I've already seen this.",
    "addedNote": "Interesting note. I will write that down.",
    "added_bronzeKey": "A bronze key! What could it open?",
    "added_silverKey": "A silver key... must open something important.",
    "added_goldKey": "A gold key? This one feels special.",
    "openInventoryHint": "Open the Inventory by looking at your right palm."
};

var hintSelf = {};
global.hintSystem = hintSelf;

var hintQueue = [];
var currentHintId = null;
var hintState = "idle";
var occluderTween = null;
var typewriterTween = null;

function stopTween(tween) {
    if (tween) tween.stop();
}

function fadeOccluder(toAlpha, durationSec, onDone) {
    stopTween(occluderTween);
    occluderTween = LSTween.alphaTo(textOccluder, toAlpha, durationSec * 1000);
    if (onDone) occluderTween.onComplete(onDone);
    occluderTween.start();
}

function typewriterIn(text, durationSec, onDone) {
    stopTween(typewriterTween);
    hintTextComponent.text = "";
    var len = text.length;
    typewriterTween = LSTween.rawTween(durationSec * 1000)
        .onUpdate(function(obj) {
            hintTextComponent.text = text.substr(0, Math.floor(obj.t * len));
        })
        .onComplete(function() {
            hintTextComponent.text = text;
            if (onDone) onDone();
        });
    typewriterTween.start();
}

function typewriterOut(durationSec, onDone) {
    stopTween(typewriterTween);
    var startText = hintTextComponent.text || "";
    var len = startText.length;
    typewriterTween = LSTween.rawTween(durationSec * 1000)
        .onUpdate(function(obj) {
            hintTextComponent.text = startText.substr(0, Math.max(0, len - Math.floor(len * obj.t)));
        })
        .onComplete(function() {
            hintTextComponent.text = "";
            if (onDone) onDone();
        });
    typewriterTween.start();
}

function processNextHint() {
    if (hintState !== "idle") return;
    if (hintQueue.length === 0) {
        fadeOccluder(0.0, script.typewriterDuration, function() {});
        if (hintTextComponent.text && hintTextComponent.text.length > 0) {
            typewriterOut(script.typewriterDuration, function() {});
        }
        return;
    }
    showOneHint(hintQueue.shift());
}

function showOneHint(hintId) {
    currentHintId = hintId;
    hintState = "typingIn";

    var text = HINTS[hintId];
    if (text === undefined) { text = "[" + hintId + "]"; }

    fadeOccluder(script.occluderShowAlpha, script.typewriterDuration, null);
    typewriterIn(text, script.typewriterDuration, function() {
        hintState = "holding";
        global.utils.delay(script.hintDisplayTime, function() {
            hintState = "typingOut";
            fadeOccluder(0.0, script.typewriterDuration, null);
            typewriterOut(script.typewriterDuration, function() {
                currentHintId = null;
                hintState = "idle";
                processNextHint();
            });
        });
    });
}

hintSelf.showHint = function(hintId) {
    print("Showing hint: " + hintId);
    if (currentHintId === hintId && hintState !== "idle") { return; }
    if (hintState === "idle") {
        showOneHint(hintId);
    } else {
        hintQueue.push(hintId);
    }
};

hintSelf.clearQueue = function() { hintQueue.length = 0; };
hintSelf.isBusy = function() { return hintState !== "idle"; };
hintSelf.currentHintId = function() { return currentHintId; };

var initColor = textOccluder.mainPass.baseColor;
initColor.a = 0;
textOccluder.mainPass.baseColor = initColor;
hintTextComponent.text = "";

//#endregion

//#region Creak Manager

var creakCamera = script.creakCamera;
var creakLastPos = creakCamera.getTransform().getWorldPosition();
var creakTimePassed = 0;
var CREAK_CHECK_INTERVAL = 5.0;
var CREAK_MOVE_THRESHOLD = 25.0;

var creakUpdateEvent = script.createEvent("UpdateEvent");
creakUpdateEvent.bind(function(eventData) {
    creakTimePassed += eventData.getDeltaTime();
    if (creakTimePassed >= CREAK_CHECK_INTERVAL) {
        creakTimePassed = 0;
        var currentPos = creakCamera.getTransform().getWorldPosition();
        if (currentPos.distance(creakLastPos) >= CREAK_MOVE_THRESHOLD) {
            if (Math.random() < 0.5) {
                var parent = script.creakSurrounds[global.utils.rng(0, 1)];
                global.soundManager.playSpatialSound(parent, "creak" + global.utils.rng(1, 6), 1, 1);
            }
        }
        creakLastPos = currentPos;
    }
});

//#endregion

//#region Game Phases & UI

script.currentPhase = 0;
var phaseViews = ["menuView", "setupView", "setupView", "setupView", "setupView", "gameView"];
script.isUsingEditorSetup = false;
script.roomAlreadyScanned = false;

script.checkCurrentPhaseData = function(callbackIfHas) {
    switch (script.currentPhase) {
        case 1:
            if (worldQueryManager.eyeHeight != null) { if (callbackIfHas) callbackIfHas(); return true; }
            break;
        case 2:
            if (worldQueryManager.groundHeight != null) { if (callbackIfHas) callbackIfHas(); return true; }
            break;
        case 3:
            if (worldQueryManager.exitDoor != null) { if (callbackIfHas) callbackIfHas(); return true; }
            break;
        case 4:
            if (worldQueryManager.checkAnchorsNeededAlt()) { if (callbackIfHas) callbackIfHas(); return true; }
            break;
    }
    return false;
};

script.nextPhase = function() {
    script.worldQueryManager.stopRecording();
    script.currentPhase++;
    print("Entered phase: " + script.currentPhase + ", " + phaseViews[script.currentPhase]);

    switch (script.currentPhase) {
        case 1:
            script.interactionHintController.playHintAnimation(HandMode.Right, HandAnimationsLibrary.Right.PinchFar, 2, 2.5);
            script.descriptionText.text = "Stand up naturally and pinch anywhere to capture your eye height.";
            worldQueryManager.recordEyeHeight(eyeLevelCaptured);
            break;
        case 2:
            script.descriptionText.text = "Look at the floor and pinch anywhere to capture ground level.";
            worldQueryManager.recordGroundHeight(groundLevelCaptured);
            break;
        case 3:
            script.descriptionText.text = "Look at a wall and pinch anywhere to place the Escape Door.";
            worldQueryManager.recordDoorSurfaceAnchor(doorPositionCaptured);
            break;
        case 4:
            script.descriptionText.text = "Look around and place anchors for the required surfaces by pinching.";
            script.updateAnchorRequirementsHint();
            worldQueryManager.recordPOISurfaceAnchors(poisCaptured);
            break;
        default:
            break;
    }
};

script.returnNextPhaseView = function() {
    return phaseViews[script.currentPhase + 1];
};

function eyeLevelCaptured() {
    print("Eye Level Recorded!");
    script.interactionHintController.playHintAnimation(HandMode.Right, HandAnimationsLibrary.Right.PinchFar, 2, 0.3);
    script.descriptionText.text = "Stand up naturally and pinch anywhere to capture your eye height.\n\n HOLD pinch to continue setup.";
    uiViewController.recordedData();
}

function groundLevelCaptured() {
    print("Ground Level Recorded!");
    script.descriptionText.text = "Look at the floor and pinch anywhere to capture ground level.\n\n HOLD pinch to continue setup.";
    uiViewController.recordedData();
}

function doorPositionCaptured() {
    print("Door Position Recorded!");
    script.descriptionText.text = "Look at a wall and pinch anywhere to place the Escape Door.\n\n HOLD pinch to continue setup.";
    uiViewController.recordedData();
}

function poisCaptured() {
    print("Anchors Recorded!");
    script.descriptionText.text = "Look around and place anchors for the required surfaces by pinching.\n\n HOLD pinch to begin your story.";
    uiViewController.recordedData();
}

global.removedAnchor = function() {
    uiViewController.removedAnchor();
    script.updateAnchorRequirementsHint();
};

script.updateAnchorRequirementsHint = function() {
    anchorsHint.text = worldQueryManager.checkAnchorsNeeded();
};

script.recordTap = function() {
    var phaseCb = null;
    switch (script.currentPhase) {
        case 1: phaseCb = eyeLevelCaptured; break;
        case 2: phaseCb = groundLevelCaptured; break;
        case 3: phaseCb = doorPositionCaptured; break;
        case 4: phaseCb = poisCaptured; break;
        default: phaseCb = null;
    }
    script.worldQueryManager.manuallySnapCurrentScan(phaseCb);
};

//#endregion

//#region Door & Placement

function buildRotationForDoor(doorData) {
    var n = (doorData && doorData.normal ? doorData.normal : vec3.forward()).normalize();
    var worldUp = vec3.up();
    if (Math.abs(n.dot(worldUp)) > 0.99) { worldUp = vec3.right(); }

    var lookDir = n.cross(worldUp).normalize();
    var wallRot = quat.lookAt(lookDir, n);

    var fixStandUpright = quat.fromEulerAngles(-Math.PI / 2, 0, 0);
    var rot = wallRot.multiply(fixStandUpright);
    rot = rot.multiply(quat.fromEulerAngles(Math.PI / 2, 0, 0));

    return rot;
}

function createEscapeDoor(doorData) {
    escapeDoorObject = escapeDoor.instantiate(poiRoot);
    var rot = buildRotationForDoor(doorData);
    escapeDoorObject.getTransform().setWorldPosition(doorData.position);
    escapeDoorObject.getTransform().setWorldRotation(rot);
}

//#endregion

//#region Timer

var _runTimer = { isRunning: false, t0: 0 };

function startTimer() {
    _runTimer.t0 = getTime();
    _runTimer.isRunning = true;
}

function endTimer() {
    var elapsed = _runTimer.isRunning ? (getTime() - _runTimer.t0) : 0;
    _runTimer.isRunning = false;
    return elapsed;
}

function peekTimer() { return _runTimer.isRunning ? (getTime() - _runTimer.t0) : 0; }
function resetTimer() { _runTimer.isRunning = false; _runTimer.t0 = 0; }

global.startTimer = startTimer;
global.endTimer = endTimer;
global.peekTimer = peekTimer;
global.resetTimer = resetTimer;

//#endregion

//#region Procedural Game Setup

script.setupProceduralGame = function () {
    script.enableInteractors(false);
    if (!global.deviceInfoSystem.isEditor()) {
        script.worldQueryManager.stopRecording();
    }
    script.worldQueryManager.anchorVisualsRoot.enabled = false;

    script.roomAlreadyScanned = true;

    createEscapeDoor(worldQueryManager.exitDoor);

    var anchors = global.surfaceAnchors;
    if (!anchors || !anchors.length) { print("No anchors found"); return; }

    function allowRoomObject(obj){
        var ps = global && global.persistentStorage;
        if (!ps) { return true; }

        if (obj.id === "clock") {
            return typeof ps.hasPlayedFirstGame === "function" ? ps.hasPlayedFirstGame() : true;
        }

        if (obj.id === "codeSafe") {
            var played = typeof ps.hasPlayedFirstGame === "function" ? ps.hasPlayedFirstGame() : true;
            var rounds = typeof ps.getStat === "function" ? ps.getStat("roundPlayed") : 0;
            return played && rounds > 3;
        }

        return true;
    }

    var filteredRoomObjects = (script.roomObjects || []).filter(allowRoomObject);
    var groundPrefabs  = filteredRoomObjects.filter(function (o) { return o.objectType === "ground"; });
    var wallPrefabs    = filteredRoomObjects.filter(function (o) { return o.objectType === "wall"; });
    var ceilingPrefabs = filteredRoomObjects.filter(function (o) { return o.objectType === "ceiling"; });

    function shuffle(a){ for (var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } }
    shuffle(groundPrefabs); shuffle(wallPrefabs); shuffle(ceilingPrefabs);

    var wallAnchors    = anchors.filter(function (a) { return a.surfaceType === "wall"; });
    var groundAnchors  = anchors.filter(function (a) { return a.surfaceType === "ground"; });
    var ceilingAnchors = anchors.filter(function (a) { return a.surfaceType === "ceiling"; });
    shuffle(wallAnchors); shuffle(groundAnchors); shuffle(ceilingAnchors);

    var usedIds = {};
    function prune(list){ for (var i=list.length-1;i>=0;i--){ if (usedIds[list[i].id]) list.splice(i,1); } }
    function markUsed(prefab){ if (!prefab) return; usedIds[prefab.id]=true; prune(groundPrefabs); prune(wallPrefabs); prune(ceilingPrefabs); }

    function buildRotationForAnchor(anchor){
        if (!anchor || !anchor.surfaceType) return quat.identity();
        if (anchor.surfaceType === "ground") { var yaw = anchor.yaw || 0.0; var dir = new vec3(Math.sin(yaw),0,Math.cos(yaw)).normalize(); return quat.lookAt(dir, vec3.up()); }
        if (anchor.surfaceType === "ceiling"){ var yawC = anchor.yaw || 0.0; var dirC = new vec3(Math.sin(yawC),0,Math.cos(yawC)).normalize(); return quat.lookAt(dirC, vec3.down()); }
        if (anchor.surfaceType === "wall")   { var n = anchor.normal ? anchor.normal.normalize() : vec3.forward(); var up = Math.abs(n.dot(vec3.up()))>0.99?vec3.right():vec3.up(); var f = n.cross(up).normalize(); return quat.lookAt(f, n); }
        return quat.identity();
    }
    function popInRoomObject(sceneObject){
        if (!sceneObject || !sceneObject.getTransform) { return; }
        global.soundManager.playSound("synth", 1);
        var tr = sceneObject.getTransform();
        tr.setWorldScale(vec3.zero());
        var timeFn = (typeof getTime === "function") ? getTime : function(){ return Date.now() / 1000; };
        var start = timeFn();
        var duration = 0.25;
        var easeBackOut = function(t){
            var c1 = 1.70158;
            var c3 = c1 + 1.0;
            var p = t - 1.0;
            return 1.0 + c3 * p * p * p + c1 * p * p;
        };
        var ev = script.createEvent("UpdateEvent");
        ev.bind(function(){
            var now = timeFn();
            var k = (now - start) / duration;
            if (k < 0) { return; }
            if (k >= 1.0) {
                tr.setWorldScale(new vec3(1,1,1));
                ev.enabled = false;
                return;
            }
            var s = easeBackOut(k);
            tr.setWorldScale(new vec3(s,s,s));
        });
    }
    function spawnPrefabAtAnchor(prefab){
        return function(anchor){
            var so = prefab.objectPrefab.instantiate(script.poiRoot);
            so.getTransform().setWorldPosition(anchor.position);
            so.getTransform().setWorldRotation(buildRotationForAnchor(anchor));
            if (prefab && prefab.canAnimateScale) {
                popInRoomObject(so);
            }
            return so;
        }
    }

    function findPickupById(id){ for (var i=0;i<script.pickupObjects.length;i++){ if (script.pickupObjects[i].id===id) return script.pickupObjects[i]; } return null; }
    function getNotePrefab(){ for (var i=0;i<script.pickupObjects.length;i++){ if (script.pickupObjects[i].objectType==="note") return script.pickupObjects[i]; } return null; }
    function getKeyPrefab(id){ return findPickupById(id) || (function(){ for (var i=0;i<script.pickupObjects.length;i++){ if (script.pickupObjects[i].objectType==="key") return script.pickupObjects[i]; } return null; })(); }

    function normalizeClue(retVal){
        if (typeof retVal === "string") { var asPickup = findPickupById(retVal); if (asPickup) return {type:"item", itemId:retVal}; return {type:"note", text:retVal}; }
        if (retVal && typeof retVal === "object") { var iid = retVal.itemId || retVal.id; if (iid) return {type:"item", itemId:iid}; }
        return {type:"none"};
    }
    function callInitGetClue(sc){ if (sc && typeof sc.init==="function"){ return normalizeClue(sc.init()); } return {type:"none"}; }
    function itemsOnlyHorizontal(spot){ return spot && spot.orientation===0; }
    function isItemHolder(spot){ return spot && spot.objectType !== "deco" && spot.objectType !== "lore"; }

    function pushFreeSpots(spots, exclude, bucket, hostId){
        for (var i=0;i<spots.length;i++){
            var s = spots[i];
            if (!s.lockedSlot && s !== exclude) bucket.push({ spot: s, hostId: hostId });
        }
    }
    function removeSpotFromFreeList(spot, bucket){
        for (var i=0;i<bucket.length;i++){
            if (bucket[i].spot === spot){ bucket.splice(i,1); return; }
        }
    }

    function spawnPickupInSpot(prefabData, spot, asNote, payload){
        if (!prefabData || !spot) return null;
        var so = prefabData.objectPrefab.instantiate(spot.origin);
        so.getTransform().setLocalPosition(vec3.zero());
        so.getTransform().setLocalScale(new vec3(1,1,1));
        var sc = so.getComponent("Component.ScriptComponent");
        if (sc){ if (asNote){ if (typeof sc.isNote!=="undefined") sc.isNote=true; if (sc.noteTextComponent && typeof sc.noteTextComponent.text!=="undefined") sc.noteTextComponent.text=(payload||"").toString(); } else { if (typeof sc.isNote!=="undefined") sc.isNote=false; if (typeof sc.itemId!=="undefined") sc.itemId=payload; } }
        return so;
    }

    function placeClueIntoLockedSpot(clue, spots){
        for (var i=0;i<spots.length;i++){
            var sp=spots[i]; if (!sp.lockedSlot || !isItemHolder(sp)) continue;
            if (clue.type==="item"){ if (!itemsOnlyHorizontal(sp)) continue; var ip=findPickupById(clue.itemId)||getKeyPrefab(clue.itemId); if (!ip) continue; spawnPickupInSpot(ip, sp, false, clue.itemId); return sp; }
            if (clue.type==="note"){ var np=getNotePrefab(); if (!np) continue; spawnPickupInSpot(np, sp, true, clue.text); return sp; }
        }
        return null;
    }
    function placeClueIntoUnlockedSpot(clue, spots){
        for (var i=0;i<spots.length;i++){
            var sp=spots[i]; if (sp.lockedSlot || !isItemHolder(sp)) continue;
            if (clue.type==="item"){ if (!itemsOnlyHorizontal(sp)) continue; var ip=findPickupById(clue.itemId)||getKeyPrefab(clue.itemId); if (!ip) continue; spawnPickupInSpot(ip, sp, false, clue.itemId); return sp; }
            if (clue.type==="note"){ var np=getNotePrefab(); if (!np) continue; spawnPickupInSpot(np, sp, true, clue.text); return sp; }
        }
        return null;
    }

    function spawnAccepting(surface, incomingClue, mustBeLockedPrefab, placeIntoLocked){
        var list = surface==="wall"?wallPrefabs:groundPrefabs;
        var anchorsList = surface==="wall"?wallAnchors:groundAnchors;
        if (!anchorsList.length) return null;
        var idxs=[]; for (var i=0;i<list.length;i++){ if (!usedIds[list[i].id]) idxs.push(i); } shuffle(idxs);
        for (var k=0;k<idxs.length;k++){
            var prefab=list[idxs[k]]; if (typeof mustBeLockedPrefab==="boolean" && prefab.lockedItem!==mustBeLockedPrefab) continue;
            var anchor=anchorsList[0]; var so=spawnPrefabAtAnchor(prefab)(anchor); var sc=so.getComponent("Component.ScriptComponent"); var spots=sc?sc.itemSpots||[]:[];
            var usedSpot = placeIntoLocked?placeClueIntoLockedSpot(incomingClue, spots):placeClueIntoUnlockedSpot(incomingClue, spots);
            if (usedSpot){ markUsed(prefab); anchorsList.splice(0,1); var freeSpots=[]; pushFreeSpots(spots, placeIntoLocked?null:usedSpot, freeSpots, prefab.id); return {so:so, sc:sc, prefab:prefab, spots:spots, freeSpots:freeSpots, usedSpot:usedSpot}; }
            so.destroy();
        }
        return null;
    }
    function spawnPlain(surface, mustBeLocked){
        var list = surface==="wall"?wallPrefabs:groundPrefabs;
        var anchorsList = surface==="wall"?wallAnchors:groundAnchors;
        if (!anchorsList.length) return null;
        var idxs=[]; for (var i=0;i<list.length;i++){ if (!usedIds[list[i].id]) idxs.push(i); } shuffle(idxs);
        for (var k=0;k<idxs.length;k++){
            var prefab=list[idxs[k]]; if (typeof mustBeLocked==="boolean" && prefab.lockedItem!==mustBeLocked) continue;
            var anchor=anchorsList[0]; var so=spawnPrefabAtAnchor(prefab)(anchor); var sc=so.getComponent("Component.ScriptComponent"); var spots=sc?sc.itemSpots||[]:[];
            markUsed(prefab); anchorsList.splice(0,1); var freeSpots=[]; pushFreeSpots(spots, null, freeSpots, prefab.id); return {so:so, sc:sc, prefab:prefab, spots:spots, freeSpots:freeSpots};
        }
        return null;
    }
    function randInt(n){ return Math.floor(Math.random()*n); }

    var freeItemSpots = [];
    var remainingTips = (script.loadingTips || []).slice(); shuffle(remainingTips);
    var tipCooldown = 2.0;
    var lastTipTime = -1;
    function setPhaseTip(){
        if (!remainingTips.length) return;
        var now = (typeof getTime === "function") ? getTime() : 0;
        if (lastTipTime >= 0 && (now - lastTipTime) < tipCooldown) return;
        var tip = remainingTips.pop();
        lastTipTime = now;
        if (script.loadingTipText) script.loadingTipText.text = tip;
    }
    function setProgress(x){ if (script.uiViewController && typeof script.uiViewController.updateLoadProgress === "function"){ script.uiViewController.updateLoadProgress(x); } }

    var ceilPrefab, ceilAnchor, aPrefab, aSO, aSC, aSpots, aUsed, aSurface, clueA, recB, clueB, cSurface, recC, clueC, dSurface, recD;

    function hasUnspawnedLocked(list){
        for (var i=0;i<list.length;i++){ if (!usedIds[list[i].id] && list[i].lockedItem) return true; }
        return false;
    }
    function hasUnspawnedUnlocked(list){
        for (var i=0;i<list.length;i++){ if (!usedIds[list[i].id] && !list[i].lockedItem) return true; }
        return false;
    }
    function findHorizontalLockedSlot(spots){
        for (var i=0;i<spots.length;i++){ if (spots[i].lockedSlot && itemsOnlyHorizontal(spots[i])) return spots[i]; }
        return null;
    }
    function randomNoteText(){
        if (Math.random()<0.5){
            var len = 4 + Math.floor(Math.random()*3);
            var s = ""; for (var i=0;i<len;i++){ s += ""+Math.floor(Math.random()*10); }
            return s;
        } else {
            var hour = 1 + Math.floor(Math.random()*11);
            var mm = (Math.random()<0.5) ? "00" : "30";
            return hour + ":" + mm;
        }
    }
    function spawnDecoInSpot(deco, spot){
        var so = deco.objectPrefab.instantiate(spot.origin);
        so.getTransform().setLocalPosition(vec3.zero());
        var sc = so.getComponent("Component.ScriptComponent");
        if (deco.id === "noteDecoration" && sc && sc.noteTextComponent && typeof sc.noteTextComponent.text !== "undefined"){
            sc.noteTextComponent.text = randomNoteText();
        }
        return so;
    }
    function spawnLoreInSpot(lore, spot){
        var so = lore.objectPrefab.instantiate(spot.origin);
        so.getTransform().setLocalPosition(vec3.zero());
        so.getTransform().setLocalScale(new vec3(1,1,1));
        return so;
    }

    var delayFn = (global && global.utils && typeof global.utils.delay === "function") ? global.utils.delay : null;
    var delaySeconds = (loadTime && loadTime > 0) ? loadTime : 0;
    var spawnQueue = [];
    var completedSpawns = 0;
    var totalSpawns = 0;

    function recalcTotals(){ totalSpawns = completedSpawns + spawnQueue.length; }
    function updateProgress(){ recalcTotals(); var denom = totalSpawns > 0 ? totalSpawns : 1; setProgress(completedSpawns / denom); }
    function enqueueSpawn(fn){ if (typeof fn === "function"){ spawnQueue.push(fn); recalcTotals(); } }

    function queueDecorationsAndLore(){
        var decos = script.decoObjects || [];
        var usedCountById = {};
        function canUseDeco(deco){ var max = (typeof deco.maxCount === "number") ? deco.maxCount : 2; if (max <= 0) return false; var used = usedCountById[deco.id] || 0; return used < max; }
        function markDecoUsed(deco){ usedCountById[deco.id] = (usedCountById[deco.id] || 0) + 1; }

        shuffle(freeItemSpots);
        for (var i = 0; i < freeItemSpots.length; i++){
            var entry = freeItemSpots[i];
            var sp = entry.spot;
            if (sp.objectType === "lore") continue;
            var isDecoTarget = sp.objectType === "deco" || sp.objectType === "both";
            var isItemTarget = sp.objectType === "item" || sp.objectType === "both";
            var hostId = entry.hostId || null;

            var pool = [];
            for (var d = 0; d < decos.length; d++){
                var deco = decos[d];
                if (!canUseDeco(deco)) continue;
                if (deco.excludedObjects && hostId && deco.excludedObjects.indexOf(hostId) !== -1) continue;

                if (deco.id === "noteDecoration"){
                    if (!sp.lockedSlot && (isItemTarget || isDecoTarget)) pool.push(deco);
                } else {
                    if (isDecoTarget) pool.push(deco);
                }
            }

            if (!pool.length) continue;
            shuffle(pool);
            var chosen = pool[0];
            markDecoUsed(chosen);
            (function(decoChoice, spotRef){
                enqueueSpawn(function(){ spawnDecoInSpot(decoChoice, spotRef); });
            })(chosen, sp);
        }

        var loreList = script.loreObjects || [];
        var loreById = {};
        var allLoreIds = [];
        for (var li0 = 0; li0 < loreList.length; li0++){
            loreById[loreList[li0].id] = loreList[li0];
            allLoreIds.push(loreList[li0].id);
        }
        var loreWrappers = freeItemSpots.filter(function (e){ return !e.spot.lockedSlot && e.spot.objectType === "lore"; });
        shuffle(loreWrappers);

        var unseenIds = [];
        if (global && global.persistentStorage && typeof global.persistentStorage.checkLoreItemsNotSeen === "function") {
            var rawUnseen = global.persistentStorage.checkLoreItemsNotSeen() || [];
            for (var ui = 0; ui < rawUnseen.length; ui++){
                if (loreById[rawUnseen[ui]]) unseenIds.push(rawUnseen[ui]);
            }
        }

        function diff(a,b){ var setB = {}; for (var i1=0;i1<b.length;i1++) setB[b[i1]] = true; var out=[]; for (var j=0;j<a.length;j++){ if (!setB[a[j]]) out.push(a[j]); } return out; }
        shuffle(unseenIds);
        var remainingIds = diff(allLoreIds, unseenIds); shuffle(remainingIds);
        var candidateIds = unseenIds.concat(remainingIds);

        var spawnedLoreCount = 0;
        var usedLoreIds = {};

        function tryReserveLoreById(id){
            if (spawnedLoreCount >= 3) return false;
            if (usedLoreIds[id]) return false;
            var loreItem = loreById[id];
            if (!loreItem) return false;

            for (var si = 0; si < loreWrappers.length; si++){
                var w = loreWrappers[si];
                if (!w) continue;
                if (w.spot.orientation !== loreItem.orientation) continue;

                var chosenSpot = w.spot;
                loreWrappers.splice(si, 1);
                usedLoreIds[id] = true;
                spawnedLoreCount++;
                (function(loreChoice, spotRef){
                    enqueueSpawn(function(){ spawnLoreInSpot(loreChoice, spotRef); });
                })(loreItem, chosenSpot);
                return true;
            }
            return false;
        }

        for (var ci = 0; ci < candidateIds.length && spawnedLoreCount < 3; ci++){
            tryReserveLoreById(candidateIds[ci]);
        }
    }

    function finalizeSpawn(){
        setProgress(1.0);
        script.enableInteractors(true);
        script.currentPhase = 6;
        global.persistentStorage.increaseStat("roundPlayed");
        startTimer();
        uiGloves[0].enabled = false;
        uiGloves[1].enabled = false;
    }

    function runNextSpawn(){
        if (!spawnQueue.length){
            finalizeSpawn();
            return;
        }
        setPhaseTip();
        var fn = spawnQueue.shift();
        fn();
        completedSpawns++;
        updateProgress();

        if (!spawnQueue.length){
            finalizeSpawn();
            return;
        }

        if (delayFn){ delayFn(delaySeconds, runNextSpawn); }
        else { runNextSpawn(); }
    }

    enqueueSpawn(function(){
        if (ceilingPrefabs.length && ceilingAnchors.length){
            ceilPrefab = ceilingPrefabs[0]; ceilAnchor = ceilingAnchors[0];
            spawnPrefabAtAnchor(ceilPrefab)(ceilAnchor);
            markUsed(ceilPrefab); ceilingAnchors.splice(0,1);
        }
    });

    enqueueSpawn(function(){
        var canStartWall   = wallAnchors.length   > 0 && hasUnspawnedLocked(wallPrefabs);
        var canStartGround = groundAnchors.length > 0 && hasUnspawnedLocked(groundPrefabs);
        if (!canStartWall && !canStartGround) { print("No locked surface available for A"); return; }

        if (canStartWall && canStartGround) {
            aSurface = (Math.random() < 0.5) ? "wall" : "ground";
        } else {
            aSurface = canStartWall ? "wall" : "ground";
        }

        var aList    = aSurface === "wall" ? wallPrefabs   : groundPrefabs;
        var aAnchors = aSurface === "wall" ? wallAnchors   : groundAnchors;

        aPrefab = null;
        for (var iA = 0; iA < aList.length; iA++) {
            if (!usedIds[aList[iA].id] && aList[iA].lockedItem) { aPrefab = aList[iA]; break; }
        }
        if (!aPrefab) { print("No locked prefab on " + aSurface + " for A"); return; }

        aSO = spawnPrefabAtAnchor(aPrefab)(aAnchors[0]);
        aSC = aSO.getComponent("Component.ScriptComponent");
        markUsed(aPrefab);
        aAnchors.splice(0, 1);
        aSpots = aSC ? aSC.itemSpots || [] : [];
        aUsed = null;
        for (var sa = 0; sa < aSpots.length; sa++) {
            var spA = aSpots[sa];
            if (spA.lockedSlot && itemsOnlyHorizontal(spA)) {
                var goldKey = getKeyPrefab("goldKey");
                if (goldKey) {
                    spawnPickupInSpot(goldKey, spA, false, "goldKey");
                    aUsed = spA;
                }
                break;
            }
        }
        pushFreeSpots(aSpots, aUsed, freeItemSpots, aPrefab.id);
        clueA = callInitGetClue(aSC);
    });

    enqueueSpawn(function(){
        var preferred = (aSurface === "wall") ? "ground" : "wall";
        var other     = preferred === "wall" ? "ground" : "wall";

        recB = spawnAccepting(preferred, clueA, true, true);
        if (!recB) { recB = spawnAccepting(other, clueA, true, true); }
        if (!recB){ print("Could not spawn B that accepts clueA"); return; }

        pushFreeSpots(recB.spots, null, freeItemSpots, recB.prefab.id);
        clueB = callInitGetClue(recB.sc);
        if (clueB.type === "none"){ clueB = {type:"note", text:""+Math.floor(Math.random()*10)+Math.floor(Math.random()*10)+Math.floor(Math.random()*10)}; }
    });

    enqueueSpawn(function(){
        cSurface = wallAnchors.length && groundAnchors.length ? (Math.random()<0.5?"wall":"ground") : wallAnchors.length?"wall":groundAnchors.length?"ground":null;
        if (!cSurface) { print("No anchors for C"); return; }
        recC = spawnAccepting(cSurface, clueB, true, true) || spawnAccepting(cSurface==="wall"?"ground":"wall", clueB, true, true);
        if (!recC){ print("Could not spawn C that accepts clueB"); return; }
        pushFreeSpots(recC.spots, null, freeItemSpots, recC.prefab.id);
        clueC=callInitGetClue(recC.sc); if (clueC.type==="none"){ clueC={type:"note", text:""+Math.floor(Math.random()*10)+Math.floor(Math.random()*10)}; }
    });

    enqueueSpawn(function(){
        var dCanWall   = wallAnchors.length   > 0 && hasUnspawnedUnlocked(wallPrefabs);
        var dCanGround = groundAnchors.length > 0 && hasUnspawnedUnlocked(groundPrefabs);
        if (dCanWall && dCanGround)      dSurface = (Math.random() < 0.5) ? "wall" : "ground";
        else if (dCanWall)               dSurface = "wall";
        else if (dCanGround)             dSurface = "ground";
        else                             dSurface = wallAnchors.length ? "wall" : groundAnchors.length ? "ground" : null;
        if (!dSurface) { print("No anchors for D"); return; }
        recD = spawnPlain(dSurface, false) || spawnPlain(dSurface==="wall"?"ground":"wall", false);
        if (recD){ pushFreeSpots(recD.spots, null, freeItemSpots, recD.prefab.id); }

        var eligibleWrappers = freeItemSpots.filter(function (e) { return !e.spot.lockedSlot && e.spot.objectType !== "deco" && e.spot.objectType !== "lore"; });
        shuffle(eligibleWrappers);
        var placedFirstClue = null;
        if (clueC && clueC.type==="item"){
            for (var ei=0; ei<eligibleWrappers.length; ei++){
                if (!itemsOnlyHorizontal(eligibleWrappers[ei].spot)) continue;
                placedFirstClue = placeClueIntoUnlockedSpot(clueC, [eligibleWrappers[ei].spot]);
                if (placedFirstClue) break;
            }
        } else if (clueC){
            var spotsArr = eligibleWrappers.map(function(e){ return e.spot; });
            placedFirstClue = placeClueIntoUnlockedSpot(clueC, spotsArr);
        }
        if (placedFirstClue){ removeSpotFromFreeList(placedFirstClue, freeItemSpots); }

        if (recD && recD.sc) { callInitGetClue(recD.sc); }

        queueDecorationsAndLore();
    });

    updateProgress();
    runNextSpawn();
};

//#endregion

//#region Simulator Setup

script.simulatorSetup = function () {
    let ESCAPE_DOOR = {
        position: new vec3(-284.501, -179.093, -400.461),
        normal: new vec3(0.9999935626983643, -0.000025391578674316406, 0.0036014914512634277)
    };

    let EYE_HEIGHT = 0;
    let GROUND_HEIGHT = -179.443;

    global.surfaceAnchors = [
        {
            surfaceType: "wall",
            position: new vec3(-166.8561, -20, -503.5013),
            normal: new vec3(0, 0, 1)
        },
        {
            surfaceType: "ground",
            position: new vec3(-216.0770, -178.96, -264.4082),
            yaw: 0.97
        },
        {
            surfaceType: "wall",
            position: new vec3(-271.1248, -20, -114.1625),
            normal: new vec3(1, 0, 0)
        },
        {
            surfaceType: "ground",
            position: new vec3(-27.0081, -179.0913, -402.7913),
            yaw: -0.11
        },
        {
            surfaceType: "ceiling",
            position: new vec3(-105.0950, 121.1133, -350.5643),
            yaw: 0.41
        }
    ];

    worldQueryManager.groundHeight = GROUND_HEIGHT;
    global.groundHeight = GROUND_HEIGHT;
    worldQueryManager.eyeHeight = EYE_HEIGHT;
    worldQueryManager.exitDoor = ESCAPE_DOOR;

    script.isUsingEditorSetup = true;
    script.currentPhase = 4;
    script.uiViewController.proceedTap();
};

//#endregion

//#region Game Events

script.cleanWQM = function() {
    worldQueryManager.reset();
};

global.doorOpened = function(doorSceneObject) {
    uiGloves[0].enabled = true;
    uiGloves[1].enabled = true;

    global.persistentStorage.markFirstGamePlayed();
    menuButtons[0].enabled = false;
    menuButtons[1].enabled = true;

    var escapeTime = endTimer();
    escapeTime = escapeTime.toFixed(2);
    rounds = global.persistentStorage.getStat("roundPlayed");
    script.supabaseTable.tryUpdateScore(escapeTime, rounds, function(arg) {
        if (arg) {
            print("Score Written");
        } else {
            print("Score Failed");
        }
    });

    var isPersonalBest = false;
    if (escapeTime == global.persistentStorage.updateFastestEscapeIfBetter(parseFloat(escapeTime))) {
        isPersonalBest = true;
    }

    script.currentPhase = 7;
    uiViewController.doorOpened(doorSceneObject, escapeTime, isPersonalBest);
};

//#endregion

script.enableInteractors = function(state) {
    var value = state ? 500 : 0;
    handInteractors[0].setMaxRayDistance(value);
    handInteractors[1].setMaxRayDistance(value);
    mouseInteractor.setMaxRayDistance(value);
};

script.createEvent("OnStartEvent").bind(function() {
    print("Has user done a game: " + global.persistentStorage.hasPlayedFirstGame());
    if (global.persistentStorage.hasPlayedFirstGame()) {
        menuButtons[0].enabled = false;
        menuButtons[1].enabled = true;
    }
});

//#region Intro Sequence

var introSkipped = false;
var introCompleted = false;
var skipTweenPlayed = false;
var airPinchCount = 0;

var introRoot = script.introRoot;
var introRootT = introRoot.getTransform();
var introLabel = script.introLabel;
var introLogoMat = script.introLogoMaterial;
var introTableHint = script.introTableHint;
var introSkipHint = script.introSkipHint;

function scaleDownIntro(callback) {
    LSTween.scaleFromToLocal(introRootT, introRootT.getLocalScale(), vec3.zero(), 250)
        .easing(Easing.Back.In)
        .onComplete(callback)
        .start();
}

function introLogoSequence() {
    if (introSkipped) { return; }

    LSTween.textAlphaFromTo(introLabel, 0, 1, 2000)
        .easing(Easing.Circular.In)
        .start();

    global.utils.delay(1, function() {
        if (introSkipped) { return; }
        LSTween.alphaFromTo(introLogoMat, 0, 1, 2000)
            .easing(Easing.Circular.In)
            .start();

        global.utils.delay(3, function() {
            if (introSkipped) { return; }
            LSTween.textAlphaTo(introLabel, 0, 1000)
                .easing(Easing.Circular.Out)
                .start();

            LSTween.alphaTo(introLogoMat, 0, 1000)
                .easing(Easing.Circular.Out)
                .delay(500)
                .onComplete(function() {
                    if (introSkipped) { return; }

                    global.utils.delay(0.25, function() {
                        if (introSkipped) { return; }
                        LSTween.textAlphaFromTo(introTableHint, 0, 1, 1000)
                            .easing(Easing.Circular.In)
                            .onComplete(function() {
                                if (introSkipped) { return; }

                                global.utils.delay(1, function() {
                                    if (introSkipped) { return; }
                                    scaleDownIntro(function() {
                                        if (introSkipped) { return; }
                                        introCompleted = true;
                                        uiViewController.introDone();
                                    });
                                });
                            })
                            .start();
                    });
                })
                .start();
        });
    });
}

function skipIntro() {
    if (introSkipped || introCompleted) { return; }
    introSkipped = true;
    scaleDownIntro(function() {
        introCompleted = true;
        uiViewController.introDone();
    });
}

function checkAirPinchSkip() {
    if (introSkipped || introCompleted) { return; }
    var interactorList = SIK.InteractionManager.getTargetingInteractors();
    if (!interactorList || interactorList.length === 0) { return; }
    for (var i = 0; i < interactorList.length; i++) {
        var interactor = interactorList[i];
        if (!interactor) { continue; }
        if (interactor.previousTrigger === InteractorTriggerType.None &&
            interactor.currentTrigger !== InteractorTriggerType.None) {
            var hitInfo = interactor.targetHitInfo;
            var hasTarget = hitInfo && hitInfo.hit && hitInfo.hit.collider;
            if (!hasTarget) {
                airPinchCount++;
                if (airPinchCount === 1 && !skipTweenPlayed) {
                    skipTweenPlayed = true;
                    LSTween.textAlphaFromTo(introSkipHint, 0, 1, 250)
                        .easing(Easing.Circular.In)
                        .start();
                } else if (airPinchCount >= 2) {
                    skipIntro();
                }
                return;
            }
        }
    }
}

var introUpdateEvent = script.createEvent("UpdateEvent");
introUpdateEvent.bind(function() {
    checkAirPinchSkip();
});

introLogoSequence();

//#endregion
