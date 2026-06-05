// @ui {"widget":"group_start", "label":"‎<font color='white'>Core</font>"}
// @input Component.ScriptComponent logic
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Doors</font>"}
//@input SceneObject introDoor
//@input SceneObject outroDoor
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>UI Elements</font>"}
//@input Asset.Material loadingBarMaterial
// @input Component.Text endingTimeText
//@input SceneObject endingPbFlag
//@input SceneObject leaderboardHint
//@input SceneObject archiveHighlight
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Pinch Hold</font>"}
//@input Asset.Material holdRadialMaterial
//@input float totalHoldTime = 2.0 {"label":"Hold to Fill (s)"}
// @ui {"widget":"group_end"}

var logic = script.logic;
var loadingBarMaterial = script.loadingBarMaterial;
var endingTimeText = script.endingTimeText;
var introDoor = script.introDoor;
var outroDoor = script.outroDoor;
var endingPbFlag = script.endingPbFlag;
var leaderboardHint = script.leaderboardHint;
var holdRadialMaterial = script.holdRadialMaterial;
var totalHoldTime = (typeof script.totalHoldTime === "number" && script.totalHoldTime > 0) ? script.totalHoldTime : 2.0;
var archiveHighlight = script.archiveHighlight;

const SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
const InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;

var SETUP_VIEW_ID = "setupView";
var HOLD_DELAY = 0.3;

script.currentView = "menuView";
script.canHold = false;

var leaderboardHintAlreadyDisplayed = false;
var lbHintActive = false;

//#region View Transitions

script.setupAgain = function() {
    logic.cleanWQM();
    logic.roomAlreadyScanned = false;
    script.startTap();
};

script.directPlay = function() {
    logic.currentPhase = 4;
    script.proceedTap();
};

script.startTap = function() {
    if (lbHintActive) return;

    global.utils.delay(0.2, function() {
        global.soundManager.playSound("doorSlam", 1);
    });
    // global.tweenManager.startTween(introDoor, "intro_door_slam", function() {
        global.utils.delay(0.25, function() {
            if (logic.roomAlreadyScanned) {
                global.uiKitDirector.transition("menuView", "scanAgainView", 0.2, function() {
                    script.currentView = "scanAgainView";
                    // global.tweenManager.resetObject(introDoor, "intro_door_slam");
                });
            } else {
                global.uiKitDirector.transition(script.currentView, SETUP_VIEW_ID, 0.2, function() {
                    script.currentView = SETUP_VIEW_ID;
                    script.canHold = false;
                    logic.nextPhase();
                    // global.tweenManager.resetObject(introDoor, "intro_door_slam");
                });
            }
        });
    // });
};

script.recordedData = function() {
    script.canHold = true;
};

script.recordTap = function() {
    logic.recordTap();
};

script.removedAnchor = function() {
    script.canHold = false;
};

script.proceedTap = function() {
    if (!logic.isUsingEditorSetup) {
        if (!logic.checkCurrentPhaseData()) return;
    }

    var nextView = logic.returnNextPhaseView();
    if (nextView === "gameView") {
        if (logic.isUsingEditorSetup) {
            global.utils.delay(0.2, function() {
                global.soundManager.playSound("doorSlam", 1);
            });
            // global.tweenManager.startTween(introDoor, "intro_door_slam", function() {
                global.utils.delay(0.25, function() {
                    global.uiKitDirector.transition(script.currentView, "loadingView", 0.2, function() {
                        script.currentView = "loadingView";
                        // global.tweenManager.resetObject(introDoor, "intro_door_slam");
                    });
                    logic.setupProceduralGame();
                    logic.nextPhase();
                });
            // });
        } else {
            global.uiKitDirector.transition(script.currentView, "loadingView", 0.2, function() {
                script.currentView = "loadingView";
                // global.tweenManager.resetObject(introDoor, "intro_door_slam");
            });
            logic.setupProceduralGame();
            logic.nextPhase();
            return;
        }
    }

    script.canHold = false;
    logic.nextPhase();
};

//#endregion

//#region Loading Bar

