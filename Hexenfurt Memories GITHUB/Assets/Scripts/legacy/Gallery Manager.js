
/*
@typedef loreClass
@property {Component.ScriptComponent} hangingScript
@property {int} offsetX
*/
//@input loreClass[] hangingLoreItems
/** @type {ScriptComponent[]} */
var hangingLoreItems = script.hangingLoreItems;

/*
@typedef statNoteTextClass
@property {string} statId {"label": "Stat ID"}
@property {Component.Text} textComponent
@property {string} suffix
@property {bool} isFloat
*/
//@input statNoteTextClass[] statNoteTexts
/** @type {Text[]} */
var statNoteTexts = script.statNoteTexts;

//@input Component.Text leaderboardRankText
/** @type {Text} */
var leaderboardRankText = script.leaderboardRankText;

//@input Component.ScriptComponent supabaseTable
/** @type {ScriptComponent} */
var supabaseTable = script.supabaseTable;

var loreLine = script.getSceneObject().getChild(0);
var transform = script.getSceneObject().getChild(0).getTransform();
script.hidden = true;
script.animating = false;

global.newlyAcquiredLore = null;

function enableCorrectLoreVisuals(loreList) {
    // Build a fast lookup set for seen lore IDs
    var seen = {};
    for (var i = 0; i < loreList.length; i++) {
        seen[loreList[i]] = true;
    }

    if (!hangingLoreItems || hangingLoreItems.length === 0) {
        print("enableCorrectLoreVisuals: no hangingLoreItems configured.");
        return;
    }

    for (var h = 0; h < hangingLoreItems.length; h++) {
        var entry = hangingLoreItems[h];
        if (!entry || !entry.hangingScript) {
            print("enableCorrectLoreVisuals: missing hangingScript at index " + h);
            continue;
        }

        var hs = entry.hangingScript;
        var so = hs.getSceneObject();
        var loreId = hs.loreId;

        if (!so) {
            print("enableCorrectLoreVisuals: scene object missing at index " + h);
            continue;
        }

        // Resolve the visual: getChild(0).getChild(1)
        var visual = null;
        try {
            var c0 = so.getChild(0);
            if (!c0) { throw "Missing child(0)"; }
            visual = c0.getChild(1);
            if (!visual) { throw "Missing child(1)"; }
        } catch (e) {
            print("enableCorrectLoreVisuals: can't resolve visual for index " + h + " (" + e + ")");
            continue;
        }

        var shouldEnable = !!seen[loreId];
        if (visual.enabled !== shouldEnable) {
            if(!shouldEnable) {
                entry.hangingScript.stopHanging();
                entry.hangingScript.enabled = false;
            }
            visual.enabled = shouldEnable;
        }

        // Optional: debug
        // print("Lore [" + loreId + "] seen=" + shouldEnable + " -> visual.enabled=" + visual.enabled);
    }
}


function loadDataFromStorage() {
    var loreList = global.persistentStorage.getSeenLoreList();
    enableCorrectLoreVisuals(loreList);

    var stats = global.persistentStorage.getAllStats();
    for(let l = 0; l < statNoteTexts.length; l++) {
        var statLoaded = stats[statNoteTexts[l].statId];
        if(statNoteTexts[l].isFloat) {
        statNoteTexts[l].textComponent.text = statLoaded.toFixed(2).toString() + statNoteTexts[l].suffix;
        } else {
        statNoteTexts[l].textComponent.text = statLoaded.toString() + statNoteTexts[l].suffix;

        }
        print(statLoaded.toString())
    }
    print("Loaded data!");

    checkRank();

    function checkRank() {
        script.supabaseTable.tryRetrieveRank(function(arg) {
            if(!arg) {
                print("Error getting Rank.");
                leaderboardRankText.text = "UNAVAILABLE"
                global.utils.delay(2.5, checkRank);
            } else {
                leaderboardRankText.text = "#" + arg.toString();
            }
        });
    }
}

// --- Helpers to jump to a lore item by its loreId ---
function findIndexByLoreId(loreId) {
    if (!loreId || !hangingLoreItems || hangingLoreItems.length === 0) { return -1; }
    for (var i = 0; i < hangingLoreItems.length; i++) {
        var entry = hangingLoreItems[i];
        if (!entry || !entry.hangingScript) { continue; }
        if (entry.hangingScript.loreId === loreId) { return i; }
    }
    return -1;
}

function goToLoreId(loreId, isNew) {
    var idx = findIndexByLoreId(loreId);
    if (idx >= 0) {
        goToIndex(idx, isNew);
        return true;
    }
    return false;
}

global.showCompendium = function() {
    if (script.animating) return;
    script.animating = true;

    loreLine.enabled = true;
    loadDataFromStorage();

    var newPos = new vec3(0, 0, 0);
    global.utils.animatePosition(script.getSceneObject().getChild(0), true, newPos, 0.5, function() {
        script.animating = false;
        script.hidden = false;

        if (global.newlyAcquiredLore) {
            // Animate to the corresponding offsetX for the new lore
            var jumped = goToLoreId(global.newlyAcquiredLore, true);

            // Optional: if you have a highlight tween on the hanging script, trigger it
            // if (jumped) {
            //     var hs = hangingLoreItems[currentIndex].hangingScript;
            //     if (hs && hs.playNewlyAcquiredTween) { hs.playNewlyAcquiredTween(); }
            // }

            // Clear so it won't re-trigger on next open
            global.newlyAcquiredLore = null;
        }
    });
};

global.hideCompendium = function() {
    script.animating = true;
    script.hidden = true;
    currentIndex = 0

    var currentPos = transform.getLocalPosition();
    var newPos = new vec3(0, 60, 0)

    global.utils.animatePosition(script.getSceneObject().getChild(0), true, newPos, 0.5, function() {
        loreLine.enabled = false;
        script.animating = false;
    })
}

//@input float scrollDuration = 0.5 {"label":"Scroll Duration (s)"}

var currentIndex = 0;

function wrapIndex(i, n) {
    return (i % n + n) % n;
}

function goToIndex(i, isNew) {
    if (!hangingLoreItems || hangingLoreItems.length === 0) {
        return;
    }
    script.animating = true;
    currentIndex = wrapIndex(i, hangingLoreItems.length);

    // Target X from data; keep current Y/Z
    var targetX = hangingLoreItems[currentIndex].offsetX;
    var lp = transform.getLocalPosition();
    var targetPos = new vec3(-targetX, lp.y, lp.z);

    global.soundManager.playSound("loreSlide", 1);
    global.utils.animatePosition(script.getSceneObject().getChild(0), true, targetPos, script.scrollDuration || 0.5, function () {
        script.animating = false;
        if(isNew) {
            global.soundManager.playSound("loreInspect", 1);
        }
    });
}

script.nextItem = function () {
    if(script.hidden || script.animating) return;
    goToIndex(currentIndex + 1);
};

script.prevItem = function () {
    if(script.hidden || script.animating) return;
    goToIndex(currentIndex - 1);
};