var chaseProgress = 0;
var loadEvent = script.createEvent("UpdateEvent");
loadEvent.enabled = false;
loadEvent.bind(function() {
    loadingBarMaterial.mainPass.progress = global.utils.lerp(loadingBarMaterial.mainPass.progress, chaseProgress, 0.1);
    if (loadingBarMaterial.mainPass.progress > 0.98) {
        global.uiKitDirector.newWorldScale(script.currentView, new vec3(0, 0, 0), 0.2, function() {
            global.uiKitDirector.toggleUIComposite(script.currentView, false);
        });
        loadingBarMaterial.mainPass.progress = 0;
        chaseProgress = 0;
        loadEvent.enabled = false;
    }
});

script.updateLoadProgress = function(progress) {
    loadEvent.enabled = true;
    chaseProgress = progress;
};

//#endregion

//#region Game End & Menu

function scaleDownPoiChildrenThenClear(root) {
    if (!root || !root.getChildrenCount) {
        if (global.utils && global.utils.removeAllChildren) { global.utils.removeAllChildren(root); }
        return;
    }
    var count = root.getChildrenCount();
    if (count === 0) {
        if (global.utils && global.utils.removeAllChildren) { global.utils.removeAllChildren(root); }
        return;
    }

    var entries = [];
    for (var i = 0; i < count; i++) {
        var child = root.getChild(i);
        if (!child || !child.getTransform) { continue; }
        var tr = child.getTransform();
        entries.push({ tr: tr, base: tr.getWorldScale() });
    }

    if (!entries.length) {
        if (global.utils && global.utils.removeAllChildren) { global.utils.removeAllChildren(root); }
        return;
    }

    var timeFn = (typeof getTime === "function") ? getTime : function() { return Date.now() / 1000; };
    var start = timeFn();
    var duration = 0.25;
    var overshoot = 0.12;

    function animateEntryAt(index) {
        if (index >= entries.length) {
            if (global.utils && global.utils.removeAllChildren) { global.utils.removeAllChildren(root); }
            return;
        }

        var entry = entries[index];
        if (!entry || !entry.tr || !entry.base) {
            animateEntryAt(index + 1);
            return;
        }

        start = timeFn();
        if (global.soundManager && typeof global.soundManager.playSound === "function") {
            global.soundManager.playSound("synth", 1);
        }

        var ev = script.createEvent("UpdateEvent");
        ev.bind(function() {
            var now = timeFn();
            var k = (now - start) / duration;
            if (k < 0) { return; }
            if (k >= 1) {
                entry.tr.setWorldScale(new vec3(0, 0, 0));
                ev.enabled = false;
                start = timeFn();
                animateEntryAt(index + 1);
                return;
            }
            var factor = (1 + overshoot * (1 - k)) * (1 - k);
            entry.tr.setWorldScale(new vec3(entry.base.x * factor, entry.base.y * factor, entry.base.z * factor));
        });
    }

    start = timeFn();
    animateEntryAt(0);
}

script.doorOpened = function(escapeDoorObject, withTime, isPersonalBest) {
    // global.tweenManager.resetObject(outroDoor, "outro_door_slam");

    global.utils.delay(2, function() {
        global.soundManager.playSpatialSound(escapeDoorObject, "witchLaugh", 1, 1);
        // global.tweenManager.startTween(escapeDoorObject, "close_door");
        // global.tweenManager.startTween(outroDoor, "outro_door_slam", function() {
            global.utils.delay(0.25, function() {
                script.enableMenuButton();
                global.soundManager.stopSpatialSoundById("fanLoop");
                global.soundManager.stopSpatialSoundById("fireLoop");
                global.soundManager.stopSpatialSoundById("clockTickLoop");
                scaleDownPoiChildrenThenClear(logic.poiRoot);
                script.currentPhase = 0;
                global.inventory.reset();
                escapeDoorObject = null;
            });
        // });
        global.soundManager.playSound("doorSlam", 1);
    });

    endingPbFlag.enabled = isPersonalBest;
    endingTimeText.text = withTime + "s";
    global.uiKitDirector.toggleButtonState("gameEndedView", 0, false);
    global.uiKitDirector.transition(script.currentView, "gameEndedView", 0.2, function() {
        global.uiKitDirector.toggleButtonState("gameEndedView", 0, false);
        script.currentView = "gameEndedView";
    });
};

script.enableMenuButton = function() {
    global.uiKitDirector.toggleButtonState("gameEndedView", 0, true);
};

script.openCompendium = function() {
    if (lbHintActive) return;
    global.uiKitDirector.transition(script.currentView, "galleryView", 0.2, function() {
        script.currentView = "galleryView";
    });
    global.showCompendium();
    global.soundManager.playSound("loreSlide", 1);
};

script.closeCompendium = function() {
    global.hideCompendium();
    global.soundManager.playSound("loreSlide", 1);
    global.soundManager.playSound("choir", 1);
    global.uiKitDirector.transition(script.currentView, "menuView", 0.2, function() {
        script.currentView = "menuView";
    });
};

script.dismissLeaderboard = function() {
    if (!lbHintActive) return;
    lbHintActive = false;
    // global.tweenManager.startTween(leaderboardHint, "hide", function() {
        lbHintActive = false;
    // });
};

script.backToMenu = function() {
    if (!leaderboardHintAlreadyDisplayed) {
        global.tweenManager.startTween(leaderboardHint, "show", function() {
            lbHintActive = true;
        });
    }
    leaderboardHintAlreadyDisplayed = true;

    global.soundManager.playSound("choir", 1);
    global.uiKitDirector.transition(script.currentView, "menuView", 0.2, function() {
        script.currentView = "menuView";
    });
};

//#endregion

//#region Pinch Hold

var _holdArmed = false;
var _holdStart = 0.0;
var _waitForRelease = false;
var _progress = 0.0;

function setRadialProgress01(v) {
    _progress = Math.max(0, Math.min(1, v));
    if (holdRadialMaterial && holdRadialMaterial.mainPass) {
        holdRadialMaterial.mainPass.progress = _progress;
    }
}

function isPinchDownInAir(primaryInteractor) {
    if (!primaryInteractor) { return false; }

    var pinchDown = (primaryInteractor.currentTrigger !== InteractorTriggerType.None);
    var inAir =
        (primaryInteractor.targetHitInfo == null) ||
        (primaryInteractor.targetHitInfo.hit &&
         primaryInteractor.targetHitInfo.hit.collider &&
         primaryInteractor.targetHitInfo.hit.collider.getSceneObject() &&
         primaryInteractor.targetHitInfo.hit.collider.getSceneObject().name == "Setup View");

    return pinchDown && inAir;
}

function updatePinchHold() {
    archiveHighlight.enabled = (global.newlyAcquiredLore != null);

    if (!script.canHold) {
        _holdArmed = false;
        _waitForRelease = false;
        setRadialProgress01(0);
        return;
    }

    var list = SIK.InteractionManager.getTargetingInteractors();
    var primaryInteractor = list && list.length ? list[0] : null;
    var now = getTime();

    if (isPinchDownInAir(primaryInteractor)) {
        if (!_holdArmed || (primaryInteractor && primaryInteractor.previousTrigger === InteractorTriggerType.None)) {
            _holdArmed = true;
            if (!_waitForRelease) {
                _holdStart = now;
                setRadialProgress01(0);
            }
        }

        if (_holdArmed && !_waitForRelease) {
            var elapsed = now - _holdStart;
            var effectiveFillTime = Math.max(0.001, totalHoldTime - HOLD_DELAY);

            if (elapsed < HOLD_DELAY) {
                setRadialProgress01(0);
            } else {
                var p = Math.min((elapsed - HOLD_DELAY) / effectiveFillTime, 1.0);
                setRadialProgress01(p);

                if (p >= 1.0) {
                    _waitForRelease = true;
                    setRadialProgress01(1.0);
                    script.proceedTap();
                }
            }
        }
    } else {
        _holdArmed = false;
        if (_waitForRelease) {
            _waitForRelease = false;
        }
        setRadialProgress01(0);
    }
}

var pinchHoldUpdate = script.createEvent("UpdateEvent");
pinchHoldUpdate.bind(updatePinchHold);

//#endregion

//#region Init

script.createEvent("OnStartEvent").bind(function() {
    global.uiKitDirector.newWorldScale("menuView", new vec3(0, 0, 0), 0.2, function() {
        global.uiKitDirector.toggleUIComposite("menuView", false);
    });
});

script.introDone = function() {
    global.uiKitDirector.toggleUIComposite("menuView", true);
    global.uiKitDirector.newWorldScale("menuView", new vec3(1, 1, 1), 0.2, function() {
        print("Intro Done");
    });
};

//#endregion
